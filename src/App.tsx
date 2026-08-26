import React, { useState } from 'react';
import { useLocationTracker } from './hooks/useLocationTracker';
import { Header } from './components/Header';
import { MapView } from './components/MapView';
import { TelemetryPanel } from './components/TelemetryPanel';
import { AIModelStatusPanel } from './components/AIModelStatusPanel';
import { SensorWaveform } from './components/SensorWaveform';
import { SimulatorControls } from './components/SimulatorControls';
import { CalibrationModal } from './components/CalibrationModal';
import { AIArchitectureModal } from './components/AIArchitectureModal';

export const App: React.FC = () => {
  const {
    state,
    aiMetrics,
    gpsEnabled,
    sensorStatus,
    toggleGps,
    injectStep,
    toggleWalkingSimulator,
    setManualHeading,
    setManualLocation,
    setDirectionMode,
    resetTracking,
    updateCalibration,
    requestSensorPermissions,
    acquireCurrentLocation,
  } = useLocationTracker();

  const [isCalibrationOpen, setIsCalibrationOpen] = useState<boolean>(false);
  const [isArchitectureOpen, setIsArchitectureOpen] = useState<boolean>(false);

  return (
    <div className="flex flex-col w-full h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* Top Navigation Header */}
      <Header
        onOpenCalibration={() => setIsCalibrationOpen(true)}
        onOpenArchitecture={() => setIsArchitectureOpen(true)}
        onRequestPermissions={requestSensorPermissions}
        onLocateNow={acquireCurrentLocation}
        hasPermissions={sensorStatus.permissionGranted}
        isAiLoaded={aiMetrics.isLoaded}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Map View Section */}
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

        {/* Sidebar / Controls Panel */}
        <div className="w-full lg:w-96 lg:max-w-md h-[54vh] lg:h-full bg-slate-950 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col gap-3 p-3 overflow-y-auto z-10">
          {/* Edge AI Neural Model Telemetry Panel */}
          <AIModelStatusPanel
            aiMetrics={aiMetrics}
            onOpenArchitecture={() => setIsArchitectureOpen(true)}
          />

          {/* Real-time HUD Telemetry */}
          <TelemetryPanel
            mode={state.mode}
            location={state.currentLocation}
            headingData={state.headingData}
            stepMetrics={state.stepMetrics}
            sensorStatus={sensorStatus}
            aiMetrics={aiMetrics}
            gpsEnabled={gpsEnabled}
            onToggleGps={toggleGps}
            onRequestPermissions={requestSensorPermissions}
            onLocateNow={acquireCurrentLocation}
            onSetDirectionMode={setDirectionMode}
          />

          {/* Real-time Sensor Accelerometer & Gyroscope Waveforms */}
          <SensorWaveform
            recentMotion={state.recentMotion}
            peakThreshold={state.config.peakThreshold}
            pitch={state.headingData.pitch}
            roll={state.headingData.roll}
            heading={state.headingData.heading}
            motionEventCount={sensorStatus.motionEventCount}
            hasHardwareMotion={sensorStatus.hasHardwareMotion}
          />

          {/* Interactive Simulation & Heading Controls */}
          <SimulatorControls
            isSimulating={sensorStatus.isSimulating}
            currentHeading={state.headingData.heading}
            directionMode={state.stepMetrics.directionMode}
            onInjectStep={injectStep}
            onToggleSimulator={toggleWalkingSimulator}
            onSetHeading={setManualHeading}
            onSetDirectionMode={setDirectionMode}
            onResetTracking={resetTracking}
            onOpenCalibration={() => setIsCalibrationOpen(true)}
          />
        </div>
      </div>

      {/* Calibration Modal */}
      <CalibrationModal
        isOpen={isCalibrationOpen}
        onClose={() => setIsCalibrationOpen(false)}
        config={state.config}
        onSave={updateCalibration}
      />

      {/* AI Architecture & IO-VNBD Benchmark Modal */}
      <AIArchitectureModal
        isOpen={isArchitectureOpen}
        onClose={() => setIsArchitectureOpen(false)}
      />
    </div>
  );
};

export default App;
