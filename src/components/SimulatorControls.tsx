import React from 'react';
import {
  RotateCw,
  RotateCcw,
  Footprints,
  Play,
  Square,
  Trash2,
  Sliders,
  Compass,
} from 'lucide-react';

interface SimulatorControlsProps {
  isSimulating: boolean;
  currentHeading: number;
  onInjectStep: (stepLength?: number) => void;
  onToggleSimulator: () => void;
  onSetHeading: (heading: number) => void;
  onResetTracking: () => void;
  onOpenCalibration: () => void;
}

export const SimulatorControls: React.FC<SimulatorControlsProps> = ({
  isSimulating,
  currentHeading,
  onInjectStep,
  onToggleSimulator,
  onSetHeading,
  onResetTracking,
  onOpenCalibration,
}) => {
  const handleTurn = (delta: number) => {
    const newHeading = (currentHeading + delta + 360) % 360;
    onSetHeading(newHeading);
  };

  return (
    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col gap-3">
      {/* Title bar */}
      <div className="flex items-center justify-between text-xs font-mono text-slate-400">
        <span className="uppercase font-semibold text-slate-300">PDR Simulator & Controls</span>
        <button
          onClick={onOpenCalibration}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>CALIBRATE</span>
        </button>
      </div>

      {/* Step & Walk Action Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          onClick={() => onInjectStep(0.75)}
          className="px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
        >
          <Footprints className="w-4 h-4" />
          <span>+1 STEP</span>
        </button>

        <button
          onClick={onToggleSimulator}
          className={`px-3 py-2 border rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm ${
            isSimulating
              ? 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border-rose-500/40'
              : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40'
          }`}
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

        <div className="flex gap-1">
          <button
            onClick={() => handleTurn(-15)}
            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-mono flex items-center justify-center gap-1 transition-colors"
            title="Turn 15° Left"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>-15°</span>
          </button>
          <button
            onClick={() => handleTurn(15)}
            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-mono flex items-center justify-center gap-1 transition-colors"
            title="Turn 15° Right"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>+15°</span>
          </button>
        </div>

        <button
          onClick={onResetTracking}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>RESET PATH</span>
        </button>
      </div>

      {/* Heading Slider & Cardinal Quick Select */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-800/80">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1">
            <Compass className="w-3 h-3 text-indigo-400" />
            <span>HEADING BEARING:</span>
          </div>
          <span className="text-indigo-400 font-bold">{Math.round(currentHeading)}°</span>
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
