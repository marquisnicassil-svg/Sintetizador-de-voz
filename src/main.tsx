import React from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erro inesperado ao carregar interface.',
    };
  }

  handleReset = () => {
    try {
      localStorage.clear();
    } catch {
      // Ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0e1116] text-stone-100 flex items-center justify-center p-6">
          <div className="max-w-sm w-full rounded-2xl bg-[#151a22] border border-slate-800 p-5 space-y-3 text-center">
            <h1 className="text-base font-bold text-white">VozSynth Android</h1>
            <p className="text-xs text-stone-300">
              Ocorreu um erro ao iniciar o aplicativo neste dispositivo: {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="w-full min-h-[44px] rounded-xl bg-orange-500 text-white text-sm font-semibold cursor-pointer"
            >
              Restaurar e Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
