import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  Globe,
  Loader2,
  RefreshCw,
  Smartphone,
  Terminal,
  XCircle,
} from 'lucide-react';
import type { AndroidAppConfig, DiagnosticItem } from '../types/synth';
import {
  downloadTextFile,
  generateAndroidManifestXml,
  generateCapacitorConfigJson,
  isStaticHostingEnvironment,
  resolveApiUrl,
  runAndroidDiagnostics,
} from '../utils/androidHelpers';

interface AndroidApkViewProps {
  config: AndroidAppConfig;
  onUpdateConfig: (patch: Partial<AndroidAppConfig>) => void;
}

const CAPACITOR_BUILD_COMMANDS = `npm install
npm run build
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor-community/text-to-speech
npx cap add android
npx cap sync android
cd android && ./gradlew assembleRelease`;

export const AndroidApkView: React.FC<AndroidApkViewProps> = ({
  config,
  onUpdateConfig,
}) => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [testingBackend, setTestingBackend] = useState(false);
  const [backendStatus, setBackendStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const isStaticHost = isStaticHostingEnvironment();

  const refreshDiagnostics = () => {
    setDiagnostics(runAndroidDiagnostics());
  };

  useEffect(() => {
    refreshDiagnostics();
  }, []);

  const handleCopyCommands = async () => {
    try {
      await navigator.clipboard.writeText(CAPACITOR_BUILD_COMMANDS);
      setCopiedCmd(true);
      window.setTimeout(() => setCopiedCmd(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const handleTestBackend = async () => {
    setTestingBackend(true);
    setBackendStatus(null);
    try {
      const url = resolveApiUrl('/api/health', config.backendUrl);
      const res = await fetch(url);
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        setBackendStatus({
          ok: false,
          message:
            'Nenhuma API encontrada neste endereço (hospedagem estática). Voz Nativa e DSP Offline continuam 100% ativos.',
        });
        return;
      }
      const data = (await res.json()) as { ok?: boolean; service?: string };
      setBackendStatus({
        ok: !!data.ok,
        message: data.ok
          ? `Conectado com sucesso (${data.service || 'API ativa'})`
          : 'Servidor respondeu, mas sem confirmação.',
      });
    } catch {
      setBackendStatus({
        ok: false,
        message: 'Não foi possível conectar à URL informada. Verifique CORS ou conexão.',
      });
    } finally {
      setTestingBackend(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Android Hardware & Mobile Behavior */}
      <section className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-4 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
            Comportamento no Celular Android
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Controles nativos otimizados para uso tátil e bateria
          </p>
        </div>

        <div className="divide-y divide-stone-100 dark:divide-slate-800/80">
          {[
            {
              key: 'darkMode' as const,
              title: 'Tema Escuro AMOLED',
              desc: 'Economia de bateria em telas OLED e alto contraste noturno',
              val: config.darkMode,
            },
            {
              key: 'hapticsEnabled' as const,
              title: 'Vibração Háptica ao Tocar',
              desc: 'Resposta tátil curta ao iniciar, pausar ou exportar áudio',
              val: config.hapticsEnabled,
            },
            {
              key: 'keepScreenAwake' as const,
              title: 'Manter Tela Ativa (WakeLock)',
              desc: 'Impede que o Android apague a tela durante leituras longas',
              val: config.keepScreenAwake,
            },
            {
              key: 'mediaSessionEnabled' as const,
              title: 'Controles na Tela de Bloqueio',
              desc: 'Integra Play/Pausa à barra de notificações do Android',
              val: config.mediaSessionEnabled,
            },
          ].map((item) => (
            <div
              key={item.key}
              className="py-3 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  {item.title}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {item.desc}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={item.val}
                aria-label={item.title}
                onClick={() => onUpdateConfig({ [item.key]: !item.val })}
                className={`relative w-12 h-7 rounded-full transition-colors shrink-0 cursor-pointer ${
                  item.val ? 'bg-orange-500' : 'bg-stone-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    item.val ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}

          {/* Status Bar Offset Selector for Fullscreen APK WebViews */}
          <div className="pt-3 space-y-2">
            <div>
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Espaço p/ Barra de Status (APK Tela Cheia)
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Ajuste caso o topo do app fique em cima da hora do celular no criador de APK
              </p>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: '0 px', value: 0 },
                { label: '24 px', value: 24 },
                { label: '32 px', value: 32 },
                { label: '40 px', value: 40 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    onUpdateConfig({ statusBarOffsetPx: opt.value, statusBarCustom: true })
                  }
                  className={`min-h-[42px] px-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    config.statusBarOffsetPx === opt.value
                      ? 'bg-orange-500 text-white'
                      : 'bg-stone-100 dark:bg-[#0e1116] text-stone-700 dark:text-stone-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <p className="font-semibold">
            Sobre &ldquo;Mecanismo preferencial&rdquo; nas Configurações do Android:
          </p>
          <p className="leading-relaxed">
            Conversores Web-para-APK não fornecem leitura nativa ao TalkBack; se o app aparecer lá emitindo bipe/ruído, selecione <strong>Reconhecimento e síntese de voz do Google</strong> ou <strong>RHVoice</strong> nas configurações do sistema. Para registrá-lo nativamente no sistema, use o arquivo <code className="font-mono-tabular">android-configs/VozSynthTtsService.kt</code> ao compilar pelo Capacitor/Android Studio.
          </p>
        </div>
      </section>

      {/* GitHub Pages & Remote Backend Connection */}
      <section className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex items-start gap-2.5">
          <Globe className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              GitHub Pages e Servidor IA Remoto
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {isStaticHost
                ? 'Executando em hospedagem estática: Voz Nativa e DSP Offline estão ativos sem servidor.'
                : 'Workflow automático incluído (.github/workflows/deploy-pages.yml) para testar no GitHub Pages.'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
            URL do Backend para Vozes IA (opcional no GitHub Pages / APK)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={config.backendUrl}
              onChange={(e) => onUpdateConfig({ backendUrl: e.target.value })}
              placeholder="Deixe vazio no servidor local ou cole https://seu-servidor..."
              className="flex-1 min-h-[44px] px-3 rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-xs sm:text-sm font-mono-tabular text-stone-900 dark:text-stone-100"
            />
            <button
              type="button"
              onClick={handleTestBackend}
              disabled={testingBackend}
              className="min-h-[44px] px-4 rounded-xl bg-stone-900 dark:bg-orange-500 hover:bg-stone-800 dark:hover:bg-orange-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {testingBackend ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>Testar Conexão</span>
            </button>
          </div>
          {backendStatus && (
            <p
              className={`text-xs ${
                backendStatus.ok
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {backendStatus.message}
            </p>
          )}
        </div>
      </section>

      {/* Real Device & WebView Diagnostics */}
      <section className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Diagnóstico do Aparelho / WebView
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Verificação real dos recursos de áudio, offline e APK neste dispositivo
            </p>
          </div>
          <button
            type="button"
            onClick={refreshDiagnostics}
            aria-label="Atualizar diagnóstico"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-stone-100 dark:bg-[#0e1116] hover:bg-stone-200 dark:hover:bg-slate-800 flex items-center justify-center text-stone-700 dark:text-stone-200 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="divide-y divide-stone-100 dark:divide-slate-800/80 rounded-xl border border-stone-200 dark:border-slate-800">
          {diagnostics.map((d) => (
            <div key={d.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">
                  {d.label}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                  {d.detail}
                </p>
              </div>
              {d.supported ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-amber-500 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* APK Compiler Configuration */}
      <section className="rounded-2xl bg-white dark:bg-[#151a22] border border-stone-200 dark:border-slate-800 p-4 space-y-4">
        <div className="flex items-start gap-2.5">
          <Smartphone className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Configurações de Compilação APK
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Gere e baixe os arquivos prontos para Capacitor / Android Studio com permissão TTS_SERVICE para Android 11–15
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
              Nome do Aplicativo
            </label>
            <input
              type="text"
              value={config.appName}
              onChange={(e) => onUpdateConfig({ appName: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-sm text-stone-900 dark:text-stone-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
              Application ID (Pacote)
            </label>
            <input
              type="text"
              value={config.appId}
              onChange={(e) => onUpdateConfig({ appId: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-sm font-mono-tabular text-stone-900 dark:text-stone-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
              Versão (versionName / Code)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={config.versionName}
                onChange={(e) => onUpdateConfig({ versionName: e.target.value })}
                className="w-full min-h-[44px] px-3 rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-sm font-mono-tabular text-stone-900 dark:text-stone-100"
              />
              <input
                type="number"
                min={1}
                value={config.versionCode}
                onChange={(e) =>
                  onUpdateConfig({ versionCode: Math.max(1, parseInt(e.target.value, 10) || 1) })
                }
                className="w-full min-h-[44px] px-3 rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-sm font-mono-tabular text-stone-900 dark:text-stone-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1">
              Orientação da Tela
            </label>
            <select
              value={config.orientation}
              onChange={(e) =>
                onUpdateConfig({
                  orientation: e.target.value as AndroidAppConfig['orientation'],
                })
              }
              className="w-full min-h-[44px] px-3 rounded-xl bg-stone-50 dark:bg-[#0e1116] border border-stone-200 dark:border-slate-800 text-sm text-stone-900 dark:text-stone-100"
            >
              <option value="portrait">Retrato (Portrait · Ideal Celular)</option>
              <option value="landscape">Paisagem (Landscape)</option>
              <option value="sensor">Automático (Sensor)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                'capacitor.config.json',
                generateCapacitorConfigJson(config),
                'application/json'
              )
            }
            className="min-h-[46px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Baixar capacitor.config.json</span>
          </button>

          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                'AndroidManifest.xml',
                generateAndroidManifestXml(config),
                'application/xml'
              )
            }
            className="min-h-[46px] px-4 rounded-xl bg-stone-900 dark:bg-slate-700 hover:bg-stone-800 dark:hover:bg-slate-600 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Baixar AndroidManifest.xml</span>
          </button>
        </div>

        {/* APK Compilation CLI */}
        <div className="rounded-xl bg-stone-950 text-stone-100 p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-stone-300">
              <Terminal className="w-4 h-4 text-orange-400" />
              <span>Comandos para gerar o .APK via Capacitor</span>
            </div>
            <button
              type="button"
              onClick={handleCopyCommands}
              className="min-h-[36px] px-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedCmd ? 'Copiado!' : 'Copiar'}</span>
            </button>
          </div>
          <pre className="text-xs font-mono-tabular text-stone-300 overflow-x-auto leading-relaxed">
            {CAPACITOR_BUILD_COMMANDS}
          </pre>
        </div>
      </section>
    </div>
  );
};
