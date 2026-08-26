import React from 'react';
import {
  RotateCw,
  RotateCcw,
  Play,
  Square,
  Trash2,
  Compass,
  Activity,
} from 'lucide-react';

interface SimulatorControlsProps {
  isSimulating: boolean;
  currentHeading: number;
  onInjectSample: (ax?: number, ay?: number, az?: number) => void;
  onToggleSimulator: () => void;
  onSetHeading: (heading: number) => void;
  onResetTracking: () => void;
}

export const SimulatorControls: React.FC<SimulatorControlsProps> = ({
  isSimulating,
  currentHeading,
  onInjectSample,
  onToggleSimulator,
  onSetHeading,
  onResetTracking,
}) => {
  const handleTurn = (delta: number) => {
    const newHeading = (currentHeading + delta + 360) % 360;
    onSetHeading(newHeading);
  };

  return (
    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between text-xs font-mono text-slate-400">
        <span className="uppercase font-semibold text-slate-300">Inertial Sensor Simulator</span>
        <span className="text-[10px] text-slate-500">Pipeline: Record &rarr; Smooth &rarr; ONNX &rarr; Plot</span>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => onInjectSample(0.6, 2.2, 9.81)}
          className="px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          title="Stream Single IMU Step Sample into Gaussian + ONNX (Key: W or Up Arrow)"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>INJECT STEP</span>
        </button>

        <button
          onClick={onToggleSimulator}
          className={`px-3 py-2 border rounded-lg text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm ${
            isSimulating
              ? 'bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border-rose-500/40'
              : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40'
          }`}
          title="Toggle Continuous IMU Motion Simulator (Key: Space)"
        >
          {isSimulating ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>STOP STREAM</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>AUTO STREAM</span>
            </>
          )}
        </button>

        <button
          onClick={onResetTracking}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 transition-colors"
          title="Clear Trajectory Path &amp; Counters"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>RESET PATH</span>
        </button>
      </div>

      {/* Turn & Heading Controls */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-800/80">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1">
            <Compass className="w-3 h-3 text-indigo-400" />
            <span>BEARING ORIENTATION:</span>
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
