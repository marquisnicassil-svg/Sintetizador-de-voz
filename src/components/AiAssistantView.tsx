import React, { useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookPlus,
  Bot,
  Loader2,
  Play,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { AiChatMessage } from '../types/synth';
import { postApiJson } from '../utils/androidHelpers';

interface AiAssistantViewProps {
  messages: AiChatMessage[];
  currentStudioText: string;
  backendUrl?: string;
  onAddMessages: (userMsg: AiChatMessage, modelMsg: AiChatMessage) => void;
  onClearChat: () => void;
  onApplyScriptToStudio: (script: string, speakImmediately?: boolean) => void;
  onAddPronunciationRule: (from: string, to: string) => void;
}

const QUICK_ACTIONS = [
  {
    id: 'optimize',
    label: 'Melhorar texto atual',
    mode: 'optimize',
    prompt: 'Melhore meu texto atual do estúdio com pausas naturais para locução.',
  },
  {
    id: 'script',
    label: 'Roteiro Reels / Vídeo',
    mode: 'script',
    prompt: 'Crie um roteiro curto de 20 segundos empolgante para apresentar um aplicativo no celular.',
  },
  {
    id: 'dialogue',
    label: 'Diálogo para 2 vozes',
    mode: 'dialogue',
    prompt: 'Crie um diálogo curto e natural de podcast sobre tecnologia no dia a dia.',
  },
  {
    id: 'translate',
    label: 'Traduzir p/ Inglês',
    mode: 'translate',
    prompt: 'Traduza o texto atual do estúdio para inglês natural falado.',
  },
];

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  messages,
  currentStudioText,
  backendUrl,
  onAddMessages,
  onClearChat,
  onApplyScriptToStudio,
  onAddPronunciationRule,
}) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedRules, setAddedRules] = useState<Record<string, boolean>>({});
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const sendPrompt = async (
    promptText: string,
    mode: string = 'chat',
    targetLang = 'en-US'
  ) => {
    const clean = promptText.trim();
    if (!clean || loading) return;

    setError(null);
    setLoading(true);

    const userMsg: AiChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: clean,
      timestamp: Date.now(),
    };

    try {
      const data = await postApiJson<{
        reply?: string;
        suggestedScript?: string;
        pronunciationSuggestions?: { from: string; to: string }[];
      }>(
        '/api/ai/assist',
        {
          message: clean,
          currentText: currentStudioText,
          mode,
          targetLang,
          history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        },
        backendUrl
      );

      const modelMsg: AiChatMessage = {
        id: `m_${Date.now() + 1}`,
        role: 'model',
        text: data.reply || 'Pronto!',
        suggestedScript: data.suggestedScript || undefined,
        pronunciationSuggestions: data.pronunciationSuggestions,
        timestamp: Date.now(),
      };

      onAddMessages(userMsg, modelMsg);
      setInput('');
      window.setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Sem resposta da IA. Verifique a conexão de rede.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendPrompt(input, 'chat');
  };

  return (
    <div className="space-y-4">
      {/* Header + Quick Thumb Actions */}
      <section className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-orange-500/15 text-orange-500 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100 truncate">
                Assistente de Voz IA
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                Cria roteiros, insere pausas e corrige pronúncia
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClearChat}
            aria-label="Limpar conversa com a IA"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-400 hover:text-red-500 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={loading}
              onClick={() => sendPrompt(action.prompt, action.mode)}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-stone-100 dark:bg-[#0e1116] hover:bg-stone-200 dark:hover:bg-slate-800 disabled:opacity-50 text-left text-xs font-medium text-stone-800 dark:text-stone-200 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <span className="truncate">{action.label}</span>
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-2xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-xs text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {/* Conversation Stream */}
      <section className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-3.5 space-y-3">
        <div className="max-h-[420px] overflow-y-auto space-y-3 pr-1">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-orange-500 text-white'
                      : 'bg-stone-100 dark:bg-[#0e1116] text-stone-800 dark:text-stone-200 border border-stone-200/70 dark:border-slate-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {msg.suggestedScript && (
                    <div className="mt-3 pt-2.5 border-t border-stone-200 dark:border-slate-800 space-y-2">
                      <p className="text-[11px] font-semibold text-orange-500">
                        Roteiro pronto para síntese
                      </p>
                      <p className="text-xs sm:text-sm bg-white dark:bg-[#151a22] rounded-xl p-2.5 border border-stone-200 dark:border-slate-800 text-stone-800 dark:text-stone-100 whitespace-pre-wrap">
                        {msg.suggestedScript}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onApplyScriptToStudio(msg.suggestedScript!, true)}
                          className="min-h-[44px] px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Ouvir Agora</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onApplyScriptToStudio(msg.suggestedScript!, false)}
                          className="min-h-[44px] px-3 rounded-xl bg-stone-200/80 dark:bg-slate-800 hover:bg-stone-300 dark:hover:bg-slate-700 text-stone-800 dark:text-stone-100 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>Enviar ao Estúdio</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {msg.pronunciationSuggestions && msg.pronunciationSuggestions.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-stone-200 dark:border-slate-800 space-y-1.5">
                      <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                        Sugestões de pronúncia
                      </p>
                      {msg.pronunciationSuggestions.map((item, idx) => {
                        const key = `${msg.id}_${idx}`;
                        const saved = !!addedRules[key];
                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between gap-2 bg-white dark:bg-[#151a22] rounded-xl px-2.5 py-1.5 border border-stone-200 dark:border-slate-800"
                          >
                            <span className="text-xs font-mono-tabular truncate">
                              {item.from} → {item.to}
                            </span>
                            <button
                              type="button"
                              disabled={saved}
                              onClick={() => {
                                onAddPronunciationRule(item.from, item.to);
                                setAddedRules((prev) => ({ ...prev, [key]: true }));
                              }}
                              className="min-h-[36px] px-2.5 rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400 text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-60"
                            >
                              <BookPlus className="w-3.5 h-3.5" />
                              <span>{saved ? 'Adicionada' : 'Salvar'}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
              <span>A IA está escrevendo a resposta...</span>
            </div>
          )}
          <div ref={listEndRef} />
        </div>

        {/* Prompt Input */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-slate-800">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Peça um roteiro, revisão ou ajuda à IA..."
            className="flex-1 min-h-[46px] px-3.5 rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="Enviar para IA"
            className="min-h-[46px] min-w-[46px] px-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </section>
    </div>
  );
};
