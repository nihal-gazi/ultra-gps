import React from 'react';
import type { Coordinates, HeadingData, StepMetrics, TrackingMode, SensorStatus } from '../types';
import {
  Compass,
  Footprints,
  Gauge,
  MapPin,
  Radio,
  ShieldAlert,
  Navigation,
  Cpu,
} from 'lucide-react';

interface TelemetryPanelProps {
  mode: TrackingMode;
  location: Coordinates;
  headingData: HeadingData;
  stepMetrics: StepMetrics;
  sensorStatus: SensorStatus;
  gpsEnabled: boolean;
  onToggleGps: () => void;
  onRequestPermissions: () => void;
  onLocateNow?: () => void;
}

function getCardinalDirection(deg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((deg % 360) / 22.5) % 16;
  return directions[index];
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  mode,
  location,
  headingData,
  stepMetrics,
  sensorStatus,
  gpsEnabled,
  onToggleGps,
  onRequestPermissions,
  onLocateNow,
}) => {
  const isDr = mode === 'DEAD_RECKONING';
  const cardinal = getCardinalDirection(headingData.heading);

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-sans shadow-xl">
      {/* Top Status & GPS Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {/* Mode Pill */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold tracking-wide uppercase ${
              isDr
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : mode === 'GPS'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full animate-pulse ${
                isDr ? 'bg-amber-400' : mode === 'GPS' ? 'bg-emerald-400' : 'bg-sky-400'
              }`}
            />
            {isDr ? 'IMU DEAD RECKONING' : mode === 'GPS' ? 'GPS ACTIVE' : 'ACQUIRING POSITION'}
          </div>

          {sensorStatus.isSimulating && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
              SIMULATOR ACTIVE
            </span>
          )}
        </div>

        {/* GPS Controls & Fallback Switch */}
        <div className="flex items-center gap-2">
          {onLocateNow && (
            <button
              onClick={onLocateNow}
              className="px-2.5 py-1.5 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/40 rounded-lg text-xs font-mono flex items-center gap-1 transition-colors"
              title="Force GPS Position Search"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>LOCATE</span>
            </button>
          )}

          <button
            onClick={onToggleGps}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 border ${
              gpsEnabled
                ? 'bg-blue-600/30 border-blue-500/50 text-blue-300 hover:bg-blue-600/40'
                : 'bg-amber-600/30 border-amber-500/50 text-amber-300 hover:bg-amber-600/40'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            {gpsEnabled ? 'GPS: ON' : 'GPS: OFF (IMU ACTIVE)'}
          </button>

          {!sensorStatus.permissionGranted && (
            <button
              onClick={onRequestPermissions}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-mono flex items-center gap-1"
              title="Grant iOS Motion &amp; Orientation Permissions"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>SENSORS</span>
            </button>
          )}
        </div>
      </div>

      {/* Sensor Health Diagnostic Line */}
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-950/80 border border-slate-800/80 rounded-lg text-[11px] font-mono">
        <div className="flex items-center gap-1.5 text-slate-400 truncate">
          <Radio className="w-3 h-3 text-sky-400 shrink-0" />
          <span className="truncate">{sensorStatus.gpsStatusText}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Cpu className="w-3 h-3 text-indigo-400" />
          {sensorStatus.hasHardwareMotion ? (
            <span className="text-emerald-400">HARDWARE IMU LIVE</span>
          ) : (
            <span className="text-slate-400">DESKTOP / KEYS READY</span>
          )}
        </div>
      </div>

      {/* Main Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Metric: Location Coordinates */}
        <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1 font-mono uppercase">
            <MapPin className="w-3.5 h-3.5 text-sky-400" />
            <span>Position</span>
          </div>
          <div className="font-mono text-sm text-slate-100 font-semibold truncate">
            {location.latitude.toFixed(6)}°
          </div>
          <div className="font-mono text-xs text-slate-400 truncate">
            {location.longitude.toFixed(6)}°
          </div>
        </div>

        {/* Metric: Heading & Compass */}
        <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1 font-mono uppercase">
            <Compass className="w-3.5 h-3.5 text-indigo-400" />
            <span>Heading</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-lg text-slate-100 font-bold">
              {Math.round(headingData.heading)}°
            </span>
            <span className="font-mono text-xs text-indigo-400 font-semibold">
              {cardinal}
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 uppercase truncate">
            SRC: {headingData.source}
          </div>
        </div>

        {/* Metric: Steps & Weinberg Stride */}
        <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1 font-mono uppercase">
            <Footprints className="w-3.5 h-3.5 text-amber-400" />
            <span>Steps / Stride</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-lg text-slate-100 font-bold">
              {stepMetrics.stepCount}
            </span>
            <span className="font-mono text-xs text-slate-400">steps</span>
          </div>
          <div className="text-[10px] font-mono text-amber-400/80">
            SL: {stepMetrics.currentStepLength.toFixed(2)} m (Weinberg)
          </div>
        </div>

        {/* Metric: Distance & Speed */}
        <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1 font-mono uppercase">
            <Gauge className="w-3.5 h-3.5 text-emerald-400" />
            <span>Dist / Speed</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-lg text-slate-100 font-bold">
              {stepMetrics.totalDistance >= 1000
                ? (stepMetrics.totalDistance / 1000).toFixed(2) + ' km'
                : stepMetrics.totalDistance.toFixed(1) + ' m'}
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-400">
            {stepMetrics.speedKmh.toFixed(1)} km/h ({stepMetrics.cadence} spm)
          </div>
        </div>
      </div>
    </div>
  );
};
