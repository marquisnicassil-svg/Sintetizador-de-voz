export type SynthEngineMode = 'native-tts' | 'dsp-formant' | 'ai-neural';

export type DspTimbre =
  | 'natural'
  | 'robot'
  | 'radio'
  | 'deep'
  | 'whisper'
  | 'choir'
  | 'megaphone'
  | 'cyborg';

export type AppTab = 'studio' | 'voices' | 'ai' | 'phrases' | 'android';

export type GeminiVoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

export interface AiVoicePreset {
  id: string;
  name: string;
  role: string;
  description: string;
  voiceName: GeminiVoiceName;
  style: string;
  toneTag: string;
}

export interface DspVoicePreset {
  id: string;
  name: string;
  description: string;
  timbre: DspTimbre;
  baseFreq: number;
  pitch: number;
  rate: number;
  vibrato: number;
  echo: number;
}

export interface VoiceSettings {
  engineMode: SynthEngineMode;
  selectedVoiceURI: string;
  languageFilter: string;
  rate: number;
  pitch: number;
  volume: number;
  pauseBetweenSentencesMs: number;
  dspTimbre: DspTimbre;
  dspVoiceId: string;
  dspBaseFreq: number;
  dspVibrato: number;
  dspEcho: number;
  aiVoiceId: string;
  aiCustomStyle: string;
  dualSpeakerMode: boolean;
  secondAiVoiceId: string;
  secondText: string;
}

export interface PronunciationRule {
  id: string;
  from: string;
  to: string;
  enabled: boolean;
}

export type PhraseCategory = 'Acessibilidade' | 'Locução' | 'Saudações' | 'Personalizado';

export interface SavedPhrase {
  id: string;
  title: string;
  text: string;
  category: PhraseCategory;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  text: string;
  engineMode: SynthEngineMode;
  timestamp: number;
}

export interface AndroidAppConfig {
  appName: string;
  appId: string;
  versionName: string;
  versionCode: number;
  orientation: 'portrait' | 'landscape' | 'sensor';
  keepScreenAwake: boolean;
  hapticsEnabled: boolean;
  mediaSessionEnabled: boolean;
  darkMode: boolean;
  backendUrl: string;
}

export interface DiagnosticItem {
  id: string;
  label: string;
  supported: boolean;
  detail: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  suggestedScript?: string;
  pronunciationSuggestions?: { from: string; to: string }[];
  timestamp: number;
}
