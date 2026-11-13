import React, { useEffect, useState } from 'react';
import { AppIconMark } from './AppIconMark';

interface AppSplashScreenProps {
  onComplete: () => void;
}

export const AppSplashScreen: React.FC<AppSplashScreenProps> = ({ onComplete }) => {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => {
      setFadingOut(true);
    }, 1250);

    const doneTimer = window.setTimeout(() => {
      onComplete();
    }, 1580);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <div
      role="status"
      aria-label="Abrindo VozSynth Android"
      onClick={() => {
        setFadingOut(true);
        window.setTimeout(onComplete, 180);
      }}
      className={`fixed inset-0 z-50 bg-[#0e1116] flex flex-col items-center justify-center px-6 transition-opacity duration-300 cursor-pointer ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center text-center">
        <div className="animate-splash-icon rounded-[28px] shadow-2xl shadow-orange-500/20">
          <AppIconMark size={88} animated />
        </div>

        <h1 className="animate-splash-title mt-5 text-2xl font-bold text-white tracking-tight">
          VozSynth
        </h1>
        <p className="animate-splash-subtitle mt-1 text-xs font-medium tracking-widest uppercase text-orange-400">
          Android
        </p>
      </div>
    </div>
  );
};
