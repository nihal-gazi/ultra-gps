import React, { useState } from 'react';
import type { CalibrationConfig } from '../types';
import { X, Sliders, Check, RotateCcw } from 'lucide-react';

interface CalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CalibrationConfig;
  onSave: (config: Partial<CalibrationConfig>) => void;
}

const DEFAULT_CONFIG: CalibrationConfig = {
  weinbergK: 0.45,
  peakThreshold: 0.42,
  minStepIntervalMs: 240,
  smoothingFactor: 0.25,
  gyroWeight: 0.94,
  stationaryVarianceThreshold: 0.18,
};

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
}) => {
  const [formData, setFormData] = useState<CalibrationConfig>(config);

  if (!isOpen) return null;

  const handleResetDefaults = () => {
    setFormData(DEFAULT_CONFIG);
  };

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-1000 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-2xl flex flex-col gap-4 text-slate-100 font-sans">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-200">
              Sensor Calibration &amp; Anti-Drift Tuning
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sliders Form */}
        <div className="flex flex-col gap-4 text-xs font-mono max-h-[65vh] overflow-y-auto pr-1">
          {/* Stationary ZUPT Gate (Anti-Drift) */}
          <div className="flex flex-col gap-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-semibold">Anti-Drift Stationary Gate (ZUPT):</span>
              <span className="text-rose-400 font-bold">
                {formData.stationaryVarianceThreshold.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.45"
              step="0.01"
              value={formData.stationaryVarianceThreshold}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  stationaryVarianceThreshold: parseFloat(e.target.value),
                })
              }
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
            />
            <div className="text-[10px] text-slate-500">
              Motion energy below this threshold is locked as Stationary ($v=0$) to eliminate standing drift.
            </div>
          </div>

          {/* Weinberg K */}
          <div className="flex flex-col gap-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-semibold">Weinberg Stride Factor (K):</span>
              <span className="text-amber-400 font-bold">{formData.weinbergK.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.30"
              max="0.65"
              step="0.01"
              value={formData.weinbergK}
              onChange={(e) =>
                setFormData({ ...formData, weinbergK: parseFloat(e.target.value) })
              }
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <div className="text-[10px] text-slate-500">
              Formula: SL = K * (a_max - a_min)^(1/4). Default: 0.45 (higher = longer step).
            </div>
          </div>

          {/* Peak Detection Threshold */}
          <div className="flex flex-col gap-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-semibold">Step Peak Threshold:</span>
              <span className="text-emerald-400 font-bold">
                {formData.peakThreshold.toFixed(2)} m/s²
              </span>
            </div>
            <input
              type="range"
              min="0.20"
              max="1.50"
              step="0.02"
              value={formData.peakThreshold}
              onChange={(e) =>
                setFormData({ ...formData, peakThreshold: parseFloat(e.target.value) })
              }
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="text-[10px] text-slate-500">
              Minimum dynamic acceleration spike required to trigger step count.
            </div>
          </div>

          {/* Gyroscope Weight */}
          <div className="flex flex-col gap-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-semibold">Gyro Fusion Weight:</span>
              <span className="text-indigo-400 font-bold">
                {(formData.gyroWeight * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.80"
              max="0.99"
              step="0.01"
              value={formData.gyroWeight}
              onChange={(e) =>
                setFormData({ ...formData, gyroWeight: parseFloat(e.target.value) })
              }
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <div className="text-[10px] text-slate-500">
              Complementary filter balance between gyro velocity and compass heading.
            </div>
          </div>

          {/* Step Debounce Interval */}
          <div className="flex flex-col gap-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-semibold">Min Step Interval:</span>
              <span className="text-sky-400 font-bold">{formData.minStepIntervalMs} ms</span>
            </div>
            <input
              type="range"
              min="180"
              max="450"
              step="10"
              value={formData.minStepIntervalMs}
              onChange={(e) =>
                setFormData({ ...formData, minStepIntervalMs: parseInt(e.target.value, 10) })
              }
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
            <div className="text-[10px] text-slate-500">
              Minimum time gap between consecutive steps to avoid double strikes.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <button
            onClick={handleResetDefaults}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono transition-colors"
            >
              CANCEL
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono font-medium flex items-center gap-1 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>APPLY</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
