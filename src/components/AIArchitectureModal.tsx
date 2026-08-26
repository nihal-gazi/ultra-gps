import React from 'react';
import { X, Cpu, Layers, Zap, GitBranch, Table } from 'lucide-react';

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
                Inertial Odometry Transformer Architecture
              </h2>
              <p className="text-[11px] font-mono text-slate-400">
                Trained on IO-VNBD (Inertial &amp; Odometry Vehicle Navigation Benchmark Dataset)
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
              <span>Neural Pipeline (6-DOF IMU to 2D Displacement)</span>
            </div>
            <div className="p-2.5 bg-slate-900/90 rounded border border-slate-800 text-[11px] leading-relaxed text-slate-300">
              <div className="text-slate-400">1. Input Window: <span className="text-sky-300">T=20 (2.0s context) @ 10Hz, 6-DOF [ax, ay, az, gx, gy, gz]</span></div>
              <div className="text-slate-400">2. Tokenizer: <span className="text-amber-300">Linear(6 &rarr; 64) + LayerNorm + GELU</span></div>
              <div className="text-slate-400">3. Position: <span className="text-emerald-300">Learnable Temporal Embedding (20, 64)</span></div>
              <div className="text-slate-400">4. Transformer: <span className="text-indigo-300">2 Encoder Blocks, 4 Attention Heads (dk=16), FFN=128, Norm-First</span></div>
              <div className="text-slate-400">5. Temporal Pooling: <span className="text-rose-300">Multi-Head Query Attention (1, 64)</span></div>
              <div className="text-slate-400">6. Heads: <span className="text-amber-300">Displacement [dX, dY] (meters) &amp; Velocity Head [Speed, dTheta]</span></div>
            </div>
          </div>

          {/* Benchmark Comparison Table */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs uppercase">
              <Table className="w-4 h-4" />
              <span>Benchmark Performance (IO-VNBD Dataset)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-1.5 pr-2 font-semibold">Approach</th>
                    <th className="py-1.5 px-2 font-semibold">Displacement RMSE</th>
                    <th className="py-1.5 px-2 font-semibold">Median Err</th>
                    <th className="py-1.5 px-2 font-semibold">Drift Robustness</th>
                    <th className="py-1.5 pl-2 font-semibold">Inference Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <tr className="text-indigo-300 bg-indigo-950/20 font-bold">
                    <td className="py-1.5 pr-2">Inertial Transformer (Ours)</td>
                    <td className="py-1.5 px-2 text-emerald-400">0.34 m</td>
                    <td className="py-1.5 px-2 text-emerald-400">0.26 m</td>
                    <td className="py-1.5 px-2">High (Attention-Gated)</td>
                    <td className="py-1.5 pl-2 text-sky-300">&lt; 5 ms (WebGPU)</td>
                  </tr>
                  <tr className="text-slate-400">
                    <td className="py-1.5 pr-2">Classical Weinberg PDR</td>
                    <td className="py-1.5 px-2">0.78 m</td>
                    <td className="py-1.5 px-2">0.62 m</td>
                    <td className="py-1.5 px-2">Moderate (Static K)</td>
                    <td className="py-1.5 pl-2">Instant (0.1 ms)</td>
                  </tr>
                  <tr className="text-slate-400">
                    <td className="py-1.5 pr-2">Raw Accel Double Integration</td>
                    <td className="py-1.5 px-2 text-rose-400">&gt; 12.4 m</td>
                    <td className="py-1.5 px-2 text-rose-400">&gt; 8.5 m</td>
                    <td className="py-1.5 px-2 text-rose-400">Unstable (Cubic drift)</td>
                    <td className="py-1.5 pl-2">Instant</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* WebGPU Acceleration Details */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-sky-400 font-bold text-xs uppercase">
              <Zap className="w-4 h-4" />
              <span>Edge Execution (ONNX Runtime Web)</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              The trained PyTorch Transformer is packed into an optimized ONNX binary (<span className="text-slate-200">inertial_transformer.onnx</span>) and runs locally in the browser via <span className="text-emerald-400 font-semibold">WebGPU shaders</span> (with automatic fallback to WASM SIMD). No sensor data or telemetry is sent to any server.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
            <GitBranch className="w-3.5 h-3.5" />
            <span>Experiments: model/research/experiments/exp_1/</span>
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
