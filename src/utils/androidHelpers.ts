import type { AndroidAppConfig, DiagnosticItem, PronunciationRule } from '../types/synth';

export function triggerHaptic(pattern: number | number[] = 12, enabled = true): void {
  if (!enabled || typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Ignore restricted WebView vibration calls
  }
}

export function applyPronunciationRules(text: string, rules: PronunciationRule[]): string {
  let result = text;
  for (const rule of rules) {
    if (!rule.enabled || !rule.from.trim()) continue;
    const escaped = rule.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(regex, rule.to);
  }
  return result;
}

export interface SpeechChunk {
  type: 'speech' | 'pause';
  text?: string;
  pauseMs?: number;
}

/**
 * Splits text by [pausa Xms] markers and sentence boundaries so Android WebView
 * SpeechSynthesis never hits the ~15-second utterance cutoff bug.
 */
export function splitIntoSpeechChunks(text: string, defaultSentencePauseMs: number): SpeechChunk[] {
  const chunks: SpeechChunk[] = [];
  const pauseTagRegex = /\[pausa\s+(\d+)\s*ms\]/gi;
  const parts = text.split(pauseTagRegex);

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const ms = Math.min(5000, Math.max(50, parseInt(parts[i], 10) || 300));
      chunks.push({ type: 'pause', pauseMs: ms });
      continue;
    }

    const segment = parts[i].trim();
    if (!segment) continue;

    // Split long segments into manageable sentences (~180 chars max)
    const rawSentences = segment.match(/[^.!?\n]+[.!?\n]*/g) || [segment];
    for (let sIdx = 0; sIdx < rawSentences.length; sIdx++) {
      const sentence = rawSentences[sIdx].trim();
      if (!sentence) continue;

      if (sentence.length <= 180) {
        chunks.push({ type: 'speech', text: sentence });
      } else {
        // Sub-split by commas or word boundaries
        const words = sentence.split(/\s+/);
        let current = '';
        for (const word of words) {
          if ((current + ' ' + word).trim().length > 160 && current) {
            chunks.push({ type: 'speech', text: current.trim() });
            current = word;
          } else {
            current = (current ? current + ' ' : '') + word;
          }
        }
        if (current.trim()) {
          chunks.push({ type: 'speech', text: current.trim() });
        }
      }

      if (sIdx < rawSentences.length - 1 && defaultSentencePauseMs > 0) {
        chunks.push({ type: 'pause', pauseMs: defaultSentencePauseMs });
      }
    }
  }

  return chunks;
}

export interface CapacitorTtsPlugin {
  speak: (options: {
    text: string;
    lang?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
    category?: string;
  }) => Promise<void>;
  stop?: () => Promise<void>;
}

export function getCapacitorTtsPlugin(): CapacitorTtsPlugin | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as unknown as {
    Capacitor?: { Plugins?: { TextToSpeech?: CapacitorTtsPlugin } };
  }).Capacitor;
  const plugin = cap?.Plugins?.TextToSpeech;
  return plugin && typeof plugin.speak === 'function' ? plugin : null;
}

export function runAndroidDiagnostics(): DiagnosticItem[] {
  const hasWindow = typeof window !== 'undefined';
  const hasNav = typeof navigator !== 'undefined';

  const hasCapTts = !!getCapacitorTtsPlugin();
  const hasSpeech = hasWindow && 'speechSynthesis' in window;
  const voiceCount = hasSpeech ? window.speechSynthesis.getVoices().length : 0;

  const AudioCtx = hasWindow
    ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    : undefined;
  const hasAudioCtx = !!AudioCtx;

  const hasSW = hasNav && 'serviceWorker' in navigator;
  const hasWakeLock = hasNav && 'wakeLock' in navigator;
  const hasMediaSession = hasNav && 'mediaSession' in navigator;
  const hasVibrate = hasNav && 'vibrate' in navigator;
  const hasShare = hasNav && 'share' in navigator;
  const isAndroidUA = hasNav && /android/i.test(navigator.userAgent);
  const isStandalone =
    hasWindow &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true);

  return [
    {
      id: 'tts',
      label: 'Android / Web Speech TTS',
      supported: hasCapTts || voiceCount > 0,
      detail: hasCapTts
        ? 'Plugin nativo Capacitor TextToSpeech ativo'
        : hasSpeech && voiceCount > 0
          ? `${voiceCount} vozes detectadas no sistema`
          : 'WebView sem vozes nativas — fallback automático DSP Offline ativo',
    },
    {
      id: 'webaudio',
      label: 'Sintetizador DSP & Exportador WAV',
      supported: hasAudioCtx,
      detail: hasAudioCtx ? 'Web Audio + OfflineAudioContext ativos' : 'AudioContext indisponível',
    },
    {
      id: 'sw',
      label: 'Cache Offline (Service Worker)',
      supported: hasSW,
      detail: hasSW ? 'Pronto para funcionamento 100% offline' : 'Service Worker bloqueado',
    },
    {
      id: 'wakelock',
      label: 'WakeLock (Tela Ativa)',
      supported: hasWakeLock,
      detail: hasWakeLock ? 'Evita suspensão em leituras longas' : 'Usar keepScreenOn no AndroidManifest',
    },
    {
      id: 'mediasession',
      label: 'Controles na Tela de Bloqueio',
      supported: hasMediaSession,
      detail: hasMediaSession ? 'MediaSession API suportada' : 'Indisponível neste ambiente',
    },
    {
      id: 'share',
      label: 'Android Share Sheet (Áudio WAV)',
      supported: hasShare,
      detail: hasShare ? 'Compartilhamento nativo habilitado' : 'Download direto de arquivo .WAV ativo',
    },
    {
      id: 'vibrate',
      label: 'Feedback Háptico (Vibração)',
      supported: hasVibrate,
      detail: hasVibrate ? 'Motor de vibração acessível' : 'Indisponível neste dispositivo',
    },
    {
      id: 'env',
      label: 'Ambiente Detectado',
      supported: true,
      detail: `${isAndroidUA ? 'Android' : 'Desktop / Outro'} · ${isStandalone ? 'Modo App Instalado' : 'Navegador Web'}`,
    },
  ];
}

export function generateCapacitorConfigJson(config: AndroidAppConfig): string {
  return JSON.stringify(
    {
      appId: config.appId.trim() || 'com.vozsynth.android',
      appName: config.appName.trim() || 'VozSynth Android',
      webDir: 'dist',
      bundledWebRuntime: false,
      backgroundColor: config.darkMode ? '#0e1116' : '#fafaf9',
      android: {
        allowMixedContent: false,
        captureInput: true,
        webContentsDebuggingEnabled: false,
        backgroundColor: config.darkMode ? '#0e1116' : '#fafaf9',
      },
      plugins: {
        SplashScreen: {
          launchShowDuration: 400,
          backgroundColor: config.darkMode ? '#0e1116' : '#fafaf9',
          showSpinner: false,
        },
        StatusBar: {
          style: config.darkMode ? 'DARK' : 'LIGHT',
          backgroundColor: config.darkMode ? '#0e1116' : '#fafaf9',
        },
      },
    },
    null,
    2
  );
}

export function generateAndroidManifestXml(config: AndroidAppConfig): string {
  const pkg = config.appId.trim() || 'com.vozsynth.android';
  const orientationAttr =
    config.orientation === 'sensor' ? 'fullSensor' : config.orientation;

  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${pkg}"
    android:versionCode="${config.versionCode}"
    android:versionName="${config.versionName}">

    <!-- Permissões de Áudio, Offline e Tela Ativa -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.VIBRATE" />

    <!-- Obrigatório no Android 11+ (API 30+) para detectar motores TTS nativos -->
    <queries>
        <intent>
            <action android:name="android.intent.action.TTS_SERVICE" />
        </intent>
    </queries>

    <application
        android:allowBackup="true"
        android:hardwareAccelerated="true"
        android:icon="@mipmap/ic_launcher"
        android:label="${config.appName}"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:exported="true"
            android:launchMode="singleTask"
            android:screenOrientation="${orientationAttr}"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function isStaticHostingEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname, protocol } = window.location;
  return (
    hostname.endsWith('github.io') ||
    protocol === 'file:' ||
    protocol === 'capacitor:' ||
    protocol === 'ionic:'
  );
}

export function resolveApiUrl(apiPath: string, backendUrl?: string): string {
  const cleanBase = (backendUrl || '').trim().replace(/\/+$/, '');
  const cleanPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  return cleanBase ? `${cleanBase}${cleanPath}` : cleanPath;
}

export async function postApiJson<T>(
  apiPath: string,
  payload: unknown,
  backendUrl?: string
): Promise<T> {
  const url = resolveApiUrl(apiPath, backendUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (isStaticHostingEnvironment() && !backendUrl?.trim()) {
      throw new Error(
        'Hospedagem estática detectada (GitHub Pages / APK offline). As Vozes Nativas e o Pacote DSP Offline funcionam normalmente; para Vozes IA, informe a URL do servidor backend na aba APK.'
      );
    }
    throw new Error(
      `Servidor de IA indisponível neste endereço (HTTP ${response.status}). Use o Pacote DSP Offline ou Voz Nativa.`
    );
  }

  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Erro HTTP ${response.status} ao consultar a IA.`);
  }
  return data;
}

