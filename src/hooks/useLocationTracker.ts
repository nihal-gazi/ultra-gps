import { useEffect, useState, useCallback, useRef } from 'react';
import { pdrEngine } from '../services/pdrEngine';
import { aiInertialEngine } from '../services/aiInertialEngine';
import type { TrackerState } from '../services/pdrEngine';
import type { SensorStatus, TrackingMode, AIInferenceMetrics } from '../types';

export function useLocationTracker() {
  const [trackerState, setTrackerState] = useState<TrackerState>(() => pdrEngine.getState());
  const [aiMetrics, setAiMetrics] = useState<AIInferenceMetrics>(() => aiInertialEngine.getMetrics());
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
  const simPhaseRef = useRef<number>(0);
  const motionCountRef = useRef<number>(0);
  const hasAbsoluteOrientationRef = useRef<boolean>(false);

  // Subscribe to Tracker Engine & AI Engine updates
  useEffect(() => {
    const unsubTracker = pdrEngine.subscribe((newState) => {
      setTrackerState(newState);
    });
    const unsubAi = aiInertialEngine.subscribe((newAiMetrics) => {
      setAiMetrics(newAiMetrics);
    });

    // Auto-load ONNX MLP Model with WebGPU / WASM execution provider
    aiInertialEngine.initializeModel();

    return () => {
      unsubTracker();
      unsubAi();
    };
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

      setSensorStatus((prev) => ({
        ...prev,
        permissionGranted: granted,
        gyroAvailable: granted,
        accelAvailable: granted,
      }));

      return granted;
    } catch (err) {
      console.warn('Sensor permission fallback:', err);
      setSensorStatus((prev) => ({
        ...prev,
        permissionGranted: true,
      }));
      return true;
    }
  }, []);

  // Step 1: Record Sensor Streams (Raw Accelerometer with Gravity, Gyroscope, and Orientation)
  useEffect(() => {
    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      let ax = 0;
      let ay = 0;
      let az = 0;

      // Prefer accelerationIncludingGravity to match physical IMU standard and dataset
      if (
        event.accelerationIncludingGravity &&
        event.accelerationIncludingGravity.x !== null &&
        event.accelerationIncludingGravity.y !== null &&
        event.accelerationIncludingGravity.z !== null
      ) {
        ax = event.accelerationIncludingGravity.x;
        ay = event.accelerationIncludingGravity.y;
        az = event.accelerationIncludingGravity.z;
      } else if (
        event.acceleration &&
        event.acceleration.x !== null &&
        event.acceleration.y !== null &&
        event.acceleration.z !== null
      ) {
        ax = event.acceleration.x;
        ay = event.acceleration.y;
        az = event.acceleration.z + 9.81; // synthesize 1G vertical gravity vector
      } else {
        return;
      }

      motionCountRef.current += 1;

      // Extract 3-Axis Gyroscope Angular Velocity (deg/s)
      const rot = event.rotationRate;
      const gx = rot?.beta ?? 0;
      const gy = rot?.gamma ?? 0;
      const gz = rot?.alpha ?? 0;

      const hasGyroData = rot !== null && (rot.alpha !== null || rot.beta !== null || rot.gamma !== null);

      setSensorStatus((prev) => ({
        ...prev,
        accelAvailable: true,
        gyroAvailable: hasGyroData || prev.gyroAvailable,
        hasHardwareMotion: true,
        motionEventCount: motionCountRef.current,
      }));

      // Pass directly to the 5-step tracker pipeline
      pdrEngine.processDeviceMotion(ax, ay, az, gx, gy, gz, Date.now());
    };

    const handleAbsoluteOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha === null) return;
      hasAbsoluteOrientationRef.current = true;
      setSensorStatus((prev) => ({ ...prev, gyroAvailable: true }));
      pdrEngine.updateOrientation(event.alpha, event.beta, event.gamma, undefined, true);
    };

    const handleStandardOrientation = (event: DeviceOrientationEvent) => {
      const webkitHeading = (event as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      if (webkitHeading !== undefined && !isNaN(webkitHeading)) {
        setSensorStatus((prev) => ({ ...prev, gyroAvailable: true }));
        pdrEngine.updateOrientation(event.alpha, event.beta, event.gamma, webkitHeading, true);
        return;
      }

      if (!hasAbsoluteOrientationRef.current && event.alpha !== null) {
        setSensorStatus((prev) => ({ ...prev, gyroAvailable: true }));
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
                    gpsStatusText: `Coarse location: ${data.city || 'Local area'} (Acquiring precision GPS...)`,
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

  // GPS Acquisition
  const acquireCurrentLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setSensorStatus((prev) => ({
        ...prev,
        gpsAvailable: false,
        gpsActive: false,
        gpsStatusText: 'Geolocation API not supported',
      }));
      pdrEngine.setMode('AI_TRANSFORMER');
      return;
    }

    setSensorStatus((prev) => ({
      ...prev,
      gpsStatusText: 'Requesting GPS fix...',
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
        console.warn('High-accuracy GPS failed:', highAccError.message);
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
            console.warn('GPS unavailable:', lowAccError.message);
            setSensorStatus((prev) => ({
              ...prev,
              gpsActive: false,
              gpsStatusText: `GPS unavailable. Using Neural Inertial Tracking.`,
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
      pdrEngine.setMode('AI_TRANSFORMER');
      setSensorStatus((prev) => ({
        ...prev,
        gpsActive: false,
        gpsStatusText: 'GPS Disabled (Neural Inertial Active)',
      }));
      return;
    }

    if (!('geolocation' in navigator)) {
      pdrEngine.setMode('AI_TRANSFORMER');
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
            gpsStatusText: `GPS lost (${err.message}) - Neural Inertial Active`,
          }));
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
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

  // Keyboard Navigation Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        e.preventDefault();
        pdrEngine.injectSimulatedSample(0.6, 2.2, 9.81, 10.0, 4.0, 2.0);
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
        toggleMotionSimulator();
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
    if (mode === 'AI_TRANSFORMER') {
      setGpsEnabled(false);
    } else if (mode === 'GPS') {
      setGpsEnabled(true);
    }
  }, []);

  const injectSample = useCallback((ax: number = 0.5, ay: number = 2.0, az: number = 9.81) => {
    pdrEngine.injectSimulatedSample(ax, ay, az);
  }, []);

  // Continuous Motion Simulator feeding realistic 6-DOF IMU streams into Gaussian + ONNX pipeline
  const toggleMotionSimulator = useCallback(() => {
    if (simIntervalRef.current !== null) {
      window.clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
      setSensorStatus((prev) => ({ ...prev, isSimulating: false }));
    } else {
      setSensorStatus((prev) => ({ ...prev, isSimulating: true }));
      simPhaseRef.current = 0;

      simIntervalRef.current = window.setInterval(() => {
        simPhaseRef.current += 0.15;
        const phase = simPhaseRef.current;

        // Realistic IMU accelerations with gravity
        const ax = Math.sin(phase * 0.5) * 0.6 + (Math.random() - 0.5) * 0.2;
        const ay = Math.sin(phase) * 2.4 + Math.cos(phase * 2) * 0.6 + (Math.random() - 0.5) * 0.2;
        const az = 9.81 + Math.cos(phase) * 1.8 + (Math.random() - 0.5) * 0.2;

        // Realistic angular velocities (deg/s)
        const gx = Math.sin(phase) * 15.0 + (Math.random() - 0.5) * 2.0;
        const gy = Math.cos(phase * 0.5) * 8.5 + (Math.random() - 0.5) * 1.5;
        const gz = Math.sin(phase * 0.5) * 5.0 + (Math.random() - 0.5) * 1.0;

        pdrEngine.processDeviceMotion(ax, ay, az, gx, gy, gz, Date.now());
      }, 30);
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
    pdrEngine.resetTracking();
  }, []);

  return {
    state: trackerState,
    aiMetrics,
    gpsEnabled,
    sensorStatus,
    toggleGps,
    setMode,
    injectSample,
    toggleMotionSimulator,
    setManualHeading,
    setManualLocation,
    resetTracking,
    requestSensorPermissions,
    acquireCurrentLocation,
  };
}
