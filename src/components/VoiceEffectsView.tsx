import React, { useMemo, useState } from 'react';
import { Check, Loader2, Play, Plus, RotateCcw, Search, Square, Trash2, Volume2 } from 'lucide-react';
import { AI_VOICE_PACK, DSP_VOICE_PACK } from '../data/voicePacks';
import type { PlaybackStatus } from '../hooks/useSpeechEngine';
import type { DspVoicePreset, PronunciationRule, VoiceSettings } from '../types/synth';
import { isStaticHostingEnvironment } from '../utils/androidHelpers';

interface VoiceEffectsViewProps {
  voices: SpeechSynthesisVoice[];
  settings: VoiceSettings;
  backendUrl?: string;
  status: PlaybackStatus;
  activeChunkText: string;
  errorMsg: string | null;
  onClearError: () => void;
  onStop: () => void;
  onUpdateSettings: (patch: Partial<VoiceSettings>) => void;
  onResetSettings: () => void;
  onTestVoice: (sampleText: string, overridePatch?: Partial<VoiceSettings>) => void;
  rules: PronunciationRule[];
  onAddRule: (from: string, to: string) => void;
  onToggleRule: (id: string) => void;
  onDeleteRule: (id: string) => void;
}

const LANG_TABS = [
  { id: 'pt', label: 'Português' },
  { id: 'en', label: 'Inglês' },
  { id: 'es', label: 'Espanhol' },
  { id: 'all', label: 'Todas' },
];

export const VoiceEffectsView: React.FC<VoiceEffectsViewProps> = ({
  voices,
  settings,
  backendUrl,
  status,
  activeChunkText,
  errorMsg,
  onClearError,
  onStop,
  onUpdateSettings,
  onResetSettings,
  onTestVoice,
  rules,
  onAddRule,
  onToggleRule,
  onDeleteRule,
}) => {
  const hasRemoteBackend = !isStaticHostingEnvironment() || !!backendUrl?.trim();
  const [packTab, setPackTab] = useState<'ai' | 'dsp' | 'android'>(() =>
    hasRemoteBackend ? 'ai' : 'dsp'
  );
  const [testingId, setTestingId] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const [search, setSearch] = useState('');
  const [fromWord, setFromWord] = useState('');
  const [toWord, setToWord] = useState('');

  const handleReset = () => {
    onResetSettings();
    setResetDone(true);
    window.setTimeout(() => setResetDone(false), 1800);
  };

  const filteredVoices = useMemo(() => {
    return voices.filter((v) => {
      const langMatch =
        settings.languageFilter === 'all' ||
        v.lang.toLowerCase().startsWith(settings.languageFilter);
      const q = search.trim().toLowerCase();
      const searchMatch =
        !q ||
        v.name.toLowerCase().includes(q) ||
        v.lang.toLowerCase().includes(q);
      return langMatch && searchMatch;
    });
  }, [search, settings.languageFilter, voices]);

  const handleRuleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromWord.trim() || !toWord.trim()) return;
    onAddRule(fromWord.trim(), toWord.trim());
    setFromWord('');
    setToWord('');
  };

  const applyDspVoice = (preset: DspVoicePreset, testImmediately = false) => {
    const patch: Partial<VoiceSettings> = {
      engineMode: 'dsp-formant',
      dspVoiceId: preset.id,
      dspTimbre: preset.timbre,
      dspBaseFreq: preset.baseFreq,
      pitch: preset.pitch,
      rate: preset.rate,
      dspVibrato: preset.vibrato,
      dspEcho: preset.echo,
    };
    onUpdateSettings(patch);
    if (testImmediately) {
      setTestingId(preset.id);
      onTestVoice(`Olá! Esta é a voz ${preset.name} operando offline no celular.`, patch);
    }
  };

  const selectAiVoice = (id: string, testImmediately = false) => {
    const patch: Partial<VoiceSettings> = {
      engineMode: 'ai-neural',
      aiVoiceId: id,
    };
    onUpdateSettings(patch);
    if (testImmediately) {
      setTestingId(id);
      const found = AI_VOICE_PACK.find((v) => v.id === id);
      onTestVoice(
        `Olá! Eu sou ${found?.name || 'sua voz neural'}, pronta para narrar no seu Android.`,
        patch
      );
    }
  };

  const isBusy = status === 'rendering' || status === 'speaking';

  return (
    <div className="space-y-4">
      {/* Live Feedback Banner right inside Voice Pack View */}
      {isBusy && (
        <div className="rounded-2xl bg-orange-500/12 border border-orange-500/30 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 text-xs font-medium text-orange-600 dark:text-orange-400">
            {status === 'rendering' ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <Volume2 className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate">
              {activeChunkText || 'Reproduzindo teste de voz...'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setTestingId(null);
              onStop();
            }}
            className="min-h-[36px] px-3 rounded-xl bg-stone-900 dark:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Parar</span>
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="rounded-2xl bg-red-500/10 border border-red-500/30 px-4 py-3 flex items-center justify-between gap-3 text-xs text-red-700 dark:text-red-300"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={onClearError}
            className="min-h-[36px] px-2.5 font-semibold underline shrink-0 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Multi-Voice Pack */}
      <section className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Pacote com Várias Vozes
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              22 vozes selecionadas entre IA Neural, DSP Offline e motor nativo do Android
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="min-h-[40px] px-3 rounded-xl bg-stone-100 dark:bg-[#0e1116] hover:bg-stone-200 dark:hover:bg-slate-800 text-xs font-semibold text-stone-700 dark:text-stone-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-orange-500 shrink-0" />
            <span>{resetDone ? 'Restaurado!' : 'Voltar ao Padrão'}</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-stone-100 dark:bg-[#0e1116]">
          <button
            type="button"
            onClick={() => setPackTab('ai')}
            className={`min-h-[42px] px-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap truncate cursor-pointer ${
              packTab === 'ai'
                ? 'bg-white dark:bg-[#1e2530] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            Vozes IA ({AI_VOICE_PACK.length})
          </button>
          <button
            type="button"
            onClick={() => setPackTab('dsp')}
            className={`min-h-[42px] px-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap truncate cursor-pointer ${
              packTab === 'dsp'
                ? 'bg-white dark:bg-[#1e2530] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            DSP Offline ({DSP_VOICE_PACK.length})
          </button>
          <button
            type="button"
            onClick={() => setPackTab('android')}
            className={`min-h-[42px] px-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap truncate cursor-pointer ${
              packTab === 'android'
                ? 'bg-white dark:bg-[#1e2530] text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-600 dark:text-stone-400'
            }`}
          >
            Android ({voices.length})
          </button>
        </div>

        {/* Tab 1: Gemini Neural AI Voice Pack */}
        {packTab === 'ai' && (
          <div className="space-y-3">
            {!hasRemoteBackend && (
              <p className="text-xs text-stone-600 dark:text-stone-400 bg-stone-100 dark:bg-[#0e1116] rounded-xl px-3 py-2">
                Modo offline do APK: o botão Ouvir sintetiza localmente no aparelho. Para voz neural em nuvem, informe a URL do servidor na aba APK.
              </p>
            )}
            <div className="divide-y divide-stone-100 dark:divide-slate-800/80 rounded-xl border border-stone-200 dark:border-slate-800 max-h-80 overflow-y-auto">
              {AI_VOICE_PACK.map((voice) => {
                const isSelected =
                  settings.engineMode === 'ai-neural' && settings.aiVoiceId === voice.id;
                const isThisLoading = status === 'rendering' && testingId === voice.id;
                return (
                  <div
                    key={voice.id}
                    className={`px-3.5 py-3 flex items-center justify-between gap-3 ${
                      isSelected ? 'bg-orange-500/10 dark:bg-orange-500/15' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectAiVoice(voice.id, false)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                          {voice.name}
                        </span>
                        <span className="text-xs text-stone-500 dark:text-stone-400 truncate">
                          · {voice.role}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 line-clamp-2">
                        {voice.description}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => selectAiVoice(voice.id, true)}
                      disabled={status === 'rendering'}
                      aria-label={`Testar voz ${voice.name}`}
                      className="min-h-[42px] px-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      {isThisLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                      <span>{isThisLoading ? 'Gerando' : 'Ouvir'}</span>
                    </button>
                  </div>
                );
              })}
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
                Direção de estilo personalizada (opcional)
              </label>
              <input
                type="text"
                value={settings.aiCustomStyle}
                onChange={(e) => onUpdateSettings({ aiCustomStyle: e.target.value })}
                placeholder="Ex: Fale com entusiasmo e ritmo leve de propaganda"
                className="w-full min-h-[44px] px-3 rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
              />
            </div>
          </div>
        )}

        {/* Tab 2: Offline 12-Voice DSP Pack */}
        {packTab === 'dsp' && (
          <div className="divide-y divide-stone-100 dark:divide-slate-800/80 rounded-xl border border-stone-200 dark:border-slate-800 max-h-80 overflow-y-auto">
            {DSP_VOICE_PACK.map((preset) => {
              const isSelected =
                settings.engineMode === 'dsp-formant' && settings.dspVoiceId === preset.id;
              return (
                <div
                  key={preset.id}
                  className={`px-3.5 py-3 flex items-center justify-between gap-3 ${
                    isSelected ? 'bg-orange-500/10 dark:bg-orange-500/15' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => applyDspVoice(preset, false)}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                        {preset.name}
                      </span>
                      <span className="text-xs font-mono-tabular text-stone-500 dark:text-stone-400 shrink-0">
                        · {preset.baseFreq} Hz
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                      {preset.description}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyDspVoice(preset, true)}
                    aria-label={`Testar voz offline ${preset.name}`}
                    className="min-h-[42px] px-3.5 rounded-xl bg-stone-900 dark:bg-orange-500 hover:bg-stone-800 dark:hover:bg-orange-600 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Ouvir</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 3: Native Android Voices */}
        {packTab === 'android' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-stone-100 dark:bg-[#0e1116] flex-1">
                {LANG_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onUpdateSettings({ languageFilter: tab.id })}
                    className={`min-h-[38px] px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap truncate cursor-pointer ${
                      settings.languageFilter === tab.id
                        ? 'bg-white dark:bg-[#1e2530] text-stone-900 dark:text-white shadow-sm'
                        : 'text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setTestingId('android-test');
                  onTestVoice('Testando clareza da voz nativa instalada no sistema Android.', {
                    engineMode: 'native-tts',
                  });
                }}
                className="min-h-[44px] px-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
                <span>Testar</span>
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar voz nativa por nome ou idioma..."
                className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
              />
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-stone-100 dark:divide-slate-800/80 rounded-xl border border-stone-200 dark:border-slate-800">
              {filteredVoices.length === 0 ? (
                <div className="p-4 text-center text-xs text-stone-500 dark:text-stone-400 space-y-1">
                  <p>
                    {voices.length === 0
                      ? 'Nenhuma voz nativa foi exposta diretamente por este APK.'
                      : 'Nenhuma voz nativa encontrada neste filtro.'}
                  </p>
                  <p>
                    {voices.length === 0
                      ? 'Ao clicar em Testar ou usar DSP Offline, o aplicativo sintetiza áudio localmente sem depender do sistema.'
                      : 'Selecione "Todas" ou use DSP Offline.'}
                  </p>
                </div>
              ) : (
                filteredVoices.map((voice) => {
                  const isSelected =
                    settings.engineMode === 'native-tts' &&
                    settings.selectedVoiceURI === voice.voiceURI;
                  return (
                    <div
                      key={voice.voiceURI}
                      className={`min-h-[54px] px-3.5 py-2 flex items-center justify-between gap-2 transition-colors ${
                        isSelected
                          ? 'bg-orange-500/10 dark:bg-orange-500/15'
                          : 'hover:bg-stone-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({
                            engineMode: 'native-tts',
                            selectedVoiceURI: voice.voiceURI,
                          })
                        }
                        className="flex-1 min-w-0 text-left cursor-pointer flex items-center gap-2"
                      >
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
                            {voice.name}
                          </p>
                          <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                            {voice.lang} · {voice.localService ? 'Offline no Aparelho' : 'Rede / Sistema'}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const patch: Partial<VoiceSettings> = {
                            engineMode: 'native-tts',
                            selectedVoiceURI: voice.voiceURI,
                          };
                          onUpdateSettings(patch);
                          setTestingId(voice.voiceURI);
                          onTestVoice('Olá, testando esta voz nativa no seu celular.', patch);
                        }}
                        aria-label={`Ouvir ${voice.name}`}
                        className="min-h-[40px] px-3 rounded-xl bg-stone-100 dark:bg-[#0e1116] hover:bg-orange-500 hover:text-white text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Ouvir</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </section>

      {/* Acoustic Parameters */}
      <section className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Parâmetros Acústicos
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Ajuste fino de volume, pausas e formantes
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="min-h-[44px] px-3 rounded-xl bg-stone-100 dark:bg-[#0e1116] hover:bg-stone-200 dark:hover:bg-slate-800 text-xs font-medium text-stone-700 dark:text-stone-300 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-orange-500" />
            <span>{resetDone ? 'Restaurado!' : 'Voltar ao Padrão'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-stone-700 dark:text-stone-300">Volume de Saída</span>
              <span className="font-mono-tabular text-orange-500 font-semibold">
                {Math.round(settings.volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={settings.volume}
              onChange={(e) => onUpdateSettings({ volume: parseFloat(e.target.value) })}
              className="android-slider"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-stone-700 dark:text-stone-300">Pausa entre Frases</span>
              <span className="font-mono-tabular text-orange-500 font-semibold">
                {settings.pauseBetweenSentencesMs} ms
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1200"
              step="50"
              value={settings.pauseBetweenSentencesMs}
              onChange={(e) =>
                onUpdateSettings({ pauseBetweenSentencesMs: parseInt(e.target.value, 10) })
              }
              className="android-slider"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-stone-700 dark:text-stone-300">Frequência Base (DSP)</span>
              <span className="font-mono-tabular text-orange-500 font-semibold">
                {settings.dspBaseFreq} Hz
              </span>
            </div>
            <input
              type="range"
              min="75"
              max="280"
              step="5"
              value={settings.dspBaseFreq}
              onChange={(e) =>
                onUpdateSettings({ dspBaseFreq: parseInt(e.target.value, 10) })
              }
              className="android-slider"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-stone-700 dark:text-stone-300">Vibrato / Eco (DSP)</span>
              <span className="font-mono-tabular text-orange-500 font-semibold">
                {Math.round(settings.dspVibrato * 100)}% · {Math.round(settings.dspEcho * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="0.8"
              step="0.05"
              value={settings.dspEcho}
              onChange={(e) => onUpdateSettings({ dspEcho: parseFloat(e.target.value) })}
              className="android-slider"
            />
          </div>
        </div>
      </section>

      {/* Phonetic Pronunciation Dictionary */}
      <section className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-4 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
            Dicionário de Pronúncia
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Substitui siglas ou termos estrangeiros antes da leitura
          </p>
        </div>

        <form onSubmit={handleRuleSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input
            type="text"
            value={fromWord}
            onChange={(e) => setFromWord(e.target.value)}
            placeholder="Palavra (ex: APK)"
            className="sm:col-span-4 min-h-[44px] px-3 rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
          />
          <input
            type="text"
            value={toWord}
            onChange={(e) => setToWord(e.target.value)}
            placeholder="Como ler (ex: á pê ká)"
            className="sm:col-span-5 min-h-[44px] px-3 rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
          />
          <button
            type="submit"
            disabled={!fromWord.trim() || !toWord.trim()}
            className="sm:col-span-3 min-h-[44px] px-4 rounded-xl bg-stone-900 dark:bg-orange-500 hover:bg-stone-800 dark:hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar</span>
          </button>
        </form>

        <div className="divide-y divide-stone-100 dark:divide-slate-800/80 rounded-xl border border-stone-200 dark:border-slate-800">
          {rules.length === 0 ? (
            <p className="p-3.5 text-xs text-stone-500 dark:text-stone-400 text-center">
              Nenhuma regra cadastrada.
            </p>
          ) : (
            rules.map((rule) => (
              <div
                key={rule.id}
                className="min-h-[52px] px-3.5 py-2 flex items-center justify-between gap-3"
              >
                <button
                  type="button"
                  onClick={() => onToggleRule(rule.id)}
                  className="flex-1 min-w-0 text-left flex items-center gap-2.5 min-h-[44px] cursor-pointer"
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      rule.enabled
                        ? 'bg-orange-500 border-orange-500 text-white'
                        : 'border-stone-300 dark:border-slate-600'
                    }`}
                  >
                    {rule.enabled && <Check className="w-3 h-3" />}
                  </span>
                  <span
                    className={`text-sm truncate ${
                      rule.enabled
                        ? 'text-stone-900 dark:text-stone-100'
                        : 'text-stone-400 line-through'
                    }`}
                  >
                    <strong className="font-mono-tabular">{rule.from}</strong> → {rule.to}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteRule(rule.id)}
                  aria-label={`Remover regra ${rule.from}`}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-400 hover:text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
