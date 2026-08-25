import { useEffect, useState, useCallback, useRef } from 'react';
import { pdrEngine } from '../services/pdrEngine';
import type { PDRState } from '../services/pdrEngine';
import type { SensorStatus, TrackingMode, CalibrationConfig, WalkDirection } from '../types';

export function useLocationTracker() {
  const [pdrState, setPdrState] = useState<PDRState>(() => pdrEngine.getState());
  const [gpsEnabled, setGpsEnabled] = useState<boolean>(true);
  const [sensorStatus, setSensorStatus] = useState<SensorStatus>({
    gpsAvailable: 'geolocation' in navigator,
    gpsActive: false,
    gpsStatusText: 'Initializing GPS...',
    hasInitialFix: false,
    gyroAvailable: false,
    accelAvailable: false,
    hasHardwareMotion: false,
    motionEventCount: 0,
    permissionGranted: false,
    isSimulating: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const simIntervalRef = useRef<number | null>(null);
  const simStepPhaseRef = useRef<number>(0);
  const motionCountRef = useRef<number>(0);
  const hasAbsoluteOrientationRef = useRef<boolean>(false);

  // Subscribe to PDR Engine state updates
  useEffect(() => {
    const unsubscribe = pdrEngine.subscribe((newState) => {
      setPdrState(newState);
    });
    return () => unsubscribe();
  }, []);

  // Request Device Sensor Permissions (iOS 13+ & modern mobile browsers)
  const requestSensorPermissions = useCallback(async (): Promise<boolean> => {
    try {
      let granted = true;

      // Check if iOS DeviceOrientationEvent requires permission
      if (
        typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
          .requestPermission === 'function'
      ) {
        const response = await (
          DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }
        ).requestPermission();
        granted = granted && response === 'granted';
      }

      // Check if iOS DeviceMotionEvent requires permission
      if (
        typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
          .requestPermission === 'function'
      ) {
        const motionResponse = await (
          DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
        ).requestPermission();
        granted = granted && motionResponse === 'granted';
      }

      // Query Chromium Permissions API for sensors if available
      if ('permissions' in navigator) {
        try {
          await Promise.all([
            (navigator.permissions as any).query({ name: 'accelerometer' }).catch(() => null),
            (navigator.permissions as any).query({ name: 'gyroscope' }).catch(() => null),
          ]);
        } catch {}
      }

      setSensorStatus((prev) => ({
        ...prev,
        permissionGranted: granted,
        gyroAvailable: granted,
        accelAvailable: granted,
      }));

      return granted;
    } catch (err) {
      console.warn('Sensor permission request fallback:', err);
      setSensorStatus((prev) => ({
        ...prev,
        permissionGranted: true,
      }));
      return true;
    }
  }, []);

  // Clean, Single-Source Orientation & Motion Listeners with Gyroscope Extraction
  useEffect(() => {
    // 1. DeviceMotion Handler (Accelerometer + Gyroscope 3-Axis)
    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      let ax = 0;
      let ay = 0;
      let az = 0;
      let hasGravity = false;

      if (
        event.acceleration &&
        event.acceleration.x !== null &&
        event.acceleration.y !== null &&
        event.acceleration.z !== null
      ) {
        ax = event.acceleration.x;
        ay = event.acceleration.y;
        az = event.acceleration.z;
        hasGravity = false;
      } else if (
        event.accelerationIncludingGravity &&
        event.accelerationIncludingGravity.x !== null &&
        event.accelerationIncludingGravity.y !== null &&
        event.accelerationIncludingGravity.z !== null
      ) {
        ax = event.accelerationIncludingGravity.x;
        ay = event.accelerationIncludingGravity.y;
        az = event.accelerationIncludingGravity.z;
        hasGravity = true;
      } else {
        return;
      }

      motionCountRef.current += 1;

      // Extract 3-Axis Gyroscope Angular Velocity (deg/s)
      const rot = event.rotationRate;
      const gx = rot?.beta ?? 0;   // X-axis (Pitch rate)
      const gy = rot?.gamma ?? 0;  // Y-axis (Roll rate)
      const gz = rot?.alpha ?? 0;  // Z-axis (Yaw rate)

      const hasGyroData = rot !== null && (rot.alpha !== null || rot.beta !== null || rot.gamma !== null);

      setSensorStatus((prev) => ({
        ...prev,
        accelAvailable: true,
        gyroAvailable: hasGyroData || prev.gyroAvailable,
        hasHardwareMotion: true,
        motionEventCount: motionCountRef.current,
      }));

      pdrEngine.processDeviceMotion(ax, ay, az, gx, gy, gz, hasGravity, Date.now());
    };

    // 2. Absolute Orientation Handler (Android Magnetic North)
    const handleAbsoluteOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha === null) return;
      hasAbsoluteOrientationRef.current = true;

      setSensorStatus((prev) => ({
        ...prev,
        gyroAvailable: true,
      }));

      pdrEngine.updateOrientation(event.alpha, event.beta, event.gamma, undefined, true);
    };

    // 3. Standard Orientation Handler (iOS Safari & Fallback)
    const handleStandardOrientation = (event: DeviceOrientationEvent) => {
      const webkitHeading = (event as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;

      // On iOS: webkitCompassHeading is always preferred
      if (webkitHeading !== undefined && !isNaN(webkitHeading)) {
        setSensorStatus((prev) => ({
          ...prev,
          gyroAvailable: true,
        }));
        pdrEngine.updateOrientation(event.alpha, event.beta, event.gamma, webkitHeading, true);
        return;
      }

      // On Android / desktop: Only use deviceorientation if deviceorientationabsolute is NOT active
      if (!hasAbsoluteOrientationRef.current && event.alpha !== null) {
        setSensorStatus((prev) => ({
          ...prev,
          gyroAvailable: true,
        }));
        pdrEngine.updateOrientation(event.alpha, event.beta, event.gamma, undefined, false);
      }
    };

    window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
    window.addEventListener('deviceorientationabsolute', handleAbsoluteOrientation as EventListener, {
      passive: true,
    });
    window.addEventListener('deviceorientation', handleStandardOrientation, { passive: true });

    return () => {
      window.removeEventListener('devicemotion', handleDeviceMotion);
      window.removeEventListener('deviceorientationabsolute', handleAbsoluteOrientation as EventListener);
      window.removeEventListener('deviceorientation', handleStandardOrientation);
    };
  }, []);

  // IP Geolocation fallback to seed starting coordinates
  const fetchIpGeolocation = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const endpoints = [
        'https://get.geojs.io/v1/ip/geo.json',
        'https://ipapi.co/json/',
      ];

      for (const url of endpoints) {
        try {
          const res = await fetch(url, { signal: controller.signal });
          if (res.ok) {
            const data = await res.json();
            const lat = parseFloat(data.latitude);
            const lng = parseFloat(data.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
              clearTimeout(timeoutId);
              pdrEngine.setInitialApproximateLocation(lat, lng);
              setSensorStatus((prev) => {
                if (!prev.hasInitialFix) {
                  return {
                    ...prev,
                    gpsStatusText: `Coarse location found: ${data.city || 'Local area'} (Acquiring precision GPS...)`,
                  };
                }
                return prev;
              });
              return;
            }
          }
        } catch {}
      }
      clearTimeout(timeoutId);
    } catch (err) {
      console.warn('IP fallback notice:', err);
    }
  }, []);

  // Primary GPS Acquisition Function
  const acquireCurrentLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setSensorStatus((prev) => ({
        ...prev,
        gpsAvailable: false,
        gpsActive: false,
        gpsStatusText: 'Geolocation API not supported',
      }));
      pdrEngine.setMode('DEAD_RECKONING');
      return;
    }

    setSensorStatus((prev) => ({
      ...prev,
      gpsStatusText: 'Requesting GPS coordinates...',
    }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        pdrEngine.updateGpsPosition(pos.coords, pos.timestamp);
        setSensorStatus((prev) => ({
          ...prev,
          gpsActive: true,
          hasInitialFix: true,
          gpsStatusText: `GPS Lock (Accuracy: ±${Math.round(pos.coords.accuracy)}m)`,
        }));
      },
      (highAccError) => {
        console.warn('High-accuracy GPS failed, trying standard:', highAccError.message);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            pdrEngine.updateGpsPosition(pos.coords, pos.timestamp);
            setSensorStatus((prev) => ({
              ...prev,
              gpsActive: true,
              hasInitialFix: true,
              gpsStatusText: `GPS Lock (Standard: ±${Math.round(pos.coords.accuracy)}m)`,
            }));
          },
          (lowAccError) => {
            console.warn('Standard GPS failed:', lowAccError.message);
            setSensorStatus((prev) => ({
              ...prev,
              gpsActive: false,
              gpsStatusText: `GPS unavailable (${lowAccError.message}). Using Dead Reckoning.`,
            }));
            fetchIpGeolocation();
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, [fetchIpGeolocation]);

  // Geolocation Watcher Lifecycle
  useEffect(() => {
    if (!gpsEnabled) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      pdrEngine.setMode('DEAD_RECKONING');
      setSensorStatus((prev) => ({
        ...prev,
        gpsActive: false,
        gpsStatusText: 'GPS Disabled (Using IMU Dead Reckoning)',
      }));
      return;
    }

    if (!('geolocation' in navigator)) {
      pdrEngine.setMode('DEAD_RECKONING');
      setSensorStatus((prev) => ({
        ...prev,
        gpsAvailable: false,
        gpsActive: false,
        gpsStatusText: 'Geolocation not supported',
      }));
      return;
    }

    acquireCurrentLocation();

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          pdrEngine.updateGpsPosition(pos.coords, pos.timestamp);
          setSensorStatus((prev) => ({
            ...prev,
            gpsActive: true,
            hasInitialFix: true,
            gpsStatusText: `GPS Lock (±${Math.round(pos.coords.accuracy)}m)`,
          }));
        },
        (err) => {
          console.warn('GPS watcher notice:', err.message);
          setSensorStatus((prev) => ({
            ...prev,
            gpsActive: false,
            gpsStatusText: `GPS lost (${err.message}) - Dead Reckoning active`,
          }));
        },
        {
          enableHighAccuracy: true,
          maximumAge: 2000,
          timeout: 15000,
        }
      );
    } catch (e) {
      console.warn('watchPosition error:', e);
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [gpsEnabled, acquireCurrentLocation]);

  // Global Keyboard Controls (W/↑ Step Forward, S/↓ Step Backward)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        e.preventDefault();
        pdrEngine.injectSimulatedStep(0.75, 'FORWARD');
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        e.preventDefault();
        pdrEngine.injectSimulatedStep(0.75, 'BACKWARD');
      } else if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        e.preventDefault();
        const current = pdrEngine.getState().headingData.heading;
        pdrEngine.setManualHeading((current - 15 + 360) % 360);
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        e.preventDefault();
        const current = pdrEngine.getState().headingData.heading;
        pdrEngine.setManualHeading((current + 15) % 360);
      } else if (e.code === 'Space') {
        e.preventDefault();
        toggleWalkingSimulator();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleGps = useCallback(() => {
    setGpsEnabled((prev) => !prev);
  }, []);

  const setMode = useCallback((mode: TrackingMode) => {
    pdrEngine.setMode(mode);
    if (mode === 'DEAD_RECKONING') {
      setGpsEnabled(false);
    } else if (mode === 'GPS') {
      setGpsEnabled(true);
    }
  }, []);

  const setDirectionMode = useCallback((dirMode: 'AUTO' | 'FORWARD' | 'BACKWARD') => {
    pdrEngine.setDirectionMode(dirMode);
  }, []);

  const injectStep = useCallback((stepLength: number = 0.72, direction: WalkDirection = 'FORWARD') => {
    pdrEngine.injectSimulatedStep(stepLength, direction);
  }, []);

  // Continuous Walking Simulator with realistic 3-axis Accelerometer and 3-axis Gyroscope waveforms
  const toggleWalkingSimulator = useCallback(() => {
    if (simIntervalRef.current !== null) {
      window.clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
      setSensorStatus((prev) => ({ ...prev, isSimulating: false }));
    } else {
      setSensorStatus((prev) => ({ ...prev, isSimulating: true }));
      simStepPhaseRef.current = 0;

      simIntervalRef.current = window.setInterval(() => {
        simStepPhaseRef.current += 0.14;
        const phase = simStepPhaseRef.current;

        // Realistic gait accelerations
        const ax = Math.sin(phase * 0.5) * 0.5 + (Math.random() - 0.5) * 0.15;
        const ay = Math.sin(phase) * 2.2 + Math.cos(phase * 2) * 0.5 + (Math.random() - 0.5) * 0.2;
        const az = 9.81 + Math.cos(phase) * 1.6 + (Math.random() - 0.5) * 0.2;

        // Realistic gait angular velocities (Pitch, Roll, Yaw rates in deg/s)
        const gx = Math.sin(phase) * 14.5 + (Math.random() - 0.5) * 2.0;   // Pitch oscillation
        const gy = Math.cos(phase * 0.5) * 8.2 + (Math.random() - 0.5) * 1.5; // Pelvic sway / roll
        const gz = Math.sin(phase * 0.5) * 5.0 + (Math.random() - 0.5) * 1.0; // Torso yaw rate

        pdrEngine.processDeviceMotion(ax, ay, az, gx, gy, gz, true, Date.now());
      }, 25);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (simIntervalRef.current !== null) {
        window.clearInterval(simIntervalRef.current);
      }
    };
  }, []);

  const setManualHeading = useCallback((heading: number) => {
    pdrEngine.setManualHeading(heading);
  }, []);

  const setManualLocation = useCallback((lat: number, lng: number) => {
    pdrEngine.setManualLocation(lat, lng);
    setSensorStatus((prev) => ({ ...prev, hasInitialFix: true }));
  }, []);

  const resetTracking = useCallback(() => {
    pdrEngine.resetPathAndMetrics();
  }, []);

  const updateCalibration = useCallback((config: Partial<CalibrationConfig>) => {
    pdrEngine.updateCalibration(config);
  }, []);

  return {
    state: pdrState,
    gpsEnabled,
    sensorStatus,
    toggleGps,
    setMode,
    setDirectionMode,
    injectStep,
    toggleWalkingSimulator,
    setManualHeading,
    setManualLocation,
    resetTracking,
    updateCalibration,
    requestSensorPermissions,
    acquireCurrentLocation,
  };
}
