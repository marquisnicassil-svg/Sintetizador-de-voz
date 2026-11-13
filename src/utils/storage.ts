import type {
  AiChatMessage,
  AndroidAppConfig,
  HistoryEntry,
  PronunciationRule,
  SavedPhrase,
  VoiceSettings,
} from '../types/synth';

const KEYS = {
  SETTINGS: 'vozsynth_settings_v1',
  RULES: 'vozsynth_rules_v1',
  PHRASES: 'vozsynth_phrases_v1',
  HISTORY: 'vozsynth_history_v1',
  ANDROID: 'vozsynth_android_v1',
  DRAFT_TEXT: 'vozsynth_draft_v1',
  AI_CHAT: 'vozsynth_ai_chat_v1',
} as const;

function detectInitialEngineMode(): VoiceSettings['engineMode'] {
  if (typeof window === 'undefined') return 'native-tts';
  const { hostname, protocol } = window.location;
  const isStaticOrApk =
    hostname.endsWith('github.io') ||
    protocol === 'file:' ||
    protocol === 'capacitor:' ||
    protocol === 'ionic:';
  if (isStaticOrApk) {
    const hasVoices =
      'speechSynthesis' in window && window.speechSynthesis.getVoices().length > 0;
    return hasVoices ? 'native-tts' : 'dsp-formant';
  }
  return 'native-tts';
}

function detectInitialStatusBarOffset(): number {
  if (typeof window === 'undefined') return 0;
  const ua = navigator.userAgent || '';
  const isAndroid = /android/i.test(ua);
  const isWebView = /;\s*wv\)/i.test(ua) || window.location.protocol === 'file:' || window.location.protocol === 'capacitor:';
  const isFullscreen =
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (window.screen && Math.abs(window.screen.height - window.innerHeight) <= 24);
  return isAndroid && (isFullscreen || isWebView) ? 32 : 0;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  engineMode: detectInitialEngineMode(),
  selectedVoiceURI: '',
  languageFilter: 'pt',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  pauseBetweenSentencesMs: 280,
  dspTimbre: 'natural',
  dspVoiceId: 'dsp-natural',
  dspBaseFreq: 135,
  dspVibrato: 0.25,
  dspEcho: 0.15,
  aiVoiceId: 'clara-jornal',
  aiCustomStyle: '',
  dualSpeakerMode: false,
  secondAiVoiceId: 'lucas-dinamico',
  secondText: 'Com certeza! Agora podemos gerar diálogos completos direto do celular.',
};

export const DEFAULT_ANDROID_CONFIG: AndroidAppConfig = {
  appName: 'VozSynth Android',
  appId: 'com.vozsynth.android',
  versionName: '1.0.0',
  versionCode: 1,
  orientation: 'portrait',
  keepScreenAwake: true,
  hapticsEnabled: true,
  mediaSessionEnabled: true,
  darkMode: true,
  backendUrl: '',
  statusBarOffsetPx: detectInitialStatusBarOffset(),
};

export const DEFAULT_PRONUNCIATION_RULES: PronunciationRule[] = [
  { id: 'r1', from: 'APK', to: 'á pê ká', enabled: true },
  { id: 'r2', from: 'TTS', to: 'tê tê ésse', enabled: true },
  { id: 'r3', from: 'Hz', to: 'hertz', enabled: true },
  { id: 'r4', from: 'Wi-Fi', to: 'uai fai', enabled: true },
];

export const DEFAULT_PHRASES: SavedPhrase[] = [
  {
    id: 'p1',
    title: 'Apresentação do Estúdio',
    text: 'Olá! Este é o sintetizador de voz otimizado para Android, com pacote de vozes neurais e suporte offline.',
    category: 'Locução',
    createdAt: 1700000000000,
  },
  {
    id: 'p2',
    title: 'Solicitar ajuda rápida',
    text: 'Com licença, estou usando meu sintetizador de voz para me comunicar. Você pode falar um pouco mais devagar?',
    category: 'Acessibilidade',
    createdAt: 1700000000100,
  },
  {
    id: 'p3',
    title: 'Confirmação direta',
    text: 'Sim, concordo perfeitamente. [pausa 350ms] Podemos seguir com o combinado.',
    category: 'Acessibilidade',
    createdAt: 1700000000200,
  },
  {
    id: 'p4',
    title: 'Chamada para vídeo',
    text: 'Bem-vindos ao canal! [pausa 300ms] Hoje vamos testar áudio sintetizado direto do celular em formato WAV.',
    category: 'Locução',
    createdAt: 1700000000300,
  },
  {
    id: 'p5',
    title: 'Bom dia cordial',
    text: 'Bom dia! Tudo bem com você? Desejo um excelente trabalho hoje.',
    category: 'Saudações',
    createdAt: 1700000000400,
  },
];

export const DEFAULT_AI_CHAT: AiChatMessage[] = [
  {
    id: 'ai_welcome',
    role: 'model',
    text: 'Olá! Sou sua IA de Voz. Posso criar roteiros de locução, inserir pausas naturais no seu texto, traduzir falas ou sugerir ajustes de pronúncia. O que você quer criar agora?',
    timestamp: Date.now(),
  },
];

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors in restricted WebViews
  }
}

export const storage = {
  getSettings: (): VoiceSettings => ({
    ...DEFAULT_VOICE_SETTINGS,
    ...safeRead<Partial<VoiceSettings>>(KEYS.SETTINGS, {}),
  }),
  saveSettings: (s: VoiceSettings) => safeWrite(KEYS.SETTINGS, s),

  getRules: (): PronunciationRule[] => safeRead(KEYS.RULES, DEFAULT_PRONUNCIATION_RULES),
  saveRules: (r: PronunciationRule[]) => safeWrite(KEYS.RULES, r),

  getPhrases: (): SavedPhrase[] => safeRead(KEYS.PHRASES, DEFAULT_PHRASES),
  savePhrases: (p: SavedPhrase[]) => safeWrite(KEYS.PHRASES, p),

  getHistory: (): HistoryEntry[] => safeRead(KEYS.HISTORY, []),
  saveHistory: (h: HistoryEntry[]) => safeWrite(KEYS.HISTORY, h.slice(0, 40)),

  getAndroidConfig: (): AndroidAppConfig => ({
    ...DEFAULT_ANDROID_CONFIG,
    ...safeRead<Partial<AndroidAppConfig>>(KEYS.ANDROID, {}),
  }),
  saveAndroidConfig: (c: AndroidAppConfig) => safeWrite(KEYS.ANDROID, c),

  getDraftText: (): string => {
    try {
      return (
        localStorage.getItem(KEYS.DRAFT_TEXT) ||
        'Olá! Digite qualquer texto aqui para sintetizar em voz natural no Android ou experimentar o novo pacote de vozes neurais com IA.'
      );
    } catch {
      return 'Olá! Digite qualquer texto aqui para sintetizar no Android.';
    }
  },
  saveDraftText: (text: string) => {
    try {
      localStorage.setItem(KEYS.DRAFT_TEXT, text);
    } catch {
      // Ignore
    }
  },

  getAiChat: (): AiChatMessage[] => safeRead(KEYS.AI_CHAT, DEFAULT_AI_CHAT),
  saveAiChat: (msgs: AiChatMessage[]) => safeWrite(KEYS.AI_CHAT, msgs.slice(-30)),
};
