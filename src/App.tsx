import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AudioWaveform,
  Bookmark,
  Bot,
  Moon,
  SlidersHorizontal,
  Smartphone,
  Sun,
} from 'lucide-react';
import { AiAssistantView } from './components/AiAssistantView';
import { AndroidApkView } from './components/AndroidApkView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PhrasesHistoryView } from './components/PhrasesHistoryView';
import { StudioView } from './components/StudioView';
import { VoiceEffectsView } from './components/VoiceEffectsView';
import { useSpeechEngine } from './hooks/useSpeechEngine';
import type {
  AiChatMessage,
  AndroidAppConfig,
  AppTab,
  HistoryEntry,
  PhraseCategory,
  PronunciationRule,
  SavedPhrase,
  VoiceSettings,
} from './types/synth';
import { postApiJson, triggerHaptic } from './utils/androidHelpers';
import { DEFAULT_AI_CHAT, DEFAULT_VOICE_SETTINGS, storage } from './utils/storage';

const NAV_ITEMS: { id: AppTab; label: string; icon: typeof AudioWaveform }[] = [
  { id: 'studio', label: 'Estúdio', icon: AudioWaveform },
  { id: 'voices', label: 'Vozes', icon: SlidersHorizontal },
  { id: 'ai', label: 'IA Voz', icon: Bot },
  { id: 'phrases', label: 'Frases', icon: Bookmark },
  { id: 'android', label: 'APK', icon: Smartphone },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('studio');
  const [text, setText] = useState<string>(() => storage.getDraftText());
  const [settings, setSettings] = useState<VoiceSettings>(() => storage.getSettings());
  const [rules, setRules] = useState<PronunciationRule[]>(() => storage.getRules());
  const [phrases, setPhrases] = useState<SavedPhrase[]>(() => storage.getPhrases());
  const [history, setHistory] = useState<HistoryEntry[]>(() => storage.getHistory());
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>(() => storage.getAiChat());
  const [aiOptimizing, setAiOptimizing] = useState(false);
  const [androidConfig, setAndroidConfig] = useState<AndroidAppConfig>(() =>
    storage.getAndroidConfig()
  );

  useEffect(() => {
    const root = document.documentElement;
    if (androidConfig.darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', androidConfig.darkMode ? '#0e1116' : '#fafaf9');
    }
  }, [androidConfig.darkMode]);

  const handleTextChange = (next: string) => {
    setText(next);
    storage.saveDraftText(next);
  };

  const updateSettings = useCallback((patch: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      storage.saveSettings(next);
      return next;
    });
  }, []);

  const updateAndroidConfig = useCallback((patch: Partial<AndroidAppConfig>) => {
    setAndroidConfig((prev) => {
      const next = { ...prev, ...patch };
      storage.saveAndroidConfig(next);
      return next;
    });
  }, []);

  const handleVoiceAutoSelect = useCallback(
    (voiceURI: string) => {
      updateSettings({ selectedVoiceURI: voiceURI });
    },
    [updateSettings]
  );

  const handleSpokenComplete = useCallback(
    (spokenText: string) => {
      const entry: HistoryEntry = {
        id: `h_${Date.now()}`,
        text: spokenText,
        engineMode: settings.engineMode,
        timestamp: Date.now(),
      };
      setHistory((prev) => {
        const next = [entry, ...prev].slice(0, 40);
        storage.saveHistory(next);
        return next;
      });
    },
    [settings.engineMode]
  );

  const {
    voices,
    status,
    activeChunkText,
    progressPct,
    errorMsg,
    clearError,
    analyserNode,
    speak,
    pause,
    resume,
    stop,
    exportWav,
  } = useSpeechEngine({
    settings,
    rules,
    androidConfig,
    onVoiceAutoSelect: handleVoiceAutoSelect,
    onSpokenComplete: handleSpokenComplete,
  });

  const activeVoiceName = useMemo(() => {
    const found = voices.find((v) => v.voiceURI === settings.selectedVoiceURI);
    if (found) return `${found.name} (${found.lang})`;
    if (voices.length > 0) return `${voices[0].name} (${voices[0].lang})`;
    return 'Padrão do Sistema (pt-BR)';
  }, [settings.selectedVoiceURI, voices]);

  const switchTab = (tab: AppTab) => {
    triggerHaptic(8, androidConfig.hapticsEnabled);
    setActiveTab(tab);
  };

  const handleAddRule = (from: string, to: string) => {
    const next = [...rules, { id: `r_${Date.now()}`, from, to, enabled: true }];
    setRules(next);
    storage.saveRules(next);
  };

  const handleToggleRule = (id: string) => {
    const next = rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    setRules(next);
    storage.saveRules(next);
  };

  const handleDeleteRule = (id: string) => {
    const next = rules.filter((r) => r.id !== id);
    setRules(next);
    storage.saveRules(next);
  };

  const handleAddPhrase = (title: string, phraseText: string, category: PhraseCategory) => {
    const next: SavedPhrase[] = [
      {
        id: `p_${Date.now()}`,
        title,
        text: phraseText,
        category,
        createdAt: Date.now(),
      },
      ...phrases,
    ];
    setPhrases(next);
    storage.savePhrases(next);
  };

  const handleSaveFromStudio = (phraseText: string) => {
    const snippet = phraseText.split(/\s+/).slice(0, 4).join(' ');
    handleAddPhrase(
      snippet.length > 28 ? `${snippet.slice(0, 28)}…` : snippet,
      phraseText,
      'Personalizado'
    );
  };

  const handleDeletePhrase = (id: string) => {
    const next = phrases.filter((p) => p.id !== id);
    setPhrases(next);
    storage.savePhrases(next);
  };

  const handleClearHistory = () => {
    setHistory([]);
    storage.saveHistory([]);
  };

  const handleSpeakExternal = (targetText: string) => {
    handleTextChange(targetText);
    speak(targetText);
  };

  const handleLoadIntoEditor = (targetText: string) => {
    handleTextChange(targetText);
    switchTab('studio');
  };

  const handleAddAiMessages = (userMsg: AiChatMessage, modelMsg: AiChatMessage) => {
    setAiMessages((prev) => {
      const next = [...prev, userMsg, modelMsg].slice(-30);
      storage.saveAiChat(next);
      return next;
    });
  };

  const handleClearAiChat = () => {
    setAiMessages(DEFAULT_AI_CHAT);
    storage.saveAiChat(DEFAULT_AI_CHAT);
  };

  const handleApplyScriptFromAi = (script: string, speakImmediately = false) => {
    handleTextChange(script);
    switchTab('studio');
    if (speakImmediately) {
      window.setTimeout(() => speak(script), 50);
    }
  };

  const handleQuickAiOptimize = async () => {
    if (!text.trim() || aiOptimizing) return;
    setAiOptimizing(true);
    triggerHaptic(10, androidConfig.hapticsEnabled);
    try {
      const data = await postApiJson<{
        suggestedScript?: string;
        reply?: string;
      }>(
        '/api/ai/assist',
        {
          message: 'Otimize este texto para locução natural em português com pausas equilibradas.',
          currentText: text,
          mode: 'optimize',
        },
        androidConfig.backendUrl
      );
      if (data.suggestedScript) {
        handleTextChange(data.suggestedScript);
      }
    } catch {
      // Static host without remote backend URL configured
    } finally {
      setAiOptimizing(false);
    }
  };

  const statusBarTopClass =
    androidConfig.statusBarOffsetPx >= 40
      ? 'pt-10'
      : androidConfig.statusBarOffsetPx >= 32
        ? 'pt-8'
        : androidConfig.statusBarOffsetPx >= 24
          ? 'pt-6'
          : 'pt-safe';

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#0e1116] text-stone-900 dark:text-stone-100 flex flex-col">
      {/* Compact Sticky Header with Android WebView status bar clearance */}
      <header
        className={`sticky top-0 z-30 ${statusBarTopClass} bg-stone-50/90 dark:bg-[#0e1116]/90 backdrop-blur-md border-b border-stone-200 dark:border-slate-800/90`}
      >
        <div className="max-w-6xl mx-auto h-12 lg:h-14 px-4 flex items-center justify-between gap-8">
          <span className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-white whitespace-nowrap shrink-0">
            VozSynth
          </span>

          <nav
            aria-label="Navegação principal"
            className="hidden lg:flex items-center gap-6 text-sm font-medium text-stone-600 dark:text-stone-400"
          >
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => switchTab(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === item.id
                    ? 'text-orange-500 font-semibold border-b-2 border-orange-500'
                    : 'hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => updateAndroidConfig({ darkMode: !androidConfig.darkMode })}
              aria-label={androidConfig.darkMode ? 'Ativar tema claro' : 'Ativar tema escuro'}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {androidConfig.darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Responsive Workspace */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pt-4 pb-24 lg:pb-10">
        <div className="lg:grid lg:grid-cols-12 lg:gap-6 items-start">
          {/* Primary Active Mobile/Desktop View */}
          <div className="lg:col-span-7">
            {activeTab === 'studio' && (
              <StudioView
                text={text}
                onTextChange={handleTextChange}
                settings={settings}
                onUpdateSettings={updateSettings}
                status={status}
                activeChunkText={activeChunkText}
                progressPct={progressPct}
                errorMsg={errorMsg}
                onClearError={clearError}
                analyserNode={analyserNode}
                activeVoiceName={activeVoiceName}
                onSpeak={() => speak(text)}
                onPause={pause}
                onResume={resume}
                onStop={stop}
                onExportWav={(share) => exportWav(text, share)}
                onSaveAsPhrase={handleSaveFromStudio}
                onQuickAiOptimize={handleQuickAiOptimize}
                aiOptimizing={aiOptimizing}
              />
            )}

            {activeTab === 'voices' && (
              <VoiceEffectsView
                voices={voices}
                settings={settings}
                backendUrl={androidConfig.backendUrl}
                status={status}
                activeChunkText={activeChunkText}
                errorMsg={errorMsg}
                onClearError={clearError}
                onStop={stop}
                onUpdateSettings={updateSettings}
                onResetSettings={() =>
                  updateSettings({
                    ...DEFAULT_VOICE_SETTINGS,
                    selectedVoiceURI: settings.selectedVoiceURI,
                  })
                }
                onTestVoice={(sample, overridePatch) => speak(sample, overridePatch)}
                rules={rules}
                onAddRule={handleAddRule}
                onToggleRule={handleToggleRule}
                onDeleteRule={handleDeleteRule}
              />
            )}

            {activeTab === 'ai' && (
              <AiAssistantView
                messages={aiMessages}
                currentStudioText={text}
                backendUrl={androidConfig.backendUrl}
                onAddMessages={handleAddAiMessages}
                onClearChat={handleClearAiChat}
                onApplyScriptToStudio={handleApplyScriptFromAi}
                onAddPronunciationRule={handleAddRule}
              />
            )}

            {activeTab === 'phrases' && (
              <PhrasesHistoryView
                phrases={phrases}
                history={history}
                onSpeakText={handleSpeakExternal}
                onLoadIntoEditor={handleLoadIntoEditor}
                onAddPhrase={handleAddPhrase}
                onDeletePhrase={handleDeletePhrase}
                onClearHistory={handleClearHistory}
              />
            )}

            {activeTab === 'android' && (
              <AndroidApkView
                config={androidConfig}
                onUpdateConfig={updateAndroidConfig}
              />
            )}
          </div>

          {/* Desktop Companion Column */}
          <aside className="hidden lg:block lg:col-span-5 space-y-4">
            {activeTab === 'studio' && (
              <AiAssistantView
                messages={aiMessages}
                currentStudioText={text}
                backendUrl={androidConfig.backendUrl}
                onAddMessages={handleAddAiMessages}
                onClearChat={handleClearAiChat}
                onApplyScriptToStudio={handleApplyScriptFromAi}
                onAddPronunciationRule={handleAddRule}
              />
            )}
            {activeTab !== 'studio' && activeTab !== 'voices' && (
              <VoiceEffectsView
                voices={voices}
                settings={settings}
                backendUrl={androidConfig.backendUrl}
                status={status}
                activeChunkText={activeChunkText}
                errorMsg={errorMsg}
                onClearError={clearError}
                onStop={stop}
                onUpdateSettings={updateSettings}
                onResetSettings={() =>
                  updateSettings({
                    ...DEFAULT_VOICE_SETTINGS,
                    selectedVoiceURI: settings.selectedVoiceURI,
                  })
                }
                onTestVoice={(sample, overridePatch) => speak(sample, overridePatch)}
                rules={rules}
                onAddRule={handleAddRule}
                onToggleRule={handleToggleRule}
                onDeleteRule={handleDeleteRule}
              />
            )}
            {activeTab === 'voices' && (
              <PhrasesHistoryView
                phrases={phrases}
                history={history}
                onSpeakText={handleSpeakExternal}
                onLoadIntoEditor={handleLoadIntoEditor}
                onAddPhrase={handleAddPhrase}
                onDeletePhrase={handleDeletePhrase}
                onClearHistory={handleClearHistory}
              />
            )}
          </aside>
        </div>
      </main>

      {/* Mobile Fixed Bottom Tab Bar (5 Thumb-Zone Tabs) */}
      <nav
        aria-label="Menu inferior"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#12161d]/95 backdrop-blur-md border-t border-stone-200 dark:border-slate-800 pb-safe"
      >
        <div className="grid grid-cols-5 h-[60px] items-center">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchTab(item.id)}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-orange-500'
                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 2.25 : 1.75} />
                <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <OfflineIndicator />
    </div>
  );
}
