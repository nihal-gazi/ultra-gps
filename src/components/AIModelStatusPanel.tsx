import React from 'react';
import type { AIInferenceMetrics } from '../types';
import { Cpu, Zap, Activity, Navigation, Info, CheckCircle2, AlertTriangle, RefreshCw, Lock } from 'lucide-react';

interface AIModelStatusPanelProps {
  aiMetrics: AIInferenceMetrics;
  onOpenArchitecture: () => void;
}

export const AIModelStatusPanel: React.FC<AIModelStatusPanelProps> = ({
  aiMetrics,
  onOpenArchitecture,
}) => {
  const isWebGpu = aiMetrics.executionProvider === 'webgpu';
  const isWasm = aiMetrics.executionProvider === 'wasm';
  const isReady = aiMetrics.isLoaded;
  const isStatic = aiMetrics.isStationary;

  return (
    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col gap-2.5 font-mono text-xs shadow-xl">
      {/* Header with Provider Pill & Info Button */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 font-bold uppercase text-slate-200">
          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
          <span>Edge Inertial MLP (IO-VNBD Exp 2)</span>
        </div>

        <div className="flex items-center gap-2">
          {/* ZUPT Stationary Lock Badge */}
          {isStatic && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
              <Lock className="w-2.5 h-2.5" />
              <span>ZUPT STATIC</span>
            </div>
          )}

          {/* Execution Provider Badge */}
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
              isWebGpu
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : isWasm
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                : aiMetrics.isLoading
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
            }`}
          >
            <Zap className="w-3 h-3 fill-current" />
            <span>
              {isWebGpu
                ? 'WEBGPU ACCELERATED'
                : isWasm
                ? 'WASM SIMD ACTIVE'
                : aiMetrics.isLoading
                ? 'COMPILING SHADERS...'
                : 'INITIALIZING'}
            </span>
          </div>

          <button
            onClick={onOpenArchitecture}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Inspect MLP Architecture & Benchmark Metrics"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Model Spec & Latency Bar */}
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-950 rounded-lg border border-slate-800/80 text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-400 truncate">
          {isReady ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
          )}
          <span className="truncate">{aiMetrics.modelName}</span>
        </div>

        <div className="flex items-center gap-2 text-slate-300 shrink-0 font-bold">
          <span className="text-[10px] text-slate-500">LATENCY:</span>
          <span className={aiMetrics.lastLatencyMs < 5 ? 'text-emerald-400' : 'text-sky-400'}>
            {aiMetrics.lastLatencyMs.toFixed(1)} ms
          </span>
        </div>
      </div>

      {/* 4-Metric Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Metric 1: Instantaneous 2D Displacement */}
        <div className="p-2 bg-slate-950 rounded-lg border border-slate-800/80">
          <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase">
            <Activity className="w-3 h-3 text-indigo-400" />
            <span>Inst Vector</span>
          </div>
          <div className="font-bold text-slate-100 text-xs mt-0.5">
            {isStatic ? '0.00 m' : `${aiMetrics.lastDisplacement.magnitude.toFixed(2)} m`}
          </div>
          <div className="text-[9px] text-slate-500 truncate">
            {isStatic ? 'Zero Drift Lock' : `dX: ${aiMetrics.lastDisplacement.dx.toFixed(2)} | dY: ${aiMetrics.lastDisplacement.dy.toFixed(2)}`}
          </div>
        </div>

        {/* Metric 2: Instantaneous Speed (Strictly Non-Averaged) */}
        <div className="p-2 bg-slate-950 rounded-lg border border-slate-800/80">
          <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase">
            <Zap className="w-3 h-3 text-emerald-400" />
            <span>Inst Speed</span>
          </div>
          <div className="font-bold text-slate-100 text-xs mt-0.5">
            {isStatic ? '0.0 km/h' : `${aiMetrics.instantaneousSpeedKmh.toFixed(1)} km/h`}
          </div>
          <div className="text-[9px] text-emerald-400/80">
            {isStatic ? 'Static (0.00 m/s)' : `${aiMetrics.instantaneousSpeedMps.toFixed(2)} m/s (Instant)`}
          </div>
        </div>

        {/* Metric 3: Instantaneous Turn Delta (Strictly Non-Averaged) */}
        <div className="p-2 bg-slate-950 rounded-lg border border-slate-800/80">
          <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase">
            <Navigation className="w-3 h-3 text-sky-400" />
            <span>Inst Turn Delta</span>
          </div>
          <div className="font-bold text-slate-100 text-xs mt-0.5">
            {isStatic ? '0.0°' : `${aiMetrics.instantaneousTurnDeltaDeg.toFixed(1)}°`}
          </div>
          <div className="text-[9px] text-slate-500">
            {isStatic ? 'Stationary' : 'dTheta (Instant)'}
          </div>
        </div>

        {/* Metric 4: Total Inferences */}
        <div className="p-2 bg-slate-950 rounded-lg border border-slate-800/80">
          <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase">
            <RefreshCw className="w-3 h-3 text-amber-400" />
            <span>Inference Count</span>
          </div>
          <div className="font-bold text-slate-100 text-xs mt-0.5">
            {aiMetrics.totalInferences.toLocaleString()}
          </div>
          <div className="text-[9px] text-slate-500">
            Avg: {aiMetrics.avgLatencyMs.toFixed(1)}ms
          </div>
        </div>
      </div>
    </div>
  );
};
