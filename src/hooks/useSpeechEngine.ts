import { useCallback, useEffect, useRef, useState } from 'react';
import { AI_VOICE_PACK } from '../data/voicePacks';
import type { AndroidAppConfig, PronunciationRule, VoiceSettings } from '../types/synth';
import {
  applyPronunciationRules,
  getAndroidNativeTtsBridge,
  getCapacitorTtsPlugin,
  isStaticHostingEnvironment,
  postApiJson,
  splitIntoSpeechChunks,
  triggerHaptic,
} from '../utils/androidHelpers';
import {
  audioBufferToWavBlob,
  renderDspSpeechBuffer,
  splitTextForFastDspChunks,
} from '../utils/dspFormantEngine';

export type PlaybackStatus = 'idle' | 'rendering' | 'speaking' | 'paused';

const AI_LOCAL_PROFILES: Record<
  string,
  Pick<VoiceSettings, 'dspTimbre' | 'dspBaseFreq' | 'pitch' | 'rate' | 'dspVibrato' | 'dspEcho'>
> = {
  'clara-jornal': { dspTimbre: 'natural', dspBaseFreq: 190, pitch: 1.05, rate: 1.04, dspVibrato: 0.0, dspEcho: 0.0 },
  'lucas-dinamico': { dspTimbre: 'natural', dspBaseFreq: 132, pitch: 1.0, rate: 1.08, dspVibrato: 0.0, dspEcho: 0.0 },
  'bruno-doc': { dspTimbre: 'deep', dspBaseFreq: 98, pitch: 0.92, rate: 0.96, dspVibrato: 0.0, dspEcho: 0.0 },
  'rafael-epico': { dspTimbre: 'deep', dspBaseFreq: 104, pitch: 0.94, rate: 0.98, dspVibrato: 0.0, dspEcho: 0.0 },
  'sofia-suave': { dspTimbre: 'natural', dspBaseFreq: 200, pitch: 1.06, rate: 1.0, dspVibrato: 0.0, dspEcho: 0.0 },
  'helena-livro': { dspTimbre: 'natural', dspBaseFreq: 184, pitch: 1.03, rate: 0.97, dspVibrato: 0.0, dspEcho: 0.0 },
  'mateus-podcast': { dspTimbre: 'natural', dspBaseFreq: 126, pitch: 0.98, rate: 1.05, dspVibrato: 0.0, dspEcho: 0.0 },
  'beatriz-ura': { dspTimbre: 'natural', dspBaseFreq: 194, pitch: 1.05, rate: 1.02, dspVibrato: 0.0, dspEcho: 0.0 },
  'diogo-radio': { dspTimbre: 'radio', dspBaseFreq: 138, pitch: 1.02, rate: 1.1, dspVibrato: 0.0, dspEcho: 0.0 },
  'valentina-asmr': { dspTimbre: 'whisper', dspBaseFreq: 170, pitch: 1.02, rate: 0.92, dspVibrato: 0.0, dspEcho: 0.0 },
};

function mapAiVoiceToLocalSettings(aiVoiceId: string, base: VoiceSettings): VoiceSettings {
  const profile = AI_LOCAL_PROFILES[aiVoiceId];
  if (!profile) return base;
  return {
    ...base,
    ...profile,
  };
}

interface UseSpeechEngineArgs {
  settings: VoiceSettings;
  rules: PronunciationRule[];
  androidConfig: AndroidAppConfig;
  onVoiceAutoSelect?: (voiceURI: string) => void;
  onSpokenComplete?: (text: string) => void;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function useSpeechEngine({
  settings,
  rules,
  androidConfig,
  onVoiceAutoSelect,
  onSpokenComplete,
}: UseSpeechEngineArgs) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [activeChunkText, setActiveChunkText] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const cancelledRef = useRef(false);
  const pausedRef = useRef(false);
  const pauseTimerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const progIntervalRef = useRef<number | null>(null);
  const lastRenderedWavRef = useRef<{ cacheKey: string; blob: Blob } | null>(null);

  // Discover Android system TTS voices reliably and immediately
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const loadVoices = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) {
        const sorted = [...list].sort((a, b) => {
          const aPt = a.lang.toLowerCase().startsWith('pt') ? 0 : 1;
          const bPt = b.lang.toLowerCase().startsWith('pt') ? 0 : 1;
          if (aPt !== bPt) return aPt - bPt;
          return a.name.localeCompare(b.name);
        });
        setVoices(sorted);

        if (!settings.selectedVoiceURI && onVoiceAutoSelect) {
          const bestPtBr =
            sorted.find((v) => v.lang.toLowerCase() === 'pt-br') ||
            sorted.find((v) => v.lang.toLowerCase().startsWith('pt')) ||
            sorted[0];
          if (bestPtBr) {
            onVoiceAutoSelect(bestPtBr.voiceURI);
          }
        }
      }
    };

    loadVoices();
    const synth = window.speechSynthesis;
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', loadVoices);
    }
    const t1 = window.setTimeout(loadVoices, 200);
    const t2 = window.setTimeout(loadVoices, 800);

    return () => {
      if (typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', loadVoices);
      }
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onVoiceAutoSelect, settings.selectedVoiceURI]);

  const ensureUnlockedAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch {
      // Ignore wakeLock release errors
    }
  }, []);

  const acquireWakeLock = useCallback(async () => {
    if (!androidConfig.keepScreenAwake) return;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch {
      // Ignore if battery saver blocks WakeLock
    }
  }, [androidConfig.keepScreenAwake]);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    pausedRef.current = false;

    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }

    if (progIntervalRef.current !== null) {
      window.clearInterval(progIntervalRef.current);
      progIntervalRef.current = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    }

    const androidBridge = getAndroidNativeTtsBridge();
    if (androidBridge?.stop) {
      try {
        androidBridge.stop();
      } catch {
        // Ignore bridge stop failure
      }
    }

    const capTts = getCapacitorTtsPlugin();
    if (capTts?.stop) {
      void capTts.stop().catch(() => {});
    }

    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
        activeSourceRef.current.disconnect();
      } catch {
        // Ignore already stopped source
      }
      activeSourceRef.current = null;
    }

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }

    setAnalyserNode(null);
    setStatus('idle');
    setActiveChunkText('');
    setProgressPct(0);
    releaseWakeLock();
    triggerHaptic(10, androidConfig.hapticsEnabled);
  }, [androidConfig.hapticsEnabled, releaseWakeLock]);

  const pause = useCallback(() => {
    if (status !== 'speaking') return;
    pausedRef.current = true;

    if (settings.engineMode === 'native-tts' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
    } else if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      void audioCtxRef.current.suspend();
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
    setStatus('paused');
    triggerHaptic(10, androidConfig.hapticsEnabled);
  }, [androidConfig.hapticsEnabled, settings.engineMode, status]);

  const resume = useCallback(() => {
    if (status !== 'paused') return;
    pausedRef.current = false;

    if (settings.engineMode === 'native-tts' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    } else if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume();
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    setStatus('speaking');
    triggerHaptic(10, androidConfig.hapticsEnabled);
  }, [androidConfig.hapticsEnabled, settings.engineMode, status]);

  const playSingleBuffer = useCallback(
    async (
      buffer: AudioBuffer,
      labelText: string,
      subtitle: string,
      volume: number,
      progressBase: number,
      progressSpan: number
    ): Promise<void> => {
      const ctx = ensureUnlockedAudioContext();
      if (!ctx) {
        throw new Error('Áudio indisponível neste aparelho.');
      }
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (cancelledRef.current) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = ctx.createGain();
      gainNode.gain.value = Math.min(1, Math.max(0.08, volume));

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;

      source.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(ctx.destination);

      activeSourceRef.current = source;
      setAnalyserNode(analyser);
      setStatus('speaking');
      setActiveChunkText(labelText);

      if (androidConfig.mediaSessionEnabled && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: subtitle,
          artist: androidConfig.appName,
          album: 'VozSynth Android',
        });
        navigator.mediaSession.playbackState = 'playing';
      }

      const durationMs = Math.max(180, buffer.duration * 1000);
      let activeElapsedMs = 0;
      let lastTickAt = performance.now();

      if (progIntervalRef.current !== null) {
        window.clearInterval(progIntervalRef.current);
      }
      progIntervalRef.current = window.setInterval(() => {
        const now = performance.now();
        if (cancelledRef.current) {
          if (progIntervalRef.current !== null) window.clearInterval(progIntervalRef.current);
          return;
        }
        if (!pausedRef.current) {
          activeElapsedMs += now - lastTickAt;
          const localPct = Math.min(1, activeElapsedMs / durationMs);
          setProgressPct(Math.min(99, Math.round(progressBase + localPct * progressSpan)));
        }
        lastTickAt = now;
      }, 60);

      await new Promise<void>((resolve) => {
        source.onended = () => {
          if (progIntervalRef.current !== null) {
            window.clearInterval(progIntervalRef.current);
            progIntervalRef.current = null;
          }
          if (activeSourceRef.current === source) {
            activeSourceRef.current = null;
          }
          resolve();
        };
        source.start(0);
      });
    },
    [androidConfig.appName, androidConfig.mediaSessionEnabled, ensureUnlockedAudioContext]
  );

  const speakDspFormant = useCallback(
    async (rawText: string, effSettings: VoiceSettings, customLabel?: string) => {
      const processed = applyPronunciationRules(rawText, rules);
      const chunks = splitTextForFastDspChunks(processed);
      if (chunks.length === 0) {
        setStatus('idle');
        return;
      }

      setStatus('rendering');
      setActiveChunkText(customLabel || 'Iniciando voz...');
      setProgressPct(5);

      try {
        // Pipeline rendering: render chunk 0 immediately (~35ms), pre-render chunk i+1 while chunk i plays!
        let nextBufferPromise: Promise<AudioBuffer> | null = renderDspSpeechBuffer(
          chunks[0],
          effSettings
        );

        for (let i = 0; i < chunks.length; i++) {
          if (cancelledRef.current) break;

          const currentBuffer = await nextBufferPromise!;
          if (cancelledRef.current) break;

          // Pre-render the next chunk in background while the current chunk is playing
          nextBufferPromise =
            i + 1 < chunks.length
              ? renderDspSpeechBuffer(chunks[i + 1], effSettings)
              : null;

          const base = (i / chunks.length) * 100;
          const span = 100 / chunks.length;
          const label = customLabel
            ? `${customLabel} · ${chunks[i]}`
            : chunks[i];

          await playSingleBuffer(
            currentBuffer,
            label,
            customLabel || `Voz Local · ${effSettings.dspTimbre}`,
            effSettings.volume,
            base,
            span
          );
        }

        if (!cancelledRef.current) {
          onSpokenComplete?.(rawText);
        }
      } catch {
        setErrorMsg('Não foi possível sintetizar o áudio neste aparelho.');
      } finally {
        setAnalyserNode(null);
        setStatus('idle');
        setActiveChunkText('');
        setProgressPct(0);
        releaseWakeLock();
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'none';
        }
      }
    },
    [onSpokenComplete, playSingleBuffer, releaseWakeLock, rules]
  );

  const speakNativeTts = useCallback(
    async (rawText: string, effSettings: VoiceSettings, customLabel?: string) => {
      const processed = applyPronunciationRules(rawText, rules);
      const chunks = splitIntoSpeechChunks(processed, effSettings.pauseBetweenSentencesMs);
      if (chunks.length === 0) {
        setStatus('idle');
        return;
      }

      // 1) Native Android JavaScriptInterface bridge (MainActivity.kt -> android.speech.tts.TextToSpeech)
      const androidBridge = getAndroidNativeTtsBridge();
      if (androidBridge) {
        setStatus('speaking');
        setProgressPct(15);
        setActiveChunkText(customLabel ? `${customLabel} · ${processed}` : processed);
        const started = androidBridge.speak(processed, effSettings.rate, effSettings.pitch);
        if (started) {
          const approxMs = Math.max(800, Math.min(20000, (processed.length * 68) / effSettings.rate));
          await new Promise<void>((resolve) => {
            pauseTimerRef.current = window.setTimeout(() => {
              pauseTimerRef.current = null;
              resolve();
            }, approxMs);
          });
          if (!cancelledRef.current) {
            onSpokenComplete?.(rawText);
          }
          setStatus('idle');
          setActiveChunkText('');
          setProgressPct(0);
          releaseWakeLock();
          return;
        }
      }

      // 2) Native Capacitor TextToSpeech plugin
      const capTts = getCapacitorTtsPlugin();
      if (capTts) {
        setStatus('speaking');
        setProgressPct(8);
        const speechTotal = chunks.filter((c) => c.type === 'speech').length || 1;
        let done = 0;
        try {
          for (const chunk of chunks) {
            if (cancelledRef.current) break;
            if (chunk.type === 'pause') {
              await new Promise<void>((resolve) => {
                pauseTimerRef.current = window.setTimeout(() => {
                  pauseTimerRef.current = null;
                  resolve();
                }, chunk.pauseMs || 300);
              });
              continue;
            }
            const chunkText = chunk.text || '';
            setActiveChunkText(customLabel ? `${customLabel} · ${chunkText}` : chunkText);
            await capTts.speak({
              text: chunkText,
              lang: 'pt-BR',
              rate: effSettings.rate,
              pitch: effSettings.pitch,
              volume: effSettings.volume,
              category: 'ambient',
            });
            done += 1;
            setProgressPct(Math.round((done / speechTotal) * 100));
          }
          if (!cancelledRef.current) {
            onSpokenComplete?.(rawText);
          }
          setStatus('idle');
          setActiveChunkText('');
          setProgressPct(0);
          releaseWakeLock();
          return;
        } catch {
          if (cancelledRef.current) return;
        }
      }

      // 3) Android System Speech API (try even if getVoices() hasn't populated yet)
      const hasSpeechApi = typeof window !== 'undefined' && 'speechSynthesis' in window;
      const currentVoices = hasSpeechApi
        ? voices.length > 0
          ? voices
          : window.speechSynthesis.getVoices()
        : [];

      if (!hasSpeechApi) {
        await speakDspFormant(
          rawText,
          effSettings,
          customLabel || 'Motor offline integrado'
        );
        return;
      }

      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
      if (cancelledRef.current) return;

      const chosenVoice =
        currentVoices.find((v) => v.voiceURI === effSettings.selectedVoiceURI) ||
        currentVoices.find((v) => v.lang.toLowerCase().startsWith('pt')) ||
        currentVoices[0];

      const speechTotal = chunks.filter((c) => c.type === 'speech').length || 1;
      let completedSpeech = 0;
      let shouldFallbackToDsp = false;

      setStatus('speaking');
      setProgressPct(4);

      for (let i = 0; i < chunks.length; i++) {
        if (cancelledRef.current || shouldFallbackToDsp) break;

        const chunk = chunks[i];
        if (chunk.type === 'pause') {
          await new Promise<void>((resolve) => {
            pauseTimerRef.current = window.setTimeout(() => {
              pauseTimerRef.current = null;
              resolve();
            }, chunk.pauseMs || 300);
          });
          continue;
        }

        const chunkText = chunk.text || '';
        setActiveChunkText(customLabel ? `${customLabel} · ${chunkText}` : chunkText);

        await new Promise<void>((resolve) => {
          if (cancelledRef.current) {
            resolve();
            return;
          }

          const utter = new SpeechSynthesisUtterance(chunkText);
          if (chosenVoice) {
            utter.voice = chosenVoice;
            utter.lang = chosenVoice.lang;
          } else {
            utter.lang = 'pt-BR';
          }
          utter.rate = effSettings.rate;
          utter.pitch = effSettings.pitch;
          utter.volume = effSettings.volume;

          let settled = false;
          let started = false;
          const finish = () => {
            if (!settled) {
              settled = true;
              window.clearTimeout(fallbackTimer);
              resolve();
            }
          };

          // Fast 650ms watchdog so failed native speech never stalls the UI
          const fallbackTimer = window.setTimeout(() => {
            if (!started && !settled) {
              shouldFallbackToDsp = true;
              finish();
            }
          }, 650);

          utter.onstart = () => {
            started = true;
            window.clearTimeout(fallbackTimer);
          };
          utter.onend = finish;
          utter.onerror = (ev) => {
            if (ev.error !== 'interrupted' && ev.error !== 'canceled') {
              shouldFallbackToDsp = true;
            }
            finish();
          };

          window.speechSynthesis.speak(utter);
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        });

        if (shouldFallbackToDsp) break;
        completedSpeech += 1;
        setProgressPct(Math.round((completedSpeech / speechTotal) * 100));
      }

      if (shouldFallbackToDsp && !cancelledRef.current) {
        await speakDspFormant(rawText, effSettings, customLabel || 'Motor offline integrado');
        return;
      }

      if (!cancelledRef.current) {
        onSpokenComplete?.(rawText);
      }
      setStatus('idle');
      setActiveChunkText('');
      setProgressPct(0);
      releaseWakeLock();
    },
    [onSpokenComplete, releaseWakeLock, rules, speakDspFormant, voices]
  );

  const requestNeuralAiWav = useCallback(
    async (rawText: string, effSettings: VoiceSettings): Promise<Blob> => {
      const processed = applyPronunciationRules(rawText, rules);
      const primaryPreset =
        AI_VOICE_PACK.find((v) => v.id === effSettings.aiVoiceId) || AI_VOICE_PACK[0];
      const secondaryPreset =
        AI_VOICE_PACK.find((v) => v.id === effSettings.secondAiVoiceId) || AI_VOICE_PACK[1];

      const data = await postApiJson<{
        audioBase64?: string;
        mimeType?: string;
      }>(
        '/api/ai/tts',
        {
          text: processed,
          voiceName: primaryPreset.voiceName,
          style: effSettings.aiCustomStyle.trim() || primaryPreset.style,
          dualSpeaker: effSettings.dualSpeakerMode,
          secondVoiceName: secondaryPreset.voiceName,
          secondStyle: secondaryPreset.style,
          secondText: effSettings.dualSpeakerMode
            ? applyPronunciationRules(effSettings.secondText, rules)
            : '',
        },
        androidConfig.backendUrl
      );

      if (!data.audioBase64) {
        throw new Error('Erro ao gerar áudio com a Voz Neural IA.');
      }

      const bytes = base64ToUint8Array(data.audioBase64);
      const bufferCopy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(bufferCopy).set(bytes);
      return new Blob([bufferCopy], { type: data.mimeType || 'audio/wav' });
    },
    [androidConfig.backendUrl, rules]
  );

  const speakAiLocalFallback = useCallback(
    async (rawText: string, effSettings: VoiceSettings, presetName: string) => {
      const localSettings = mapAiVoiceToLocalSettings(effSettings.aiVoiceId, effSettings);
      const fullText =
        effSettings.dualSpeakerMode && effSettings.secondText.trim()
          ? `${rawText}. ${effSettings.secondText.trim()}`
          : rawText;

      const hasNativeEngine =
        !!getAndroidNativeTtsBridge() ||
        !!getCapacitorTtsPlugin() ||
        (typeof window !== 'undefined' && 'speechSynthesis' in window);

      if (hasNativeEngine) {
        await speakNativeTts(
          fullText,
          localSettings,
          `Modo offline · ${presetName}`
        );
      } else {
        await speakDspFormant(
          fullText,
          localSettings,
          `Modo offline · ${presetName}`
        );
      }
    },
    [speakDspFormant, speakNativeTts]
  );

  const speakNeuralAi = useCallback(
    async (rawText: string, effSettings: VoiceSettings) => {
      const preset =
        AI_VOICE_PACK.find((v) => v.id === effSettings.aiVoiceId) || AI_VOICE_PACK[0];

      if (isStaticHostingEnvironment() && !androidConfig.backendUrl.trim()) {
        await speakAiLocalFallback(rawText, effSettings, preset.name);
        return;
      }

      setStatus('rendering');
      setActiveChunkText(`Gerando voz neural (${preset.name})...`);
      setProgressPct(22);

      try {
        const wavBlob = await requestNeuralAiWav(rawText, effSettings);
        if (cancelledRef.current) return;

        lastRenderedWavRef.current = {
          cacheKey: `ai:${effSettings.aiVoiceId}:${effSettings.dualSpeakerMode}:${rawText}:${effSettings.secondText}`,
          blob: wavBlob,
        };

        const ctx = ensureUnlockedAudioContext();
        if (!ctx) throw new Error('Áudio indisponível');

        const arrayBuffer = await wavBlob.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        if (cancelledRef.current) return;

        await playSingleBuffer(
          audioBuffer,
          `${preset.name} (${preset.role}) · ${rawText.slice(0, 100)}`,
          `Voz IA · ${preset.name}`,
          effSettings.volume,
          0,
          100
        );

        if (!cancelledRef.current) {
          onSpokenComplete?.(rawText);
        }
        setAnalyserNode(null);
        setStatus('idle');
        setActiveChunkText('');
        setProgressPct(0);
        releaseWakeLock();
      } catch {
        if (cancelledRef.current) return;
        await speakAiLocalFallback(rawText, effSettings, preset.name);
      }
    },
    [
      androidConfig.backendUrl,
      ensureUnlockedAudioContext,
      onSpokenComplete,
      playSingleBuffer,
      releaseWakeLock,
      requestNeuralAiWav,
      speakAiLocalFallback,
    ]
  );

  const speak = useCallback(
    async (text: string, overridePatch?: Partial<VoiceSettings>) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const effSettings: VoiceSettings = overridePatch
        ? { ...settings, ...overridePatch }
        : settings;

      cancelledRef.current = true;
      if (pauseTimerRef.current !== null) {
        window.clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }
      if (progIntervalRef.current !== null) {
        window.clearInterval(progIntervalRef.current);
        progIntervalRef.current = null;
      }
      if (activeSourceRef.current) {
        try {
          activeSourceRef.current.stop();
          activeSourceRef.current.disconnect();
        } catch {
          // Ignore
        }
        activeSourceRef.current = null;
      }

      if (effSettings.engineMode !== 'native-tts') {
        ensureUnlockedAudioContext();
      }

      cancelledRef.current = false;
      pausedRef.current = false;
      setErrorMsg(null);
      setStatus('rendering');
      setActiveChunkText('Iniciando leitura...');
      triggerHaptic([12, 24, 12], androidConfig.hapticsEnabled);
      void acquireWakeLock();

      if (effSettings.engineMode === 'ai-neural') {
        await speakNeuralAi(trimmed, effSettings);
      } else if (effSettings.engineMode === 'dsp-formant') {
        await speakDspFormant(trimmed, effSettings);
      } else {
        await speakNativeTts(trimmed, effSettings);
      }
    },
    [
      acquireWakeLock,
      androidConfig.hapticsEnabled,
      ensureUnlockedAudioContext,
      settings,
      speakDspFormant,
      speakNativeTts,
      speakNeuralAi,
    ]
  );

  const exportWav = useCallback(
    async (text: string, shareOnAndroid = false) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setErrorMsg(null);
      triggerHaptic(15, androidConfig.hapticsEnabled);

      try {
        let blob: Blob;
        const expectedKey =
          settings.engineMode === 'ai-neural'
            ? `ai:${settings.aiVoiceId}:${settings.dualSpeakerMode}:${trimmed}:${settings.secondText}`
            : `dsp:${settings.dspVoiceId}:${trimmed}`;

        if (lastRenderedWavRef.current && lastRenderedWavRef.current.cacheKey === expectedKey) {
          blob = lastRenderedWavRef.current.blob;
        } else if (
          settings.engineMode === 'ai-neural' &&
          (!isStaticHostingEnvironment() || !!androidConfig.backendUrl.trim())
        ) {
          setStatus('rendering');
          setActiveChunkText('Exportando áudio .WAV...');
          try {
            blob = await requestNeuralAiWav(trimmed, settings);
          } catch {
            const processed = applyPronunciationRules(trimmed, rules);
            const localSettings = mapAiVoiceToLocalSettings(settings.aiVoiceId, settings);
            const buffer = await renderDspSpeechBuffer(processed, localSettings);
            blob = audioBufferToWavBlob(buffer);
          }
          setStatus('idle');
          setActiveChunkText('');
        } else {
          const processed = applyPronunciationRules(trimmed, rules);
          const localSettings =
            settings.engineMode === 'ai-neural'
              ? mapAiVoiceToLocalSettings(settings.aiVoiceId, settings)
              : settings;
          const buffer = await renderDspSpeechBuffer(processed, localSettings);
          blob = audioBufferToWavBlob(buffer);
        }

        lastRenderedWavRef.current = { cacheKey: expectedKey, blob };
        const filename = `vozsynth-${settings.engineMode === 'ai-neural' ? 'ia' : 'local'}-${Date.now()}.wav`;

        if (shareOnAndroid && typeof navigator !== 'undefined' && 'share' in navigator) {
          const file = new File([blob], filename, { type: 'audio/wav' });
          if (navigator.canShare?.({ files: [file] })) {
            try {
              await navigator.share({
                title: 'Áudio VozSynth Android',
                text: trimmed.slice(0, 100),
                files: [file],
              });
              return;
            } catch {
              // User cancelled share sheet
            }
          }
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        setStatus('idle');
        setActiveChunkText('');
        setErrorMsg(
          err instanceof Error ? err.message : 'Falha ao exportar arquivo .WAV.'
        );
      }
    },
    [androidConfig.backendUrl, androidConfig.hapticsEnabled, requestNeuralAiWav, rules, settings]
  );

  useEffect(() => {
    if (
      !androidConfig.mediaSessionEnabled ||
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator)
    ) {
      return;
    }
    try {
      navigator.mediaSession.setActionHandler('play', resume);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('stop', stop);
    } catch {
      // Ignore unsupported actions
    }
    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('stop', null);
      } catch {
        // Ignore
      }
    };
  }, [androidConfig.mediaSessionEnabled, pause, resume, stop]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      releaseWakeLock();
    };
  }, [releaseWakeLock]);

  return {
    voices,
    status,
    activeChunkText,
    progressPct,
    errorMsg,
    clearError: () => setErrorMsg(null),
    analyserNode,
    speak,
    pause,
    resume,
    stop,
    exportWav,
  };
}
