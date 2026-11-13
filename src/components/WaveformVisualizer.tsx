import React, { useEffect, useRef } from 'react';
import type { PlaybackStatus } from '../hooks/useSpeechEngine';
import type { SynthEngineMode } from '../types/synth';

interface WaveformVisualizerProps {
  status: PlaybackStatus;
  engineMode: SynthEngineMode;
  analyserNode: AnalyserNode | null;
  progressPct: number;
  rate: number;
  pitch: number;
}

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  status,
  engineMode,
  analyserNode,
  progressPct,
  rate,
  pitch,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const freqData = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : null;
    let phase = 0;

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const targetW = Math.max(1, Math.floor(rect.width * dpr));
      const targetH = Math.max(1, Math.floor(rect.height * dpr));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const isSpeaking = status === 'speaking';
      const isPaused = status === 'paused';
      const isRendering = status === 'rendering';

      // Center hairline baseline
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const barCount = 36;
      const gap = 4 * dpr;
      const barWidth = Math.max(2 * dpr, (w - gap * (barCount - 1)) / barCount);

      if (analyserNode && freqData && isSpeaking) {
        analyserNode.getByteFrequencyData(freqData);
        for (let i = 0; i < barCount; i++) {
          const binIdx = Math.min(freqData.length - 1, Math.floor((i / barCount) * (freqData.length * 0.65)));
          const norm = freqData[binIdx] / 255;
          const barH = Math.max(4 * dpr, norm * (h * 0.86));
          const x = i * (barWidth + gap);
          const y = (h - barH) / 2;

          ctx.fillStyle = norm > 0.55 ? '#f97316' : 'rgba(251, 146, 60, 0.72)';
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barH, barWidth / 2);
          ctx.fill();
        }
      } else {
        phase += isSpeaking ? 0.14 * rate : isRendering ? 0.22 : 0.02;
        for (let i = 0; i < barCount; i++) {
          const pos = i / barCount;
          const envelope = Math.sin(pos * Math.PI);
          let amp = 0.08;
          if (isSpeaking) {
            amp =
              0.22 +
              0.58 *
                envelope *
                Math.abs(
                  Math.sin(phase + i * 0.42 * pitch) *
                    Math.cos(phase * 0.65 - i * 0.23)
                );
          } else if (isPaused) {
            amp = 0.18 * envelope + 0.06;
          } else if (isRendering) {
            amp = 0.25 + 0.35 * Math.abs(Math.sin(phase + i * 0.5));
          } else {
            amp = 0.06 + 0.06 * envelope * Math.abs(Math.sin(phase * 0.5 + i * 0.3));
          }

          const barH = Math.max(4 * dpr, amp * (h * 0.82));
          const x = i * (barWidth + gap);
          const y = (h - barH) / 2;

          if (isSpeaking) {
            ctx.fillStyle = i / barCount <= progressPct / 100 ? '#f97316' : 'rgba(251, 146, 60, 0.45)';
          } else if (isPaused) {
            ctx.fillStyle = 'rgba(245, 158, 11, 0.55)';
          } else {
            ctx.fillStyle = 'rgba(148, 163, 184, 0.32)';
          }

          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barH, barWidth / 2);
          ctx.fill();
        }
      }

      if (isSpeaking || isRendering) {
        rafId = requestAnimationFrame(draw);
      }
    };

    draw();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [analyserNode, engineMode, pitch, progressPct, rate, status]);

  return (
    <div className="relative w-full h-24 rounded-2xl bg-stone-100 dark:bg-[#0b0e13] border border-stone-200 dark:border-slate-800/90 px-3 py-2 overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
