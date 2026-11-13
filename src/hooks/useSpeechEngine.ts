import { useCallback, useEffect, useRef, useState } from 'react';
import { AI_VOICE_PACK } from '../data/voicePacks';
import type { AndroidAppConfig, PronunciationRule, VoiceSettings } from '../types/synth';
import {
  applyPronunciationRules,
  getCapacitorTtsPlugin,
  isStaticHostingEnvironment,
  postApiJson,
  splitIntoSpeechChunks,
  triggerHaptic,
} from '../utils/androidHelpers';
import { audioBufferToWavBlob, renderDspSpeechBuffer } from '../utils/dspFormantEngine';

export type PlaybackStatus = 'idle' | 'rendering' | 'speaking' | 'paused';

const AI_LOCAL_PROFILES: Record<
  string,
  Pick<VoiceSettings, 'dspTimbre' | 'dspBaseFreq' | 'pitch' | 'rate' | 'dspVibrato' | 'dspEcho'>
> = {
  'clara-jornal': { dspTimbre: 'natural', dspBaseFreq: 196, pitch: 1.08, rate: 1.02, dspVibrato: 0.22, dspEcho: 0.08 },
  'lucas-dinamico': { dspTimbre: 'natural', dspBaseFreq: 132, pitch: 1.04, rate: 1.12, dspVibrato: 0.2, dspEcho: 0.06 },
  'bruno-doc': { dspTimbre: 'deep', dspBaseFreq: 90, pitch: 0.86, rate: 0.9, dspVibrato: 0.14, dspEcho: 0.16 },
  'rafael-epico': { dspTimbre: 'deep', dspBaseFreq: 96, pitch: 0.9, rate: 0.96, dspVibrato: 0.18, dspEcho: 0.22 },
  'sofia-suave': { dspTimbre: 'natural', dspBaseFreq: 210, pitch: 1.12, rate: 0.96, dspVibrato: 0.28, dspEcho: 0.12 },
  'helena-livro': { dspTimbre: 'natural', dspBaseFreq: 186, pitch: 1.05, rate: 0.94, dspVibrato: 0.3, dspEcho: 0.14 },
  'mateus-podcast': { dspTimbre: 'natural', dspBaseFreq: 122, pitch: 0.98, rate: 1.06, dspVibrato: 0.18, dspEcho: 0.08 },
  'beatriz-ura': { dspTimbre: 'natural', dspBaseFreq: 202, pitch: 1.1, rate: 1.0, dspVibrato: 0.14, dspEcho: 0.05 },
  'diogo-radio': { dspTimbre: 'radio', dspBaseFreq: 138, pitch: 1.04, rate: 1.14, dspVibrato: 0.16, dspEcho: 0.1 },
  'valentina-asmr': { dspTimbre: 'whisper', dspBaseFreq: 175, pitch: 1.05, rate: 0.84, dspVibrato: 0.12, dspEcho: 0.22 },
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

  // Discover Android / browser TTS voices reliably
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
    const t1 = window.setTimeout(loadVoices, 300);
    const t2 = window.setTimeout(loadVoices, 1000);

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
      // Ignore if battery saver or background tab blocks WakeLock
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

    if (settings.engineMode === 'native-tts' && 'speechSynthesis' in window) {
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

    if (settings.engineMode === 'native-tts' && 'speechSynthesis' in window) {
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

  const playAudioBufferWithAnalyser = useCallback(
    async (
      buffer: AudioBuffer,
      labelText: string,
      rawText: string,
      subtitle: string,
      volume: number
    ) => {
      const ctx = ensureUnlockedAudioContext();
      if (!ctx) {
        throw new Error('AudioContext indisponível neste dispositivo.');
      }
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = ctx.createGain();
      gainNode.gain.value = Math.min(1, Math.max(0.05, volume));

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

      const durationMs = Math.max(200, buffer.duration * 1000);
      const startAt = performance.now();
      progIntervalRef.current = window.setInterval(() => {
        if (cancelledRef.current) {
          if (progIntervalRef.current !== null) window.clearInterval(progIntervalRef.current);
          return;
        }
        if (!pausedRef.current) {
          const elapsed = performance.now() - startAt;
          setProgressPct(Math.min(99, Math.round((elapsed / durationMs) * 100)));
        }
      }, 80);

      source.onended = () => {
        if (progIntervalRef.current !== null) {
          window.clearInterval(progIntervalRef.current);
          progIntervalRef.current = null;
        }
        if (!cancelledRef.current) {
          onSpokenComplete?.(rawText);
        }
        setAnalyserNode(null);
        setStatus('idle');
        setActiveChunkText('');
        setProgressPct(0);
        releaseWakeLock();
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'none';
        }
      };

      source.start(0);
    },
    [androidConfig.appName, androidConfig.mediaSessionEnabled, ensureUnlockedAudioContext, onSpokenComplete, releaseWakeLock]
  );

  const speakDspFormant = useCallback(
    async (rawText: string, effSettings: VoiceSettings, customLabel?: string) => {
      setStatus('rendering');
      setActiveChunkText(customLabel || 'Sintetizando áudio offline...');
      setProgressPct(18);

      const processed = applyPronunciationRules(rawText, rules);
      try {
        const buffer = await renderDspSpeechBuffer(processed, effSettings);
        if (cancelledRef.current) return;

        const wavBlob = audioBufferToWavBlob(buffer);
        lastRenderedWavRef.current = {
          cacheKey: `dsp:${effSettings.dspVoiceId}:${rawText}`,
          blob: wavBlob,
        };

        await playAudioBufferWithAnalyser(
          buffer,
          customLabel
            ? `${customLabel} · ${rawText.slice(0, 110)}${rawText.length > 110 ? '…' : ''}`
            : rawText.slice(0, 140) + (rawText.length > 140 ? '…' : ''),
          rawText,
          customLabel || `DSP Offline · ${effSettings.dspTimbre}`,
          effSettings.volume
        );
      } catch {
        setErrorMsg('Não foi possível sintetizar o áudio DSP neste aparelho.');
        setStatus('idle');
        setAnalyserNode(null);
        releaseWakeLock();
      }
    },
    [playAudioBufferWithAnalyser, releaseWakeLock, rules]
  );

  const speakNativeTts = useCallback(
    async (rawText: string, effSettings: VoiceSettings, customLabel?: string) => {
      const processed = applyPronunciationRules(rawText, rules);
      const chunks = splitIntoSpeechChunks(processed, effSettings.pauseBetweenSentencesMs);
      if (chunks.length === 0) {
        setStatus('idle');
        return;
      }

      // 1) Try native Capacitor TextToSpeech plugin first when running inside Capacitor APK
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
          // Fall through to Web Speech / DSP Offline if Capacitor TTS fails
        }
      }

      // 2) Check Web Speech API voices (many simple APK WebViews return 0 voices)
      const hasSpeechApi = typeof window !== 'undefined' && 'speechSynthesis' in window;
      const currentVoices = hasSpeechApi
        ? voices.length > 0
          ? voices
          : window.speechSynthesis.getVoices()
        : [];

      if (!hasSpeechApi || currentVoices.length === 0) {
        await speakDspFormant(
          rawText,
          effSettings,
          customLabel || 'Modo offline (WebView sem voz nativa)'
        );
        return;
      }

      const wasActive = window.speechSynthesis.speaking || window.speechSynthesis.pending;
      if (wasActive) {
        window.speechSynthesis.cancel();
        // Give Android/Chromium WebView 60ms to flush cancel before speaking next utterance
        await new Promise<void>((r) => window.setTimeout(r, 60));
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

          // Safety timeout if WebView silently drops utterance without firing onend/onerror
          const fallbackTimer = window.setTimeout(() => {
            if (!started && !settled) {
              shouldFallbackToDsp = true;
              finish();
            }
          }, 1800);

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
        await speakDspFormant(rawText, effSettings, customLabel || 'Fallback automático DSP');
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

      const hasCapTts = !!getCapacitorTtsPlugin();
      const hasWebVoices =
        typeof window !== 'undefined' &&
        'speechSynthesis' in window &&
        (voices.length > 0 || window.speechSynthesis.getVoices().length > 0);

      if (hasCapTts || hasWebVoices) {
        await speakNativeTts(
          fullText,
          localSettings,
          `Offline · Voz local (${presetName})`
        );
      } else {
        await speakDspFormant(
          fullText,
          localSettings,
          `Offline · Formante local (${presetName})`
        );
      }
    },
    [speakDspFormant, speakNativeTts, voices.length]
  );

  const speakNeuralAi = useCallback(
    async (rawText: string, effSettings: VoiceSettings) => {
      const preset =
        AI_VOICE_PACK.find((v) => v.id === effSettings.aiVoiceId) || AI_VOICE_PACK[0];

      // In GitHub Pages / APK without a backend URL configured, seamlessly synthesize locally instead of failing
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
        if (!ctx) throw new Error('AudioContext indisponível');

        const arrayBuffer = await wavBlob.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        if (cancelledRef.current) return;

        await playAudioBufferWithAnalyser(
          audioBuffer,
          `${preset.name} (${preset.role}) · ${rawText.slice(0, 100)}`,
          rawText,
          `Voz IA · ${preset.name}`,
          effSettings.volume
        );
      } catch {
        if (cancelledRef.current) return;
        // Seamless automatic fallback so clicking "Ouvir" or "Falar" always produces audio
        await speakAiLocalFallback(rawText, effSettings, preset.name);
      }
    },
    [
      androidConfig.backendUrl,
      ensureUnlockedAudioContext,
      playAudioBufferWithAnalyser,
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

      // Stop any ongoing audio cleanly WITHOUT calling speechSynthesis.cancel() unnecessarily
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

      // Unlock AudioContext synchronously during user gesture BEFORE any await
      if (effSettings.engineMode !== 'native-tts') {
        ensureUnlockedAudioContext();
      }

      cancelledRef.current = false;
      pausedRef.current = false;
      setErrorMsg(null);
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
          setActiveChunkText('Exportando áudio neural .WAV...');
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
        const filename = `vozsynth-${settings.engineMode === 'ai-neural' ? 'ia' : 'dsp'}-${Date.now()}.wav`;

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
              // User cancelled share sheet or browser blocked file share
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
    [androidConfig.hapticsEnabled, requestNeuralAiWav, rules, settings]
  );

  // Wire MediaSession handlers when supported
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
