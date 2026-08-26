import React from 'react';
import type { Coordinates, HeadingData, NavigationMetrics, TrackingMode, SensorStatus, AIInferenceMetrics } from '../types';
import {
  Compass,
  Gauge,
  MapPin,
  Radio,
  ShieldAlert,
  Navigation,
  Cpu,
  Zap,
  Activity,
} from 'lucide-react';

interface TelemetryPanelProps {
  mode: TrackingMode;
  location: Coordinates;
  headingData: HeadingData;
  navigationMetrics: NavigationMetrics;
  sensorStatus: SensorStatus;
  aiMetrics?: AIInferenceMetrics;
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
  navigationMetrics,
  sensorStatus,
  aiMetrics,
  gpsEnabled,
  onToggleGps,
  onRequestPermissions,
  onLocateNow,
}) => {
  const isAi = mode === 'AI_TRANSFORMER';
  const cardinal = getCardinalDirection(headingData.heading);

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-sans shadow-xl">
      {/* Top Status & GPS Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {/* Mode Pill */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold tracking-wide uppercase ${
              isAi
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40'
                : mode === 'GPS'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full animate-pulse ${
                isAi ? 'bg-indigo-400' : mode === 'GPS' ? 'bg-emerald-400' : 'bg-sky-400'
              }`}
            />
            {isAi
              ? 'AI TRANSFORMER (WEBGPU)'
              : mode === 'GPS'
              ? 'GPS ACTIVE'
              : 'ACQUIRING POSITION'}
          </div>

          {/* Pipeline Tag */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-indigo-950/60 text-indigo-300 border border-indigo-800/60">
            <Activity className="w-2.5 h-2.5 text-indigo-400" />
            <span>GAUSSIAN SMOOTHED</span>
          </div>
        </div>

        {/* Controls */}
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
                : 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300 hover:bg-indigo-600/40'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            {gpsEnabled ? 'GPS: ON' : 'GPS: OFF (AI ACTIVE)'}
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

        <div className="flex items-center gap-1 text-slate-400 shrink-0">
          <Cpu className="w-3 h-3 text-indigo-400" />
          {sensorStatus.hasHardwareMotion ? (
            <span className="text-emerald-400">IMU LIVE (6-DOF)</span>
          ) : (
            <span className="text-slate-400">SIMULATOR READY</span>
          )}
        </div>
      </div>

      {/* Main Telemetry Grid (Step 3: Display Data) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Metric 1: Location Coordinates */}
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

        {/* Metric 2: Heading & Compass */}
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

        {/* Metric 3: ONNX Predicted Vector */}
        <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1 font-mono uppercase">
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span>ONNX Output</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-lg text-slate-100 font-bold">
              {aiMetrics?.lastDisplacement.magnitude.toFixed(2) ?? '0.00'}
            </span>
            <span className="font-mono text-xs text-slate-400">m / frame</span>
          </div>
          <div className="text-[10px] font-mono text-indigo-400/80 truncate">
            dX: {aiMetrics?.lastDisplacement.dx.toFixed(2) ?? '0.00'} | dY: {aiMetrics?.lastDisplacement.dy.toFixed(2) ?? '0.00'}
          </div>
        </div>

        {/* Metric 4: Total Distance & Speed */}
        <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1 font-mono uppercase">
            <Gauge className="w-3.5 h-3.5 text-emerald-400" />
            <span>Distance / Speed</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-lg text-slate-100 font-bold">
              {navigationMetrics.totalDistanceMeters >= 1000
                ? (navigationMetrics.totalDistanceMeters / 1000).toFixed(2) + ' km'
                : navigationMetrics.totalDistanceMeters.toFixed(1) + ' m'}
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-400">
            {navigationMetrics.currentSpeedKmh.toFixed(1)} km/h ({navigationMetrics.totalInferenceUpdates} inferences)
          </div>
        </div>
      </div>
    </div>
  );
};
