import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordinates, PathPoint, TrackingMode } from '../types';
import { Crosshair, MapPin, Navigation, Layers, Globe, Map as MapIcon, Plus, Minus } from 'lucide-react';

export type MapLayerType = 'satellite' | 'street' | 'dark';

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
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const gpsPolylineRef = useRef<L.Polyline | null>(null);
  const drPolylineRef = useRef<L.Polyline | null>(null);
  const autoFollowRef = useRef<boolean>(true);
  const initialCenteredRef = useRef<boolean>(false);
  const prevModeRef = useRef<TrackingMode>(mode);

  const [activeLayer, setActiveLayer] = useState<MapLayerType>('satellite');
  const [currentZoom, setCurrentZoom] = useState<number>(18);

  const getTileLayerConfig = (type: MapLayerType): { url: string; options: L.TileLayerOptions } => {
    switch (type) {
      case 'satellite':
        return {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          options: {
            maxZoom: 26,
            maxNativeZoom: 19,
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, GIS Community',
          },
        };
      case 'dark':
        return {
          url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          options: {
            maxZoom: 26,
            maxNativeZoom: 19,
            subdomains: 'abcd',
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          },
        };
      case 'street':
      default:
        return {
          url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          options: {
            maxZoom: 26,
            maxNativeZoom: 19,
            subdomains: ['a', 'b', 'c'],
            attribution: '&copy; OpenStreetMap contributors',
          },
        };
    }
  };

  // Initialize Map with Infinite Zoom
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [location.latitude, location.longitude],
      zoom: 18,
      minZoom: 1,
      maxZoom: 26,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      zoomControl: false,
    });

    const config = getTileLayerConfig('satellite');
    const initialTiles = L.tileLayer(config.url, config.options).addTo(map);
    tileLayerRef.current = initialTiles;

    map.on('zoomend', () => {
      setCurrentZoom(Number(map.getZoom().toFixed(1)));
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onSetLocation) {
        onSetLocation(e.latlng.lat, e.latlng.lng);
      }
    });

    map.on('dragstart', () => {
      autoFollowRef.current = false;
    });

    mapInstanceRef.current = map;

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

  const switchLayer = (newLayer: MapLayerType) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    setActiveLayer(newLayer);

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const config = getTileLayerConfig(newLayer);
    const newTiles = L.tileLayer(config.url, config.options).addTo(map);
    tileLayerRef.current = newTiles;
  };

  // Custom Direction Marker with smooth CSS rotation element
  const createDirectionIcon = (currentMode: TrackingMode) => {
    const isDr = currentMode === 'DEAD_RECKONING';
    const mainColor = isDr ? '#f59e0b' : '#38bdf8';
    const pulseColor = isDr ? 'rgba(245, 158, 11, 0.35)' : 'rgba(56, 189, 248, 0.35)';

    return L.divIcon({
      className: 'custom-location-marker',
      html: `
        <div class="location-marker-wrapper" style="position: relative; width: 52px; height: 52px; transform: translate(-50%, -50%);">
          <!-- Smooth Rotating Beam & Needle Container -->
          <div class="location-heading-rotator" style="
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            transition: transform 0.12s cubic-bezier(0.2, 0.8, 0.4, 1);
            transform-origin: 0 0;
            pointer-events: none;
          ">
            <!-- Orientation Beam -->
            <div style="
              position: absolute;
              top: 0;
              left: 0;
              width: 0;
              height: 0;
              transform: translate(-50%, -100%);
              border-left: 22px solid transparent;
              border-right: 22px solid transparent;
              border-top: 42px solid ${pulseColor};
            "></div>
            
            <!-- Direction Needle -->
            <div style="
              position: absolute;
              top: 0;
              left: 0;
              width: 3.5px;
              height: 24px;
              background: ${mainColor};
              transform: translate(-50%, -100%);
              border-radius: 2px;
              box-shadow: 0 0 8px ${mainColor};
            "></div>
          </div>

          <!-- Center Stationary Dot -->
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            width: 20px;
            height: 20px;
            background: ${mainColor};
            border: 3.5px solid #ffffff;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.7);
          "></div>
        </div>
      `,
      iconSize: [0, 0],
    });
  };

  // Update Location Marker position & Heading without DOM thrashing
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const latLng: L.LatLngTuple = [location.latitude, location.longitude];

    if (hasReceivedFix && !initialCenteredRef.current) {
      initialCenteredRef.current = true;
      autoFollowRef.current = true;
      map.setView(latLng, 18, { animate: true });
    }

    // Marker creation or position update
    if (!markerRef.current) {
      markerRef.current = L.marker(latLng, {
        icon: createDirectionIcon(mode),
        zIndexOffset: 1000,
      }).addTo(map);
      prevModeRef.current = mode;
    } else {
      markerRef.current.setLatLng(latLng);

      // Re-create icon ONLY if mode changes (GPS <-> DR)
      if (prevModeRef.current !== mode) {
        markerRef.current.setIcon(createDirectionIcon(mode));
        prevModeRef.current = mode;
      }
    }

    // Direct Smooth DOM CSS Transform rotation (Rock-solid, zero visual flicker!)
    const rotators = document.querySelectorAll('.location-heading-rotator');
    rotators.forEach((el) => {
      (el as HTMLElement).style.transform = `rotate(${heading}deg)`;
    });

    // Accuracy Circle update
    const accuracy = location.accuracy ?? (mode === 'DEAD_RECKONING' ? 8 : 10);
    const circleColor = mode === 'DEAD_RECKONING' ? '#f59e0b' : '#38bdf8';

    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = L.circle(latLng, {
        radius: accuracy,
        color: circleColor,
        fillColor: circleColor,
        fillOpacity: 0.16,
        weight: 1.5,
      }).addTo(map);
    } else {
      accuracyCircleRef.current.setLatLng(latLng);
      accuracyCircleRef.current.setRadius(accuracy);
      accuracyCircleRef.current.setStyle({
        color: circleColor,
        fillColor: circleColor,
      });
    }

    if (autoFollowRef.current) {
      map.panTo(latLng, { animate: true, duration: 0.3 });
    }
  }, [location.latitude, location.longitude, heading, mode, location.accuracy, hasReceivedFix]);

  // Update Path Trails
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

    if (!gpsPolylineRef.current) {
      gpsPolylineRef.current = L.polyline(gpsPoints, {
        color: '#38bdf8',
        weight: 4.5,
        opacity: 0.9,
        smoothFactor: 1,
      }).addTo(map);
    } else {
      gpsPolylineRef.current.setLatLngs(gpsPoints);
    }

    if (!drPolylineRef.current) {
      drPolylineRef.current = L.polyline(drPoints, {
        color: '#f59e0b',
        weight: 4.5,
        opacity: 0.95,
        dashArray: '7, 7',
        smoothFactor: 1,
      }).addTo(map);
    } else {
      drPolylineRef.current.setLatLngs(drPoints);
    }
  }, [path]);

  const handleCenterMap = () => {
    if (!mapInstanceRef.current) return;
    autoFollowRef.current = true;
    mapInstanceRef.current.setView([location.latitude, location.longitude], Math.max(18, currentZoom), {
      animate: true,
    });
    if (onLocateNow) {
      onLocateNow();
    }
  };

  const handleZoomIn = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomIn(1);
    }
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomOut(1);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Top-Left: Map Layer Switcher */}
      <div className="absolute top-4 left-4 z-500 flex items-center gap-1.5 p-1 bg-slate-900/90 border border-slate-700/90 rounded-xl shadow-2xl backdrop-blur">
        <button
          onClick={() => switchLayer('satellite')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all ${
            activeLayer === 'satellite'
              ? 'bg-sky-500 text-slate-950 shadow-md'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
          title="Satellite Imagery Layer"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>SATELLITE</span>
        </button>

        <button
          onClick={() => switchLayer('street')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all ${
            activeLayer === 'street'
              ? 'bg-sky-500 text-slate-950 shadow-md'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
          title="OpenStreetMap Street View"
        >
          <MapIcon className="w-3.5 h-3.5" />
          <span>STREET</span>
        </button>

        <button
          onClick={() => switchLayer('dark')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all ${
            activeLayer === 'dark'
              ? 'bg-sky-500 text-slate-950 shadow-md'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
          title="High-Contrast Dark Map"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>DARK</span>
        </button>
      </div>

      {/* Top-Right: Zoom & Navigation Controls */}
      <div className="absolute top-4 right-4 z-500 flex flex-col gap-2">
        <button
          onClick={handleCenterMap}
          className="p-3 bg-slate-900/90 hover:bg-slate-800 text-slate-100 border border-slate-700 rounded-lg shadow-xl backdrop-blur transition-colors flex items-center justify-center group"
          title="Center map & Locate GPS"
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

        {/* Zoom In & Out Buttons */}
        <div className="flex flex-col rounded-lg overflow-hidden border border-slate-700 bg-slate-900/90 shadow-xl backdrop-blur">
          <button
            onClick={handleZoomIn}
            className="p-2.5 hover:bg-slate-800 text-slate-200 border-b border-slate-800 transition-colors"
            title="Zoom In (Infinite Zoom to 26x)"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2.5 hover:bg-slate-800 text-slate-200 transition-colors"
            title="Zoom Out"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Overlay: Zoom Level & Legend */}
      <div className="absolute bottom-6 left-4 z-500 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 backdrop-blur shadow-xl flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5 text-sky-400 font-bold">
          <span>ZOOM:</span>
          <span>{currentZoom}x</span>
          <span className="text-[10px] text-slate-500 font-normal">(MAX: 26x)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-1 bg-sky-400 rounded-full inline-block"></span>
          <span>GPS Track</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-1 bg-amber-500 rounded-full inline-block border-b border-dashed border-amber-300"></span>
          <span>IMU Dead Reckoning</span>
        </div>
        <div className="hidden md:flex items-center gap-1 text-slate-500">
          <MapPin className="w-3.5 h-3.5 text-slate-400" />
          <span>Click map to reposition pin</span>
        </div>
      </div>
    </div>
  );
};
