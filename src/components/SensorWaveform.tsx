import React, { useEffect, useRef } from 'react';
import type { MotionSample } from '../types';
import { Activity, Radio } from 'lucide-react';

interface SensorWaveformProps {
  recentMotion: MotionSample[];
  peakThreshold: number;
  pitch: number;
  roll: number;
  heading: number;
  motionEventCount?: number;
  hasHardwareMotion?: boolean;
}

export const SensorWaveform: React.FC<SensorWaveformProps> = ({
  recentMotion,
  peakThreshold,
  pitch,
  roll,
  heading,
  motionEventCount = 0,
  hasHardwareMotion = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Draw Grid Lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let y = 0; y < height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Baseline & Scale
    const maxVal = 4.0;
    const getY = (val: number) => {
      const clamped = Math.max(0, Math.min(maxVal, val));
      return height - (clamped / maxVal) * (height - 14) - 7;
    };

    // Draw Peak Threshold line
    const threshY = getY(peakThreshold);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(width, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label for threshold
    ctx.fillStyle = '#ef4444';
    ctx.font = '9px monospace';
    ctx.fillText(`TRIGGER THRESHOLD: ${peakThreshold.toFixed(2)} m/s²`, 6, threshY - 4);

    if (recentMotion.length < 2) return;

    const stepX = width / Math.max(recentMotion.length - 1, 1);

    // Draw Filtered Dynamic Acceleration Waveform (Amber)
    ctx.beginPath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;

    recentMotion.forEach((sample, i) => {
      const x = i * stepX;
      const y = getY(sample.filteredMagnitude);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw Step Detection Peak Points
    recentMotion.forEach((sample, i) => {
      if (sample.isPeak) {
        const x = i * stepX;
        const y = getY(sample.filteredMagnitude);

        // Highlight marker
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  }, [recentMotion, peakThreshold]);

  const latestSample = recentMotion[recentMotion.length - 1];

  return (
    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col gap-2 shadow-lg">
      <div className="flex items-center justify-between text-xs font-mono text-slate-400">
        <div className="flex items-center gap-1.5 uppercase">
          <Activity className="w-3.5 h-3.5 text-amber-400" />
          <span>Live Dynamic Accel Waveform</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {hasHardwareMotion ? (
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <Radio className="w-3 h-3 animate-pulse" />
              <span>STREAMING ({motionEventCount})</span>
            </span>
          ) : (
            <span className="text-slate-500 font-mono">
              EVENTS: {motionEventCount}
            </span>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="w-full h-24 overflow-hidden rounded-lg border border-slate-800 relative bg-slate-950">
        <canvas
          ref={canvasRef}
          width={400}
          height={96}
          className="w-full h-full block"
        />
      </div>

      {/* Real-time Multi-Axis IMU & Orientation Telemetry Readout */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 text-[10px] font-mono bg-slate-950/80 p-2 rounded-lg border border-slate-800/80 text-slate-300">
        <div>
          <span className="text-slate-500">AX: </span>
          <span className="text-slate-200 font-semibold">{latestSample ? latestSample.ax.toFixed(2) : '0.00'}</span>
        </div>
        <div>
          <span className="text-slate-500">AY: </span>
          <span className="text-slate-200 font-semibold">{latestSample ? latestSample.ay.toFixed(2) : '0.00'}</span>
        </div>
        <div>
          <span className="text-slate-500">AZ: </span>
          <span className="text-slate-200 font-semibold">{latestSample ? latestSample.az.toFixed(2) : '0.00'}</span>
        </div>
        <div>
          <span className="text-slate-500">PITCH: </span>
          <span className="text-slate-200 font-semibold">{pitch.toFixed(1)}°</span>
        </div>
        <div>
          <span className="text-slate-500">ROLL: </span>
          <span className="text-slate-200 font-semibold">{roll.toFixed(1)}°</span>
        </div>
        <div>
          <span className="text-amber-400 font-bold">HDG: </span>
          <span className="text-amber-400 font-bold">{Math.round(heading)}°</span>
        </div>
      </div>
    </div>
  );
};
