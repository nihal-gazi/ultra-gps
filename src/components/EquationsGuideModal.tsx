import React from 'react';
import { X, BookOpen, Cpu, Navigation, Activity } from 'lucide-react';

interface EquationsGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EquationsGuideModal: React.FC<EquationsGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-1000 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl flex flex-col gap-5 text-slate-100 font-sans my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-sky-400" />
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-200">
              Sensor Fusion & Translation Mathematics
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex flex-col gap-4 text-xs font-mono text-slate-300 max-h-[70vh] overflow-y-auto pr-2">
          {/* Section 1: Weinberg Stride Length Model */}
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold mb-2 uppercase">
              <Activity className="w-4 h-4" />
              <span>1. Weinberg Step Length Model</span>
            </div>
            <div className="p-2.5 bg-slate-900 rounded border border-slate-800 text-slate-200 font-mono text-center my-2">
              SL = K &times; (a_max - a_min)^(1/4)
            </div>
            <p className="text-slate-400 leading-relaxed">
              Estimates variable stride displacement from vertical acceleration dynamics during each gait cycle.
              <br />
              &bull; <strong>SL:</strong> Estimated step length (meters, bounded between 0.35m - 1.15m).
              <br />
              &bull; <strong>a_max, a_min:</strong> Peak and valley accelerations recorded during the step.
              <br />
              &bull; <strong>K:</strong> Calibrated gait constant (default 0.45).
            </p>
          </div>

          {/* Section 2: Complementary Gyro-Compass Fusion */}
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg">
            <div className="flex items-center gap-1.5 text-indigo-400 font-bold mb-2 uppercase">
              <Cpu className="w-4 h-4" />
              <span>2. Gyroscope + Compass Complementary Filter</span>
            </div>
            <div className="p-2.5 bg-slate-900 rounded border border-slate-800 text-slate-200 font-mono text-center my-2">
              &theta;_t = &alpha; &times; (&theta;_(t-1) + &omega;_z &Delta;t) + (1 - &alpha;) &times; &theta;_compass
            </div>
            <p className="text-slate-400 leading-relaxed">
              Eliminates magnetic distortion spikes while canceling long-term gyroscopic drift.
              <br />
              &bull; <strong>&omega;_z:</strong> Z-axis angular velocity from gyro (deg/sec).
              <br />
              &bull; <strong>&theta;_compass:</strong> Tilt-compensated magnetic heading.
              <br />
              &bull; <strong>&alpha;:</strong> Fusion weighting factor (&approx; 0.94).
            </p>
          </div>

          {/* Section 3: Geodetic Great Circle Translation */}
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg">
            <div className="flex items-center gap-1.5 text-sky-400 font-bold mb-2 uppercase">
              <Navigation className="w-4 h-4" />
              <span>3. Direct Spherical Geodesy Translation</span>
            </div>
            <div className="p-2.5 bg-slate-900 rounded border border-slate-800 text-slate-200 font-mono my-2 space-y-1 text-center">
              <div>&phi;_2 = asin( sin(&phi;_1) cos(d/R) + cos(&phi;_1) sin(d/R) cos(&theta;) )</div>
              <div>&lambda;_2 = &lambda;_1 + atan2( sin(&theta;) sin(d/R) cos(&phi;_1), cos(d/R) - sin(&phi;_1) sin(&phi;_2) )</div>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Translates instantaneous stride displacement (d) along bearing (&theta;) to exact new Earth coordinates (&phi;_2, &lambda;_2).
              <br />
              &bull; <strong>R:</strong> Earth mean radius (6,371,000 meters).
              <br />
              &bull; <strong>&phi;_1, &lambda;_1:</strong> Latitude and longitude in radians.
            </p>
          </div>

          {/* Section 4: Gravity Separation */}
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold mb-2 uppercase">
              <Activity className="w-4 h-4" />
              <span>4. Low-Pass Gravity Isolation & Peak Detection</span>
            </div>
            <div className="p-2.5 bg-slate-900 rounded border border-slate-800 text-slate-200 font-mono text-center my-2">
              g_t = &beta; g_(t-1) + (1 - &beta;) a_t &nbsp;|&nbsp; a_lin = a_t - g_t
            </div>
            <p className="text-slate-400 leading-relaxed">
              Isolates human motion from static gravitational acceleration (9.81 m/s&sup2;) to evaluate clean gait spikes.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono font-medium transition-colors"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
