import React from 'react';
import { Compass, Cpu, ShieldCheck, Navigation } from 'lucide-react';

interface HeaderProps {
  onOpenArchitecture: () => void;
  onRequestPermissions: () => void;
  onLocateNow?: () => void;
  hasPermissions: boolean;
  isAiLoaded?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenArchitecture,
  onRequestPermissions,
  onLocateNow,
  hasPermissions,
  isAiLoaded = false,
}) => {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-900/95 border-b border-slate-800 backdrop-blur text-slate-100 font-sans">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
          <Compass className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-mono font-bold tracking-tight text-white flex items-center gap-2 m-0">
            <span>ultra-GPS</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
              isAiLoaded
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
            }`}>
              {isAiLoaded ? 'IO-VNBD WebGPU AI' : 'Compiling Shaders...'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 font-mono m-0">
            Gaussian Filtered 6-DOF &bull; ONNX Transformer &bull; Edge Neural Odometry
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onLocateNow && (
          <button
            onClick={onLocateNow}
            className="px-3 py-1.5 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/40 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors"
            title="Acquire Current Device Location"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>LOCATE ME</span>
          </button>
        )}

        <button
          onClick={onOpenArchitecture}
          className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors"
          title="Inspect Inertial Odometry Transformer Architecture &amp; Benchmarks"
        >
          <Cpu className="w-3.5 h-3.5 text-indigo-400" />
          <span>AI ARCHITECTURE</span>
        </button>

        <button
          onClick={onRequestPermissions}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 border transition-colors ${
            hasPermissions
              ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
              : 'bg-indigo-600/30 border-indigo-500/50 text-indigo-200 hover:bg-indigo-600/40'
          }`}
          title="Request DeviceOrientation &amp; DeviceMotion Permissions"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{hasPermissions ? 'SENSORS READY' : 'INIT SENSORS'}</span>
        </button>
      </div>
    </header>
  );
};
