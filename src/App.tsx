import React, { useState } from 'react';
import { useLocationTracker } from './hooks/useLocationTracker';
import { Header } from './components/Header';
import { MapView } from './components/MapView';
import { TelemetryPanel } from './components/TelemetryPanel';
import { SensorWaveform } from './components/SensorWaveform';
import { SimulatorControls } from './components/SimulatorControls';
import { CalibrationModal } from './components/CalibrationModal';
import { EquationsGuideModal } from './components/EquationsGuideModal';

export const App: React.FC = () => {
  const {
    state,
    gpsEnabled,
    sensorStatus,
    toggleGps,
    injectStep,
    toggleWalkingSimulator,
    setManualHeading,
    setManualLocation,
    resetTracking,
    updateCalibration,
    requestSensorPermissions,
    acquireCurrentLocation,
  } = useLocationTracker();

  const [isCalibrationOpen, setIsCalibrationOpen] = useState<boolean>(false);
  const [isEquationsOpen, setIsEquationsOpen] = useState<boolean>(false);

  return (
    <div className="flex flex-col w-full h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* Top Navigation Header */}
      <Header
        onOpenCalibration={() => setIsCalibrationOpen(true)}
        onOpenEquations={() => setIsEquationsOpen(true)}
        onRequestPermissions={requestSensorPermissions}
        onLocateNow={acquireCurrentLocation}
        hasPermissions={sensorStatus.permissionGranted}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Map View Section */}
        <div className="flex-1 h-[50vh] lg:h-full relative">
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
        <div className="w-full lg:w-96 lg:max-w-md h-[50vh] lg:h-full bg-slate-950 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col gap-3 p-3 overflow-y-auto z-10">
          {/* Real-time HUD Telemetry */}
          <TelemetryPanel
            mode={state.mode}
            location={state.currentLocation}
            headingData={state.headingData}
            stepMetrics={state.stepMetrics}
            sensorStatus={sensorStatus}
            gpsEnabled={gpsEnabled}
            onToggleGps={toggleGps}
            onRequestPermissions={requestSensorPermissions}
            onLocateNow={acquireCurrentLocation}
          />

          {/* Real-time Sensor Accelerometer Waveform */}
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
            onInjectStep={injectStep}
            onToggleSimulator={toggleWalkingSimulator}
            onSetHeading={setManualHeading}
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

      {/* Equations & Math Guide Modal */}
      <EquationsGuideModal
        isOpen={isEquationsOpen}
        onClose={() => setIsEquationsOpen(false)}
      />
    </div>
  );
};

export default App;
