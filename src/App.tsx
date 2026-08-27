import React, { useState } from 'react';
import { useLocationTracker } from './hooks/useLocationTracker';
import { Header } from './components/Header';
import { MapView } from './components/MapView';
import { TelemetryPanel } from './components/TelemetryPanel';
import { AIModelStatusPanel } from './components/AIModelStatusPanel';
import { SensorWaveform } from './components/SensorWaveform';
import { SimulatorControls } from './components/SimulatorControls';
import { AIArchitectureModal } from './components/AIArchitectureModal';

export const App: React.FC = () => {
  const {
    state,
    aiMetrics,
    gpsEnabled,
    sensorStatus,
    toggleGps,
    injectSample,
    toggleMotionSimulator,
    setManualHeading,
    setManualLocation,
    resetTracking,
    requestSensorPermissions,
    acquireCurrentLocation,
  } = useLocationTracker();

  const [isArchitectureOpen, setIsArchitectureOpen] = useState<boolean>(false);

  return (
    <div className="flex flex-col w-full h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* Top Navigation Header */}
      <Header
        onOpenArchitecture={() => setIsArchitectureOpen(true)}
        onRequestPermissions={requestSensorPermissions}
        onLocateNow={acquireCurrentLocation}
        hasPermissions={sensorStatus.permissionGranted}
        isAiLoaded={aiMetrics.isLoaded}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Map View Section (Step 5: Plotted Output) */}
        <div className="flex-1 h-[46vh] lg:h-full relative">
          <MapView
            location={state.currentLocation}
            heading={state.headingData.heading}
            mode={state.mode}
            path={state.pathHistory}
            hasReceivedFix={state.hasReceivedFix}
            onSetLocation={setManualLocation}
            onLocateNow={acquireCurrentLocation}
          />
        </div>

        {/* Sidebar / Controls Panel (Steps 1, 2, 3, 4) */}
        <div className="w-full lg:w-96 lg:max-w-md h-[54vh] lg:h-full bg-slate-950 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col gap-3 p-3 overflow-y-auto z-10">
          {/* Step 4: ONNX Transformer WebGPU Telemetry */}
          <AIModelStatusPanel
            aiMetrics={aiMetrics}
            onOpenArchitecture={() => setIsArchitectureOpen(true)}
          />

          {/* Step 3: Real-time Telemetry Display */}
          <TelemetryPanel
            mode={state.mode}
            location={state.currentLocation}
            headingData={state.headingData}
            navigationMetrics={state.navigationMetrics}
            sensorStatus={sensorStatus}
            aiMetrics={aiMetrics}
            gpsEnabled={gpsEnabled}
            onToggleGps={toggleGps}
            onRequestPermissions={requestSensorPermissions}
          />

          {/* Step 2 & 3: Sensor Gaussian-Smoothed Waveforms Display */}
          <SensorWaveform
            recentMotion={state.recentMotion}
            peakThreshold={0.25}
            pitch={state.headingData.pitch}
            roll={state.headingData.roll}
            heading={state.headingData.heading}
            motionEventCount={sensorStatus.motionEventCount}
            hasHardwareMotion={sensorStatus.hasHardwareMotion}
          />

          {/* Step 1: Simulator & Bearing Orientation Controls */}
          <SimulatorControls
            isSimulating={sensorStatus.isSimulating}
            currentHeading={state.headingData.heading}
            onInjectSample={injectSample}
            onToggleSimulator={toggleMotionSimulator}
            onSetHeading={setManualHeading}
            onResetTracking={resetTracking}
          />
        </div>
      </div>

      {/* AI Architecture & IO-VNBD Benchmark Modal */}
      <AIArchitectureModal
        isOpen={isArchitectureOpen}
        onClose={() => setIsArchitectureOpen(false)}
      />
    </div>
  );
};

export default App;
