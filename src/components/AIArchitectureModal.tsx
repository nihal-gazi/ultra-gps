import React from 'react';
import { X, Cpu, Layers, GitBranch, Table, Activity } from 'lucide-react';

interface AIArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIArchitectureModal: React.FC<AIArchitectureModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-1000 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl p-5 shadow-2xl flex flex-col gap-4 text-slate-100 font-sans max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-200">
                Inertial Odometry Neural Architecture (Exp 2: Dense MLP)
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                Trained on IO-VNBD Benchmark Dataset with Normalized Target Scaling
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex flex-col gap-4 text-xs font-mono text-slate-300">
          {/* Architecture Pipeline */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-indigo-400 font-bold text-xs uppercase">
              <Layers className="w-4 h-4" />
              <span>Dense MLP Neural Pipeline (6-DOF IMU to Instantaneous Vectors)</span>
            </div>
            <div className="p-2.5 bg-slate-900/90 rounded border border-slate-800 text-[11px] leading-relaxed text-slate-300">
              <div className="text-slate-400">1. Input: <span className="text-sky-300">T=20 (2.0s context) @ 10Hz, 6-DOF [ax, ay, az, gx, gy, gz] &rarr; Flattened 120D</span></div>
              <div className="text-slate-400">2. Normalization: <span className="text-amber-300">LayerNorm(120) for dynamic sensor scaling</span></div>
              <div className="text-slate-400">3. Dense Backbone: <span className="text-indigo-300">Linear(120 &rarr; 256) &rarr; Linear(256 &rarr; 128) &rarr; Linear(128 &rarr; 64) with GELU</span></div>
              <div className="text-slate-400">4. Instantaneous Heads:</div>
              <div className="pl-3 text-slate-400">&bull; <span className="text-emerald-300">2D Displacement Head: [dX, dY] (meters)</span></div>
              <div className="pl-3 text-slate-400">&bull; <span className="text-amber-300">Instantaneous Speed Head: Softplus(Linear(64 &rarr; 1)) (m/s)</span></div>
              <div className="pl-3 text-slate-400">&bull; <span className="text-sky-300">Instantaneous Turn Head: Linear(64 &rarr; 1) (radians)</span></div>
            </div>
          </div>

          {/* Benchmark Comparison Table */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs uppercase">
              <Table className="w-4 h-4" />
              <span>Experiment Benchmarks (IO-VNBD Dataset)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-1.5 pr-2 font-semibold">Model / Experiment</th>
                    <th className="py-1.5 px-2 font-semibold">Parameters</th>
                    <th className="py-1.5 px-2 font-semibold">Median Err</th>
                    <th className="py-1.5 px-2 font-semibold">Inference Latency</th>
                    <th className="py-1.5 pl-2 font-semibold">Speed / Turn Outputs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <tr className="text-emerald-300 bg-emerald-950/20 font-bold">
                    <td className="py-1.5 pr-2">Exp 2: Inertial MLP (Active)</td>
                    <td className="py-1.5 px-2 text-slate-200">79,636</td>
                    <td className="py-1.5 px-2 text-emerald-400">0.070 m</td>
                    <td className="py-1.5 px-2 text-sky-300">&lt; 1.0 ms (WebGPU)</td>
                    <td className="py-1.5 pl-2 text-emerald-400">Instantaneous</td>
                  </tr>
                  <tr className="text-slate-400">
                    <td className="py-1.5 pr-2">Exp 1: IO-Transformer</td>
                    <td className="py-1.5 px-2 text-slate-200">94,084</td>
                    <td className="py-1.5 px-2">0.089 m</td>
                    <td className="py-1.5 px-2">&lt; 5.0 ms</td>
                    <td className="py-1.5 pl-2">Window Aggregated</td>
                  </tr>
                  <tr className="text-slate-400">
                    <td className="py-1.5 pr-2">Classical Weinberg PDR</td>
                    <td className="py-1.5 px-2 text-slate-200">Heuristic</td>
                    <td className="py-1.5 px-2">0.620 m</td>
                    <td className="py-1.5 px-2">0.1 ms</td>
                    <td className="py-1.5 pl-2">Cadence Window</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Instantaneous vs Averaged Processing */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-sky-400 font-bold text-xs uppercase">
              <Activity className="w-3 h-3" />
              <span>Strictly Instantaneous Kinematics</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Unlike classical cadence windows that average step timestamps over 10 seconds, the <span className="text-slate-200 font-semibold">Inertial MLP</span> directly outputs instantaneous velocity (v_inst) and turn angle change (dTheta_inst) per inference step. No rolling mean or lag is introduced into the speed HUD.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
            <GitBranch className="w-3.5 h-3.5" />
            <span>Experiments: model/research/experiments/exp_2/</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono font-medium transition-colors"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
