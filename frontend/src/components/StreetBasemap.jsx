// Full-street OFFLINE basemap: OpenStreetMap vector tiles of Chennai bundled with
// the app (frontend/public/offline/chennai-streets.pmtiles, built by
// tools/map/build_offline_map.py) and rendered by MapLibre GL inside Leaflet.
// No tile server and no internet are needed — the browser reads byte ranges of
// one local file, and the service worker keeps a copy for phones with no signal.
import '@maplibre/maplibre-gl-leaflet';
import L from 'leaflet';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

let protocolAdded = false;

export const webglSupported = () => {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
};

const ROAD = {
  motorway: '#f59e0b',
  trunk: '#f97316',
  primary: '#eab308',
  secondary: '#cbd5e1',
  tertiary: '#94a3b8',
  minor: '#64748b',
};
const W = (z8, z12, z16) => ['interpolate', ['exponential', 1.6], ['zoom'], 8, z8, 12, z12, 16, z16];

export function streetStyle(origin) {
  const isClass = (...c) => ['in', ['get', 'class'], ['literal', c]];
  return {
    version: 8,
    glyphs: `${origin}/offline/fonts/{fontstack}/{range}.pbf`,
    sources: {
      osm: { type: 'vector', url: `pmtiles://${origin}/offline/chennai-streets.pmtiles`, attribution: '© OpenStreetMap contributors' },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': '#0e1626' } },
      { id: 'sea', type: 'fill', source: 'osm', 'source-layer': 'water', filter: ['==', ['get', 'kind'], 'sea'], paint: { 'fill-color': '#0b2846' } },
      { id: 'lakes', type: 'fill', source: 'osm', 'source-layer': 'water', filter: ['in', ['get', 'kind'], ['literal', ['lake', 'marsh']]], paint: { 'fill-color': ['match', ['get', 'kind'], 'marsh', '#123a2a', '#123a63'], 'fill-opacity': 0.9 } },
      { id: 'rivers', type: 'line', source: 'osm', 'source-layer': 'water', filter: ['in', ['get', 'kind'], ['literal', ['river', 'canal']]], paint: { 'line-color': '#1d4f8a', 'line-width': W(1.5, 3, 8) } },
      { id: 'roads-minor', type: 'line', source: 'osm', 'source-layer': 'roads', filter: isClass('residential', 'living_street', 'unclassified', 'road', 'service', 'track'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ROAD.minor, 'line-width': W(0.3, 0.6, 5), 'line-opacity': 0.75 } },
      { id: 'roads-tertiary', type: 'line', source: 'osm', 'source-layer': 'roads', filter: isClass('tertiary'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ROAD.tertiary, 'line-width': W(0.5, 1.2, 8) } },
      { id: 'roads-secondary', type: 'line', source: 'osm', 'source-layer': 'roads', filter: isClass('secondary'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ROAD.secondary, 'line-width': W(0.6, 1.6, 10) } },
      { id: 'roads-primary', type: 'line', source: 'osm', 'source-layer': 'roads', filter: isClass('primary'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ROAD.primary, 'line-width': W(0.8, 2, 12) } },
      { id: 'roads-trunk', type: 'line', source: 'osm', 'source-layer': 'roads', filter: isClass('trunk', 'motorway'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['match', ['get', 'class'], 'motorway', ROAD.motorway, ROAD.trunk], 'line-width': W(1, 2.4, 14) } },
      {
        id: 'road-labels',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'roads',
        minzoom: 13,
        filter: ['has', 'name'],
        layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 16, 13], 'text-max-angle': 30 },
        paint: { 'text-color': '#e2e8f0', 'text-halo-color': '#0e1626', 'text-halo-width': 1.5 },
      },
      {
        id: 'major-road-labels',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'roads',
        minzoom: 11,
        maxzoom: 13,
        filter: ['all', ['has', 'name'], isClass('trunk', 'motorway', 'primary')],
        layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 10 },
        paint: { 'text-color': '#fde68a', 'text-halo-color': '#0e1626', 'text-halo-width': 1.5 },
      },
      {
        id: 'places',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'places',
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Medium'], 'text-size': ['interpolate', ['linear'], ['zoom'], 9, 11, 14, 15], 'text-allow-overlap': false },
        paint: { 'text-color': ['match', ['get', 'label_kind'], 'water', '#60a5fa', '#f1f5f9'], 'text-halo-color': '#0e1626', 'text-halo-width': 2 },
      },
    ],
  };
}

export default function StreetBasemap({ onError }) {
  const map = useMap();
  useEffect(() => {
    if (!webglSupported()) {
      onError?.(new Error('WebGL not available'));
      return undefined;
    }
    if (!protocolAdded) {
      maplibregl.addProtocol('pmtiles', new Protocol().tile);
      protocolAdded = true;
    }
    let layer;
    try {
      layer = L.maplibreGL({ style: streetStyle(window.location.origin), attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · offline vector tiles' });
      layer.addTo(map);
      const gl = layer.getMaplibreMap?.();
      gl?.on('error', (e) => {
        if (String(e?.error?.message || '').includes('pmtiles')) onError?.(e.error);
      });
    } catch (e) {
      onError?.(e);
    }
    return () => {
      if (layer) map.removeLayer(layer);
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
