import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[76px] lg:bottom-5 left-4 z-40 flex items-center gap-2 rounded-xl bg-amber-500/95 px-3.5 py-2 text-xs font-semibold text-stone-950 shadow-lg backdrop-blur-md"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Modo Offline Ativo · Síntese local operando normalmente</span>
    </div>
  );
};
