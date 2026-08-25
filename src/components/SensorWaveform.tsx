import React, { useEffect, useRef, useState } from 'react';
import type { MotionSample } from '../types';
import { Activity, Radio, RotateCw, Waves } from 'lucide-react';

export type WaveformViewMode = 'DUAL' | 'ACCEL' | 'GYRO';

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
  const accelCanvasRef = useRef<HTMLCanvasElement>(null);
  const gyroCanvasRef = useRef<HTMLCanvasElement>(null);
  const [viewMode, setViewMode] = useState<WaveformViewMode>('DUAL');

  // Draw Accelerometer Dynamic Waveform
  useEffect(() => {
    const canvas = accelCanvasRef.current;
    if (!canvas || (viewMode === 'GYRO')) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Grid Lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let y = 0; y < height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const maxVal = 4.0;
    const getY = (val: number) => {
      const clamped = Math.max(0, Math.min(maxVal, val));
      return height - (clamped / maxVal) * (height - 14) - 7;
    };

    // Trigger Threshold line
    const threshY = getY(peakThreshold);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(width, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ef4444';
    ctx.font = '9px monospace';
    ctx.fillText(`TH: ${peakThreshold.toFixed(2)} m/s²`, 6, threshY - 4);

    if (recentMotion.length < 2) return;

    const stepX = width / Math.max(recentMotion.length - 1, 1);

    // Draw Filtered Accel Waveform
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

    // Step Peak Points
    recentMotion.forEach((sample, i) => {
      if (sample.isPeak) {
        const x = i * stepX;
        const y = getY(sample.filteredMagnitude);

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  }, [recentMotion, peakThreshold, viewMode]);

  // Draw Gyroscope 3-Axis Angular Velocity Waveform
  useEffect(() => {
    const canvas = gyroCanvasRef.current;
    if (!canvas || (viewMode === 'ACCEL')) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Center Zero Line
    const midY = height / 2;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // Scale: -50 deg/s to +50 deg/s
    const maxDegS = 50.0;
    const getGyroY = (degS: number) => {
      const clamped = Math.max(-maxDegS, Math.min(maxDegS, degS));
      return midY - (clamped / maxDegS) * (midY - 6);
    };

    ctx.fillStyle = '#64748b';
    ctx.font = '8px monospace';
    ctx.fillText('+50°/s', 4, 10);
    ctx.fillText('0°/s', 4, midY - 2);
    ctx.fillText('-50°/s', 4, height - 4);

    if (recentMotion.length < 2) return;

    const stepX = width / Math.max(recentMotion.length - 1, 1);

    // 1. Draw Gyro Z (Yaw rate - Cyan)
    ctx.beginPath();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    recentMotion.forEach((sample, i) => {
      const x = i * stepX;
      const y = getGyroY(sample.gz);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 2. Draw Gyro X (Pitch rate - Rose)
    ctx.beginPath();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.2;
    recentMotion.forEach((sample, i) => {
      const x = i * stepX;
      const y = getGyroY(sample.gx);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 3. Draw Gyro Y (Roll rate - Emerald)
    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.2;
    recentMotion.forEach((sample, i) => {
      const x = i * stepX;
      const y = getGyroY(sample.gy);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [recentMotion, viewMode]);

  const latestSample = recentMotion[recentMotion.length - 1];

  return (
    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col gap-2.5 shadow-xl font-mono text-xs">
      {/* Header with View Mode Tabs & Live Stream Indicator */}
      <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 uppercase font-bold text-slate-200">
          <Waves className="w-3.5 h-3.5 text-amber-400" />
          <span>Sensor Waveforms</span>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px]">
          <button
            onClick={() => setViewMode('DUAL')}
            className={`px-2 py-0.5 rounded ${
              viewMode === 'DUAL'
                ? 'bg-indigo-600 text-white font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            DUAL
          </button>
          <button
            onClick={() => setViewMode('ACCEL')}
            className={`px-2 py-0.5 rounded ${
              viewMode === 'ACCEL'
                ? 'bg-amber-600 text-white font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ACCEL
          </button>
          <button
            onClick={() => setViewMode('GYRO')}
            className={`px-2 py-0.5 rounded ${
              viewMode === 'GYRO'
                ? 'bg-sky-600 text-white font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            GYRO
          </button>
        </div>

        <div className="flex items-center gap-1 text-[10px]">
          {hasHardwareMotion ? (
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <Radio className="w-3 h-3 animate-pulse" />
              <span>IMU LIVE</span>
            </span>
          ) : (
            <span className="text-slate-500">
              EV: {motionEventCount}
            </span>
          )}
        </div>
      </div>

      {/* Accelerometer Waveform Panel */}
      {(viewMode === 'DUAL' || viewMode === 'ACCEL') && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-amber-400 font-bold">
            <div className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-amber-400" />
              <span>ACCELEROMETER (DYNAMIC GAIT)</span>
            </div>
            <span className="text-slate-300">
              MAG: {latestSample ? latestSample.filteredMagnitude.toFixed(2) : '0.00'} m/s²
            </span>
          </div>

          <div className="w-full h-20 overflow-hidden rounded-lg border border-slate-800 relative bg-slate-950">
            <canvas
              ref={accelCanvasRef}
              width={400}
              height={80}
              className="w-full h-full block"
            />
          </div>
        </div>
      )}

      {/* Gyroscope Waveform Panel */}
      {(viewMode === 'DUAL' || viewMode === 'GYRO') && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-sky-400 font-bold">
            <div className="flex items-center gap-1">
              <RotateCw className="w-3 h-3 text-sky-400" />
              <span>GYROSCOPE (ANGULAR VELOCITY)</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-sky-400">Z(Yaw)</span>
              <span className="text-rose-400">X(Pitch)</span>
              <span className="text-emerald-400">Y(Roll)</span>
            </div>
          </div>

          <div className="w-full h-20 overflow-hidden rounded-lg border border-slate-800 relative bg-slate-950">
            <canvas
              ref={gyroCanvasRef}
              width={400}
              height={80}
              className="w-full h-full block"
            />
          </div>
        </div>
      )}

      {/* 6-DOF Live Real-Time Telemetry Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 text-[10px] bg-slate-950 p-2 rounded-lg border border-slate-800 text-slate-300 text-center">
        <div>
          <div className="text-[9px] text-slate-500">ACC X</div>
          <div className="text-slate-200 font-semibold">{latestSample ? latestSample.ax.toFixed(2) : '0.00'}</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-500">ACC Y</div>
          <div className="text-slate-200 font-semibold">{latestSample ? latestSample.ay.toFixed(2) : '0.00'}</div>
        </div>
        <div>
          <div className="text-[9px] text-slate-500">ACC Z</div>
          <div className="text-slate-200 font-semibold">{latestSample ? latestSample.az.toFixed(2) : '0.00'}</div>
        </div>
        <div>
          <div className="text-[9px] text-rose-400">GYRO X</div>
          <div className="text-rose-300 font-semibold">{latestSample ? latestSample.gx.toFixed(1) : '0.0'}°/s</div>
        </div>
        <div>
          <div className="text-[9px] text-emerald-400">GYRO Y</div>
          <div className="text-emerald-300 font-semibold">{latestSample ? latestSample.gy.toFixed(1) : '0.0'}°/s</div>
        </div>
        <div>
          <div className="text-[9px] text-sky-400">GYRO Z</div>
          <div className="text-sky-300 font-semibold">{latestSample ? latestSample.gz.toFixed(1) : '0.0'}°/s</div>
        </div>
        <div>
          <div className="text-[9px] text-indigo-400">P/R</div>
          <div className="text-indigo-300 font-semibold">{Math.round(pitch)}°/{Math.round(roll)}°</div>
        </div>
        <div>
          <div className="text-[9px] text-amber-400 font-bold">HDG</div>
          <div className="text-amber-400 font-bold">{Math.round(heading)}°</div>
        </div>
      </div>
    </div>
  );
};
