import React, { useState } from 'react';
import {
  BookmarkPlus,
  Download,
  Loader2,
  Pause,
  Play,
  Share2,
  Sparkles,
  Square,
  Timer,
  Trash2,
  Users,
  Volume2,
} from 'lucide-react';
import { AI_VOICE_PACK, DSP_VOICE_PACK } from '../data/voicePacks';
import type { PlaybackStatus } from '../hooks/useSpeechEngine';
import type { SynthEngineMode, VoiceSettings } from '../types/synth';
import { WaveformVisualizer } from './WaveformVisualizer';

interface StudioViewProps {
  text: string;
  onTextChange: (next: string) => void;
  settings: VoiceSettings;
  onUpdateSettings: (patch: Partial<VoiceSettings>) => void;
  status: PlaybackStatus;
  activeChunkText: string;
  progressPct: number;
  errorMsg: string | null;
  onClearError: () => void;
  analyserNode: AnalyserNode | null;
  activeVoiceName: string;
  onSpeak: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onExportWav: (share: boolean) => void;
  onSaveAsPhrase: (text: string) => void;
  onQuickAiOptimize: () => Promise<void>;
  aiOptimizing: boolean;
}

export const StudioView: React.FC<StudioViewProps> = ({
  text,
  onTextChange,
  settings,
  onUpdateSettings,
  status,
  activeChunkText,
  progressPct,
  errorMsg,
  onClearError,
  analyserNode,
  activeVoiceName,
  onSpeak,
  onPause,
  onResume,
  onStop,
  onExportWav,
  onSaveAsPhrase,
  onQuickAiOptimize,
  aiOptimizing,
}) => {
  const [savedFeedback, setSavedFeedback] = useState(false);

  const insertPauseTag = (ms: number) => {
    const addition = `${text.endsWith(' ') || text.length === 0 ? '' : ' '}[pausa ${ms}ms] `;
    onTextChange(text + addition);
  };

  const handleSavePhrase = () => {
    if (!text.trim()) return;
    onSaveAsPhrase(text.trim());
    setSavedFeedback(true);
    window.setTimeout(() => setSavedFeedback(false), 1800);
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const isBusy = status === 'speaking' || status === 'paused' || status === 'rendering';

  const currentAiVoice =
    AI_VOICE_PACK.find((v) => v.id === settings.aiVoiceId) || AI_VOICE_PACK[0];
  const currentDspVoice =
    DSP_VOICE_PACK.find((v) => v.id === settings.dspVoiceId) || DSP_VOICE_PACK[0];

  const selectDspPreset = (presetId: string) => {
    const found = DSP_VOICE_PACK.find((v) => v.id === presetId);
    if (!found) return;
    onUpdateSettings({
      dspVoiceId: found.id,
      dspTimbre: found.timbre,
      dspBaseFreq: found.baseFreq,
      pitch: found.pitch,
      rate: found.rate,
      dspVibrato: found.vibrato,
      dspEcho: found.echo,
    });
  };

  return (
    <div className="space-y-4">
      {/* 3-Mode Engine Switcher */}
      <div className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-3 space-y-3">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-stone-100 dark:bg-[#0e1116]">
          {(
            [
              { id: 'native-tts', label: 'Android Nativa' },
              { id: 'dsp-formant', label: 'DSP Offline' },
              { id: 'ai-neural', label: 'Voz IA Neural' },
            ] as { id: SynthEngineMode; label: string }[]
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => onUpdateSettings({ engineMode: mode.id })}
              className={`min-h-[44px] px-2 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap truncate cursor-pointer ${
                settings.engineMode === mode.id
                  ? 'bg-white dark:bg-[#1e2530] text-stone-900 dark:text-white shadow-sm'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 px-1 text-xs text-stone-500 dark:text-stone-400">
          <span className="truncate">
            {settings.engineMode === 'native-tts' && `Voz: ${activeVoiceName}`}
            {settings.engineMode === 'dsp-formant' &&
              `DSP Offline: ${currentDspVoice.name} · ${Math.round(settings.dspBaseFreq)} Hz`}
            {settings.engineMode === 'ai-neural' &&
              `IA Neural: ${currentAiVoice.name} · ${currentAiVoice.role}`}
          </span>
          <span className="font-mono-tabular shrink-0">
            {settings.engineMode === 'ai-neural'
              ? settings.dualSpeakerMode
                ? '2 Vozes'
                : 'WAV 24kHz'
              : `${settings.rate.toFixed(2)}x · Tom ${settings.pitch.toFixed(2)}`}
          </span>
        </div>

        {/* Quick Voice Pack Strip for DSP Offline */}
        {settings.engineMode === 'dsp-formant' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {DSP_VOICE_PACK.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectDspPreset(item.id)}
                className={`min-h-[40px] px-3 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  settings.dspVoiceId === item.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-stone-100 dark:bg-[#0e1116] text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-slate-800'
                }`}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}

        {/* Quick Voice Pack Strip for Gemini AI Neural */}
        {settings.engineMode === 'ai-neural' && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {AI_VOICE_PACK.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onUpdateSettings({ aiVoiceId: item.id })}
                  className={`min-h-[40px] px-3 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    settings.aiVoiceId === item.id
                      ? 'bg-orange-500 text-white'
                      : 'bg-stone-100 dark:bg-[#0e1116] text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {item.name} · {item.role.split(' ')[0]}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-100 dark:border-slate-800/80">
              <span className="text-xs text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-orange-500 shrink-0" />
                <span>Modo Diálogo (2 Locutores IA)</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={settings.dualSpeakerMode}
                onClick={() =>
                  onUpdateSettings({ dualSpeakerMode: !settings.dualSpeakerMode })
                }
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                  settings.dualSpeakerMode ? 'bg-orange-500' : 'bg-stone-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    settings.dualSpeakerMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Waveform & Live Status */}
      <div className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-3.5 space-y-2.5">
        <WaveformVisualizer
          status={status}
          engineMode={settings.engineMode}
          analyserNode={analyserNode}
          progressPct={progressPct}
          rate={settings.rate}
          pitch={settings.pitch}
        />

        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0 text-stone-600 dark:text-stone-300">
            <Volume2 className="w-4 h-4 text-orange-500 shrink-0" />
            <span className="truncate">
              {status === 'rendering' && (activeChunkText || 'Sintetizando áudio...')}
              {status === 'speaking' && (activeChunkText || 'Reproduzindo fala...')}
              {status === 'paused' && 'Reprodução pausada'}
              {status === 'idle' && 'Pronto para sintetizar'}
            </span>
          </div>
          <span className="font-mono-tabular text-stone-500 dark:text-stone-400 shrink-0">
            {progressPct}%
          </span>
        </div>
      </div>

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

      {/* Text Editor */}
      <div className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="synth-input" className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            {settings.engineMode === 'ai-neural' && settings.dualSpeakerMode
              ? `Fala 1 (${currentAiVoice.name})`
              : 'Texto para Fala'}
          </label>
          <span className="text-xs font-mono-tabular text-stone-500 dark:text-stone-400">
            {wordCount} palavras · {charCount} car.
          </span>
        </div>

        <textarea
          id="synth-input"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={settings.engineMode === 'ai-neural' && settings.dualSpeakerMode ? 3 : 5}
          placeholder="Digite ou cole o texto aqui para sintetizar no celular..."
          className="w-full rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 p-3.5 text-base leading-relaxed text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70 resize-y"
        />

        {settings.engineMode === 'ai-neural' && settings.dualSpeakerMode && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="synth-input-2" className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                Fala 2 (Resposta do Co-Locutor)
              </label>
              <select
                value={settings.secondAiVoiceId}
                onChange={(e) => onUpdateSettings({ secondAiVoiceId: e.target.value })}
                className="min-h-[36px] px-2.5 rounded-lg bg-stone-100 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-xs text-stone-900 dark:text-stone-100"
              >
                {AI_VOICE_PACK.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.role})
                  </option>
                ))}
              </select>
            </div>
            <textarea
              id="synth-input-2"
              value={settings.secondText}
              onChange={(e) => onUpdateSettings({ secondText: e.target.value })}
              rows={2}
              placeholder="Digite a resposta da segunda voz..."
              className="w-full rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 p-3 text-sm leading-relaxed text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
            />
          </div>
        )}

        {/* Quick Toolbar for Mobile */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onQuickAiOptimize}
              disabled={!text.trim() || aiOptimizing}
              className="min-h-[44px] px-3 rounded-xl bg-orange-500/12 hover:bg-orange-500/20 disabled:opacity-40 text-xs font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              {aiOptimizing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>Melhorar com IA</span>
            </button>

            <button
              type="button"
              onClick={() => insertPauseTag(400)}
              className="min-h-[44px] px-3 rounded-xl bg-stone-100 dark:bg-[#0e1116] hover:bg-stone-200 dark:hover:bg-slate-800 text-xs font-medium text-stone-700 dark:text-stone-300 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Timer className="w-4 h-4 text-orange-500" />
              <span>+ Pausa</span>
            </button>

            <button
              type="button"
              onClick={handleSavePhrase}
              disabled={!text.trim()}
              className="min-h-[44px] px-3 rounded-xl bg-stone-100 dark:bg-[#0e1116] hover:bg-stone-200 dark:hover:bg-slate-800 disabled:opacity-40 text-xs font-medium text-stone-700 dark:text-stone-300 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <BookmarkPlus className="w-4 h-4 text-orange-500" />
              <span>{savedFeedback ? 'Salvo!' : 'Salvar'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onTextChange('')}
            disabled={!text.length}
            aria-label="Limpar texto"
            className="min-h-[44px] px-2.5 rounded-xl text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Limpar</span>
          </button>
        </div>
      </div>

      {/* Primary Thumb-Zone Deck */}
      <div className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-3.5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          {!isBusy ? (
            <button
              type="button"
              onClick={onSpeak}
              disabled={!text.trim()}
              className="sm:col-span-8 min-h-[54px] px-5 rounded-2xl bg-orange-500 hover:bg-orange-600 active:scale-[0.98] disabled:opacity-45 text-white font-semibold text-base flex items-center justify-center gap-2.5 shadow-lg shadow-orange-500/20 transition-all cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>
                {settings.engineMode === 'ai-neural'
                  ? `Falar com ${currentAiVoice.name}`
                  : 'Sintetizar e Falar'}
              </span>
            </button>
          ) : (
            <div className="sm:col-span-8 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={status === 'paused' ? onResume : onPause}
                disabled={status === 'rendering'}
                className="min-h-[54px] px-4 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] disabled:opacity-50 text-stone-950 font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {status === 'paused' ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5" />}
                <span>{status === 'paused' ? 'Retomar' : 'Pausar'}</span>
              </button>
              <button
                type="button"
                onClick={onStop}
                className="min-h-[54px] px-4 rounded-2xl bg-stone-900 dark:bg-slate-700 hover:bg-stone-800 dark:hover:bg-slate-600 active:scale-[0.98] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>Parar</span>
              </button>
            </div>
          )}

          <div className="sm:col-span-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onExportWav(false)}
              disabled={!text.trim() || status === 'rendering'}
              className="min-h-[54px] px-3 rounded-2xl bg-stone-100 dark:bg-[#0e1116] hover:bg-stone-200 dark:hover:bg-slate-800 disabled:opacity-40 text-stone-800 dark:text-stone-200 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4 text-orange-500 shrink-0" />
              <span>.WAV</span>
            </button>

            <button
              type="button"
              onClick={() => onExportWav(canShare)}
              disabled={!text.trim() || status === 'rendering'}
              className="min-h-[54px] px-3 rounded-2xl bg-stone-100 dark:bg-[#0e1116] hover:bg-stone-200 dark:hover:bg-slate-800 disabled:opacity-40 text-stone-800 dark:text-stone-200 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-orange-500 shrink-0" />
              <span>Enviar</span>
            </button>
          </div>
        </div>

        {/* Inline Quick Sliders */}
        {settings.engineMode !== 'ai-neural' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-stone-100 dark:border-slate-800/80">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-stone-700 dark:text-stone-300">Velocidade</span>
                <span className="font-mono-tabular text-orange-500 font-semibold">
                  {settings.rate.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min="0.4"
                max="2.2"
                step="0.05"
                value={settings.rate}
                onChange={(e) => onUpdateSettings({ rate: parseFloat(e.target.value) })}
                aria-label="Velocidade da fala"
                className="android-slider"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-stone-700 dark:text-stone-300">Tom (Pitch)</span>
                <span className="font-mono-tabular text-orange-500 font-semibold">
                  {settings.pitch.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.4"
                max="1.9"
                step="0.05"
                value={settings.pitch}
                onChange={(e) => onUpdateSettings({ pitch: parseFloat(e.target.value) })}
                aria-label="Tom da voz"
                className="android-slider"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
