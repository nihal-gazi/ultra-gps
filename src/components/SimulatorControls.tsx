import React from 'react';
import type { WalkDirection } from '../types';
import {
  RotateCw,
  RotateCcw,
  Footprints,
  Play,
  Square,
  Trash2,
  Sliders,
  Compass,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface SimulatorControlsProps {
  isSimulating: boolean;
  currentHeading: number;
  directionMode: 'AUTO' | 'FORWARD' | 'BACKWARD';
  onInjectStep: (stepLength?: number, direction?: WalkDirection) => void;
  onToggleSimulator: () => void;
  onSetHeading: (heading: number) => void;
  onSetDirectionMode: (mode: 'AUTO' | 'FORWARD' | 'BACKWARD') => void;
  onResetTracking: () => void;
  onOpenCalibration: () => void;
}

export const SimulatorControls: React.FC<SimulatorControlsProps> = ({
  isSimulating,
  currentHeading,
  directionMode,
  onInjectStep,
  onToggleSimulator,
  onSetHeading,
  onSetDirectionMode,
  onResetTracking,
  onOpenCalibration,
}) => {
  const handleTurn = (delta: number) => {
    const newHeading = (currentHeading + delta + 360) % 360;
    onSetHeading(newHeading);
  };

  return (
    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col gap-3">
      {/* Title bar with Direction Gear & Calibrate */}
      <div className="flex items-center justify-between text-xs font-mono text-slate-400">
        <span className="uppercase font-semibold text-slate-300">PDR Movement Controls</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenCalibration}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>CALIBRATE</span>
          </button>
        </div>
      </div>

      {/* Step & Walk Action Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          onClick={() => onInjectStep(0.75, 'FORWARD')}
          className="px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          title="Take 1 Step Forward along Heading (Key: W or Up Arrow)"
        >
          <ArrowUp className="w-3.5 h-3.5" />
          <span>+1 STEP FWD</span>
        </button>

        <button
          onClick={() => onInjectStep(0.75, 'BACKWARD')}
          className="px-3 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          title="Take 1 Step Backward opposite to Heading (Key: S or Down Arrow)"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span>+1 STEP REV</span>
        </button>

        <button
          onClick={onToggleSimulator}
          className={`px-3 py-2 border rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm ${
            isSimulating
              ? 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border-rose-500/40'
              : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40'
          }`}
          title="Toggle Continuous Walking Simulator (Key: Space)"
        >
          {isSimulating ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>STOP WALK</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>AUTO WALK</span>
            </>
          )}
        </button>

        <button
          onClick={onResetTracking}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>RESET PATH</span>
        </button>
      </div>

      {/* Direction Progression Selector */}
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-950/80 rounded-lg border border-slate-800/80 text-[11px] font-mono">
        <div className="flex items-center gap-1.5 text-slate-400">
          <Footprints className="w-3.5 h-3.5 text-amber-400" />
          <span>STRIDE GEAR:</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onSetDirectionMode('AUTO')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
              directionMode === 'AUTO'
                ? 'bg-sky-600/30 border-sky-500 text-sky-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            AUTO DETECT
          </button>
          <button
            onClick={() => onSetDirectionMode('FORWARD')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
              directionMode === 'FORWARD'
                ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            FORWARD
          </button>
          <button
            onClick={() => onSetDirectionMode('BACKWARD')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
              directionMode === 'BACKWARD'
                ? 'bg-rose-600/30 border-rose-500 text-rose-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            REVERSE (180°)
          </button>
        </div>
      </div>

      {/* Turn & Heading Controls */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-800/80">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1">
            <Compass className="w-3 h-3 text-indigo-400" />
            <span>HEADING BEARING:</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTurn(-15)}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-[10px] font-mono flex items-center gap-0.5"
              title="Turn 15° Left (Key: A or Left Arrow)"
            >
              <RotateCcw className="w-3 h-3" />
              <span>-15°</span>
            </button>
            <span className="text-indigo-400 font-bold">{Math.round(currentHeading)}°</span>
            <button
              onClick={() => handleTurn(15)}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-[10px] font-mono flex items-center gap-0.5"
              title="Turn 15° Right (Key: D or Right Arrow)"
            >
              <RotateCw className="w-3 h-3" />
              <span>+15°</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0"
            max="359"
            value={Math.round(currentHeading)}
            onChange={(e) => onSetHeading(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>

        <div className="grid grid-cols-4 gap-1 pt-1">
          <button
            onClick={() => onSetHeading(0)}
            className={`py-1 rounded text-[10px] font-mono border transition-colors ${
              Math.round(currentHeading) === 0
                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            NORTH (0°)
          </button>
          <button
            onClick={() => onSetHeading(90)}
            className={`py-1 rounded text-[10px] font-mono border transition-colors ${
              Math.round(currentHeading) === 90
                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            EAST (90°)
          </button>
          <button
            onClick={() => onSetHeading(180)}
            className={`py-1 rounded text-[10px] font-mono border transition-colors ${
              Math.round(currentHeading) === 180
                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            SOUTH (180°)
          </button>
          <button
            onClick={() => onSetHeading(270)}
            className={`py-1 rounded text-[10px] font-mono border transition-colors ${
              Math.round(currentHeading) === 270
                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            WEST (270°)
          </button>
        </div>
      </div>
    </div>
  );
};
