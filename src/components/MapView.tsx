import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordinates, PathPoint, TrackingMode } from '../types';
import { Crosshair, MapPin, Navigation } from 'lucide-react';

interface MapViewProps {
  location: Coordinates;
  heading: number;
  mode: TrackingMode;
  path: PathPoint[];
  hasReceivedFix?: boolean;
  onSetLocation?: (lat: number, lng: number) => void;
  onLocateNow?: () => void;
}

export const MapView: React.FC<MapViewProps> = ({
  location,
  heading,
  mode,
  path,
  hasReceivedFix = false,
  onSetLocation,
  onLocateNow,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const gpsPolylineRef = useRef<L.Polyline | null>(null);
  const drPolylineRef = useRef<L.Polyline | null>(null);
  const autoFollowRef = useRef<boolean>(true);
  const initialCenteredRef = useRef<boolean>(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [location.latitude, location.longitude],
      zoom: 17,
      zoomControl: false,
    });

    // OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Zoom Controls
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Click on map to reposition (useful for indoor testing)
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onSetLocation) {
        onSetLocation(e.latlng.lat, e.latlng.lng);
      }
    });

    // Disable auto-follow when user manually drags
    map.on('dragstart', () => {
      autoFollowRef.current = false;
    });

    mapInstanceRef.current = map;

    // Handle container resize & Leaflet tile rendering
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Custom Heading Marker Icon
  const createDirectionIcon = (headingDeg: number, currentMode: TrackingMode) => {
    const isDr = currentMode === 'DEAD_RECKONING';
    const mainColor = isDr ? '#f59e0b' : '#3b82f6';
    const pulseColor = isDr ? 'rgba(245, 158, 11, 0.3)' : 'rgba(59, 130, 246, 0.3)';

    return L.divIcon({
      className: 'custom-location-marker',
      html: `
        <div style="position: relative; width: 48px; height: 48px; transform: translate(-50%, -50%);">
          <!-- Orientation Cone / Beam -->
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            transform-origin: 50% 100%;
            transform: translate(-50%, -100%) rotate(${headingDeg}deg);
            border-left: 20px solid transparent;
            border-right: 20px solid transparent;
            border-top: 36px solid ${pulseColor};
            pointer-events: none;
          "></div>
          
          <!-- Direction Needle -->
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            width: 3px;
            height: 18px;
            background: ${mainColor};
            transform-origin: 50% 100%;
            transform: translate(-50%, -100%) rotate(${headingDeg}deg);
            border-radius: 2px;
            box-shadow: 0 0 4px ${mainColor};
          "></div>

          <!-- Center Dot -->
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            width: 18px;
            height: 18px;
            background: ${mainColor};
            border: 3px solid #ffffff;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
          "></div>
        </div>
      `,
      iconSize: [0, 0],
    });
  };

  // Update Location Marker & Accuracy Circle & First Fix Centering
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const latLng: L.LatLngTuple = [location.latitude, location.longitude];

    // If first fix received, force view center onto actual coordinates
    if (hasReceivedFix && !initialCenteredRef.current) {
      initialCenteredRef.current = true;
      autoFollowRef.current = true;
      map.setView(latLng, 18, { animate: true });
    }

    // Marker update
    if (!markerRef.current) {
      markerRef.current = L.marker(latLng, {
        icon: createDirectionIcon(heading, mode),
        zIndexOffset: 1000,
      }).addTo(map);
    } else {
      markerRef.current.setLatLng(latLng);
      markerRef.current.setIcon(createDirectionIcon(heading, mode));
    }

    // Accuracy Circle update
    const accuracy = location.accuracy ?? (mode === 'DEAD_RECKONING' ? 8 : 10);
    const circleColor = mode === 'DEAD_RECKONING' ? '#f59e0b' : '#3b82f6';

    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = L.circle(latLng, {
        radius: accuracy,
        color: circleColor,
        fillColor: circleColor,
        fillOpacity: 0.12,
        weight: 1,
      }).addTo(map);
    } else {
      accuracyCircleRef.current.setLatLng(latLng);
      accuracyCircleRef.current.setRadius(accuracy);
      accuracyCircleRef.current.setStyle({
        color: circleColor,
        fillColor: circleColor,
      });
    }

    // Auto-pan if enabled
    if (autoFollowRef.current) {
      map.panTo(latLng, { animate: true, duration: 0.3 });
    }
  }, [location.latitude, location.longitude, heading, mode, location.accuracy, hasReceivedFix]);

  // Update Path Trails (GPS in Blue, DR in Orange)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const gpsPoints: L.LatLngTuple[] = [];
    const drPoints: L.LatLngTuple[] = [];

    path.forEach((pt) => {
      if (pt.mode === 'GPS') {
        gpsPoints.push([pt.lat, pt.lng]);
      } else {
        drPoints.push([pt.lat, pt.lng]);
      }
    });

    // Update GPS Polyline
    if (!gpsPolylineRef.current) {
      gpsPolylineRef.current = L.polyline(gpsPoints, {
        color: '#2563eb',
        weight: 4,
        opacity: 0.85,
        smoothFactor: 1,
      }).addTo(map);
    } else {
      gpsPolylineRef.current.setLatLngs(gpsPoints);
    }

    // Update DR Polyline
    if (!drPolylineRef.current) {
      drPolylineRef.current = L.polyline(drPoints, {
        color: '#f59e0b',
        weight: 4,
        opacity: 0.9,
        dashArray: '6, 6',
        smoothFactor: 1,
      }).addTo(map);
    } else {
      drPolylineRef.current.setLatLngs(drPoints);
    }
  }, [path]);

  const handleCenterMap = () => {
    if (!mapInstanceRef.current) return;
    autoFollowRef.current = true;
    mapInstanceRef.current.setView([location.latitude, location.longitude], 18, {
      animate: true,
    });
    if (onLocateNow) {
      onLocateNow();
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-900">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Floating Action Controls */}
      <div className="absolute top-4 right-4 z-500 flex flex-col gap-2">
        <button
          onClick={handleCenterMap}
          className="p-3 bg-slate-900/90 hover:bg-slate-800 text-slate-100 border border-slate-700 rounded-lg shadow-xl backdrop-blur transition-colors flex items-center justify-center group"
          title="Center map & Locate current GPS"
        >
          <Navigation className="w-5 h-5 text-sky-400 group-hover:scale-110 transition-transform" />
        </button>

        <button
          onClick={() => {
            if (mapInstanceRef.current) {
              autoFollowRef.current = true;
              mapInstanceRef.current.panTo([location.latitude, location.longitude]);
            }
          }}
          className="p-3 bg-slate-900/90 hover:bg-slate-800 text-slate-100 border border-slate-700 rounded-lg shadow-xl backdrop-blur transition-colors"
          title="Re-lock Auto-Follow"
        >
          <Crosshair className="w-5 h-5 text-emerald-400" />
        </button>
      </div>

      {/* Map Legend & Hint Overlay */}
      <div className="absolute bottom-6 left-4 z-500 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 backdrop-blur shadow-md flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-1 bg-blue-500 rounded-full inline-block"></span>
          <span>GPS Fixes</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-1 bg-amber-500 rounded-full inline-block border-b border-dashed border-amber-300"></span>
          <span>IMU Dead Reckoning</span>
        </div>
        <div className="hidden md:flex items-center gap-1 text-slate-500">
          <MapPin className="w-3.5 h-3.5 text-slate-400" />
          <span>Click map to set pin | Keys: [W] Walk, [A]/[D] Turn, [Space] Auto</span>
        </div>
      </div>
    </div>
  );
};
