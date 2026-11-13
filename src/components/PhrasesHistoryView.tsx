import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Clock, Play, Plus, Trash2 } from 'lucide-react';
import type { HistoryEntry, PhraseCategory, SavedPhrase } from '../types/synth';

interface PhrasesHistoryViewProps {
  phrases: SavedPhrase[];
  history: HistoryEntry[];
  onSpeakText: (text: string) => void;
  onLoadIntoEditor: (text: string) => void;
  onAddPhrase: (title: string, text: string, category: PhraseCategory) => void;
  onDeletePhrase: (id: string) => void;
  onClearHistory: () => void;
}

const CATEGORIES: ('Todas' | PhraseCategory)[] = [
  'Todas',
  'Acessibilidade',
  'Locução',
  'Saudações',
  'Personalizado',
];

export const PhrasesHistoryView: React.FC<PhrasesHistoryViewProps> = ({
  phrases,
  history,
  onSpeakText,
  onLoadIntoEditor,
  onAddPhrase,
  onDeletePhrase,
  onClearHistory,
}) => {
  const [subTab, setSubTab] = useState<'phrases' | 'history'>('phrases');
  const [catFilter, setCatFilter] = useState<'Todas' | PhraseCategory>('Todas');
  const [newTitle, setNewTitle] = useState('');
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState<PhraseCategory>('Personalizado');
  const [showAddForm, setShowAddForm] = useState(false);

  const filteredPhrases = useMemo(() => {
    if (catFilter === 'Todas') return phrases;
    return phrases.filter((p) => p.category === catFilter);
  }, [catFilter, phrases]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newText.trim()) return;
    onAddPhrase(newTitle.trim(), newText.trim(), newCategory);
    setNewTitle('');
    setNewText('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-4">
      {/* Segmented Sub-Tab */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setSubTab('phrases')}
          className={`min-h-[44px] px-3 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
            subTab === 'phrases'
              ? 'bg-orange-500 text-white'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
        >
          Frases Rápidas ({phrases.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('history')}
          className={`min-h-[44px] px-3 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
            subTab === 'history'
              ? 'bg-orange-500 text-white'
              : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
          }`}
        >
          Histórico ({history.length})
        </button>
      </div>

      {subTab === 'phrases' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatFilter(cat)}
                  className={`min-h-[40px] px-3 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    catFilter === cat
                      ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                      : 'bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 text-stone-600 dark:text-stone-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm((prev) => !prev)}
              className="min-h-[44px] px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nova</span>
            </button>
          </div>

          {showAddForm && (
            <form
              onSubmit={handleCreate}
              className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-4 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Título curto (ex: Pedido no balcão)"
                  className="min-h-[44px] px-3 rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-sm text-stone-900 dark:text-stone-100"
                />
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as PhraseCategory)}
                  className="min-h-[44px] px-3 rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-sm text-stone-900 dark:text-stone-100"
                >
                  <option value="Personalizado">Personalizado</option>
                  <option value="Acessibilidade">Acessibilidade</option>
                  <option value="Locução">Locução</option>
                  <option value="Saudações">Saudações</option>
                </select>
              </div>
              <textarea
                rows={3}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Texto da frase rápida..."
                className="w-full p-3 rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-sm text-stone-900 dark:text-stone-100"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="min-h-[44px] px-4 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-400 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim() || !newText.trim()}
                  className="min-h-[44px] px-5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                >
                  Salvar Frase
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2.5">
            {filteredPhrases.map((phrase) => (
              <article
                key={phrase.id}
                className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-3.5 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                      {phrase.title}
                    </h3>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {phrase.category} · {phrase.text.length} caracteres
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeletePhrase(phrase.id)}
                    aria-label={`Excluir ${phrase.title}`}
                    className="min-h-[44px] min-w-[44px] -m-1.5 flex items-center justify-center rounded-xl text-stone-400 hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                  {phrase.text}
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onSpeakText(phrase.text)}
                    className="min-h-[44px] px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Falar Agora</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onLoadIntoEditor(phrase.text)}
                    className="min-h-[44px] px-3 rounded-xl bg-stone-100 dark:bg-[#0e1116] hover:bg-stone-200 dark:hover:bg-slate-800 text-stone-800 dark:text-stone-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>Abrir no Estúdio</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
              <Clock className="w-4 h-4 text-orange-500" />
              <span>Reproduções Recentes</span>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="min-h-[40px] px-3 rounded-xl text-xs font-medium text-red-500 hover:bg-red-500/10 cursor-pointer"
              >
                Limpar Tudo
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="py-8 text-center text-xs text-stone-500 dark:text-stone-400">
              Nenhuma síntese registrada ainda. Ao falar no Estúdio, o histórico aparece aqui para repetição rápida.
            </p>
          ) : (
            <div className="divide-y divide-stone-100 dark:divide-slate-800/80">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-stone-800 dark:text-stone-200 line-clamp-2">
                      {item.text}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400 font-mono-tabular">
                      {new Date(item.timestamp).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {item.engineMode === 'dsp-formant' ? 'DSP WAV' : 'TTS Nativo'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSpeakText(item.text)}
                    aria-label="Repetir fala"
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-orange-500/10 hover:bg-orange-500 text-orange-500 hover:text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
