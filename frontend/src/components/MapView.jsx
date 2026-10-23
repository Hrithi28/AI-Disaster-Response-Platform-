import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { Circle, GeoJSON, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { CENTER, DISASTER, RESOURCE, SEV } from '../lib/constants';
import StreetBasemap from './StreetBasemap';

// Live tiles need internet. When they fail (or the control room is offline)
// the map switches to a bundled schematic basemap of Chennai (rivers, lakes,
// coast, main roads, localities) so the situation picture never disappears.
// TILE_URL on the server can point at a self-hosted tile server (MBTiles) for
// full-detail offline maps.
const TILES = {
  dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '&copy; OpenStreetMap contributors &copy; CARTO' },
};

let offlineGeo = null;
let offlineGeoPromise = null;
const loadOfflineMap = () => {
  offlineGeoPromise ||= fetch('/offline-map.json')
    .then((r) => r.json())
    .then((g) => (offlineGeo = g))
    .catch(() => null);
  return offlineGeoPromise;
};

const STYLE = {
  sea: { color: '#0c2a4a', weight: 0, fillColor: '#0c2a4a', fillOpacity: 0.9 },
  coast: { color: '#1d4e89', weight: 1.5 },
  river: { color: '#2b6cb0', weight: 2.5, opacity: 0.9 },
  canal: { color: '#2b6cb0', weight: 1.5, dashArray: '4 4', opacity: 0.8 },
  lake: { color: '#2b6cb0', weight: 1, fillColor: '#1e3a8a', fillOpacity: 0.7 },
  marsh: { color: '#2f855a', weight: 1, dashArray: '3 3', fillColor: '#14532d', fillOpacity: 0.45 },
  road: { color: '#475569', weight: 1.6, opacity: 0.9 },
};

function OfflineBasemap() {
  const [geo, setGeo] = useState(offlineGeo);
  useEffect(() => {
    if (!geo) loadOfflineMap().then(setGeo);
  }, [geo]);
  if (!geo) return null;
  const shapes = { ...geo, features: geo.features.filter((f) => f.properties.kind !== 'label') };
  const labels = geo.features.filter((f) => f.properties.kind === 'label');
  return (
    <>
      <GeoJSON data={shapes} style={(f) => STYLE[f.properties.kind] || {}} onEachFeature={(f, layer) => f.properties.kind !== 'sea' && layer.bindTooltip(f.properties.name, { sticky: true })} />
      {labels.map((f) => (
        <Marker
          key={f.properties.name}
          position={[f.geometry.coordinates[1], f.geometry.coordinates[0]]}
          interactive={false}
          icon={L.divIcon({
            className: '',
            html: `<div style="font:600 10px Inter,sans-serif;color:${f.properties.label_kind === 'water' ? '#60a5fa' : '#94a3b8'};white-space:nowrap;transform:translate(-50%,-50%);text-shadow:0 1px 2px #000">${f.properties.name}</div>`,
          })}
        />
      ))}
    </>
  );
}

const iconCache = {};
function incidentIcon(sev, selected, resolved) {
  const key = `${sev}-${selected}-${resolved}`;
  if (!iconCache[key]) {
    const c = resolved ? '#64748b' : SEV[sev]?.color || '#f59e0b';
    const ring = !resolved && sev >= 4 ? `<span class="ring animate-pulsering" style="background:${c}"></span>` : '';
    iconCache[key] = L.divIcon({ className: `inc-marker ${selected ? 'selected' : ''}`, html: `${ring}<span class="dot" style="background:${c}"></span>`, iconSize: [16, 16], iconAnchor: [8, 8] });
  }
  return iconCache[key];
}

const STATUS_BORDER = { available: '#22c55e', dispatched: '#38bdf8', on_scene: '#f59e0b', returning: '#a78bfa', offline: '#475569' };
function resourceIcon(type, status) {
  const key = `r-${type}-${status}`;
  if (!iconCache[key])
    iconCache[key] = L.divIcon({
      className: '',
      html: `<div class="res-marker" style="border-color:${STATUS_BORDER[status] || '#64748b'};opacity:${status === 'offline' ? 0.4 : 1}">${RESOURCE[type]?.icon || '•'}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  return iconCache[key];
}

function sensorIcon(anomaly) {
  const key = `s-${anomaly}`;
  if (!iconCache[key])
    iconCache[key] = L.divIcon({ className: '', html: `<div class="sensor-marker" style="background:${anomaly ? '#e11d48' : '#0ea5e9'}"></div>`, iconSize: [10, 10], iconAnchor: [5, 5] });
  return iconCache[key];
}

function campIcon(camp) {
  const pct = camp.capacity ? camp.occupancy / camp.capacity : 0;
  const color = camp.status === 'closed' ? '#64748b' : pct >= 0.95 ? '#e11d48' : pct >= 0.75 ? '#f59e0b' : '#22c55e';
  const low = camp.low_stock?.length ? '<span style="position:absolute;top:-4px;right:-4px;width:9px;height:9px;border-radius:50%;background:#f97316;border:1.5px solid #0b1120"></span>' : '';
  const key = `c-${color}-${low ? 1 : 0}`;
  if (!iconCache[key])
    iconCache[key] = L.divIcon({
      className: '',
      html: `<div style="position:relative;width:26px;height:26px;border-radius:8px;background:#0b1120;border:2px solid ${color};font-size:14px;line-height:22px;text-align:center">⛺${low}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  return iconCache[key];
}

const PIN = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#e11d48;border:2px solid #fff;transform:rotate(-45deg)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

const ZONE_COLOR = { critical: '#e11d48', high: '#f97316', elevated: '#f59e0b' };

function ClickCatcher({ onClick }) {
  useMapEvents({ click: (e) => onClick?.({ lat: +e.latlng.lat.toFixed(5), lng: +e.latlng.lng.toFixed(5) }) });
  return null;
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 13), { duration: 0.8 });
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Live tiles that report failures, so we can fall back to the offline basemap. */
function LiveTiles({ url, attribution, onFail }) {
  return (
    <TileLayer
      url={url}
      attribution={attribution}
      eventHandlers={{
        tileerror: () => {
          LiveTiles.errors = (LiveTiles.errors || 0) + 1;
          if (LiveTiles.errors > 4) onFail();
        },
        tileload: () => (LiveTiles.errors = 0),
      }}
    />
  );
}

export default function MapView({
  incidents = [],
  resources = [],
  zones = [],
  dispatches = [],
  sensors = [],
  camps = [],
  evacuation = null,
  selectedId,
  onSelect,
  onSelectCamp,
  onMapClick,
  pick,
  layers = { incidents: true, resources: true, zones: true, routes: true, sensors: true, camps: true, resolved: false },
  basemap = 'streets', // 'streets' (offline OSM vector, default) | 'live' (online raster) | 'schematic'
  forceOffline = false,
  tileUrl,
  zoom = 11,
  center = CENTER,
  flyTarget,
}) {
  const [tilesFailed, setTilesFailed] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const visibleIncidents = useMemo(() => incidents.filter((i) => layers.resolved || i.status !== 'resolved'), [incidents, layers.resolved]);
  const resById = useMemo(() => Object.fromEntries(resources.map((r) => [r.id, r])), [resources]);
  const routes = dispatches.filter((d) => d.status === 'en_route' && d.route?.length);
  // live raster tiles need internet → fall back to the bundled offline street map
  let mode = tileUrl ? 'custom' : basemap === 'live' ? (forceOffline || tilesFailed ? 'streets' : 'live') : basemap === 'schematic' ? 'schematic' : 'streets';
  if (mode === 'streets' && glFailed) mode = 'schematic';
  const tiles = tileUrl ? { url: tileUrl, attr: 'Self-hosted offline tiles' } : TILES.dark;

  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={zoom} className="h-full w-full" zoomControl>
        {mode === 'streets' && <StreetBasemap onError={() => setGlFailed(true)} />}
        {mode === 'schematic' && <OfflineBasemap />}
        {(mode === 'live' || mode === 'custom') && <LiveTiles url={tiles.url} attribution={tiles.attr} onFail={() => setTilesFailed(true)} />}
        <ClickCatcher onClick={onMapClick} />
        <FlyTo target={flyTarget} />

        {layers.zones &&
          zones.map((z) => (
            <Circle
              key={`z-${z.zone_id}-${z.center.lat}`}
              center={[z.center.lat, z.center.lng]}
              radius={z.radius_km * 1000}
              pathOptions={{ color: ZONE_COLOR[z.risk_level], weight: 1.5, dashArray: '6 6', fillColor: ZONE_COLOR[z.risk_level], fillOpacity: 0.08 }}
            >
              <Tooltip sticky>
                <b className="uppercase">{z.risk_level} risk zone</b> · {z.incident_count} incidents · risk {z.risk_score}/100
              </Tooltip>
            </Circle>
          ))}

        {evacuation?.zones?.flatMap((z) =>
          z.allocations.map((a) => (
            <Polyline key={`ev-${z.zone_id}-${a.camp_id}`} positions={a.route.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#22c55e', weight: 3, opacity: 0.85, dashArray: '8 6' }}>
              <Tooltip sticky>
                Evacuate <b>{a.people}</b> people → {a.camp_name} ({a.distance_km} km)
              </Tooltip>
            </Polyline>
          )),
        )}

        {layers.routes &&
          routes.map((d) => {
            const r = resById[d.resource_id];
            return <Polyline key={`d-${d.id}`} positions={d.route.map((p) => [p.lat, p.lng])} pathOptions={{ color: RESOURCE[r?.type || d.resource_type]?.color || '#38bdf8', weight: 2.5, opacity: 0.85, dashArray: '2 6' }} />;
          })}

        {layers.sensors &&
          sensors.map((s) => (
            <Marker key={`s-${s.code}`} position={[s.lat, s.lng]} icon={sensorIcon(s.anomaly)}>
              <Tooltip>
                <b>{s.code}</b> · {s.locality}
                <br />
                {s.sensor_type.replace('_', ' ')}: <b>{s.last_value ?? '—'}</b> {s.unit || ''} {s.anomaly ? '⚠️ ANOMALY' : ''}
              </Tooltip>
            </Marker>
          ))}

        {layers.camps &&
          camps.map((c) => (
            <Marker key={`c-${c.id}`} position={[c.lat, c.lng]} icon={campIcon(c)} eventHandlers={{ click: () => onSelectCamp?.(c) }}>
              <Tooltip direction="top" offset={[0, -10]}>
                ⛺ <b>{c.name}</b>
                <br />
                {c.occupancy}/{c.capacity} people · {c.status}
                {c.low_stock?.length ? (
                  <>
                    <br />
                    <span style={{ color: '#fb923c' }}>Low: {c.low_stock.join(', ')}</span>
                  </>
                ) : null}
              </Tooltip>
            </Marker>
          ))}

        {layers.incidents &&
          visibleIncidents.map((i) => (
            <Marker key={`i-${i.id}`} position={[i.lat, i.lng]} icon={incidentIcon(i.severity, i.id === selectedId, i.status === 'resolved')} zIndexOffset={i.severity * 100} eventHandlers={{ click: () => onSelect?.(i) }}>
              <Tooltip direction="top" offset={[0, -8]}>
                {DISASTER[i.disaster_type]?.icon} <b>{i.title}</b>
                <br />
                {SEV[i.severity]?.label} · score {Math.round(i.severity_score)} · {i.status.replace('_', ' ')}
              </Tooltip>
            </Marker>
          ))}

        {layers.resources &&
          resources.map((r) => (
            <Marker key={`r-${r.id}`} position={[r.lat, r.lng]} icon={resourceIcon(r.type, r.status)} zIndexOffset={1000}>
              <Popup>
                <b>{r.name}</b>
                <br />
                {r.base_name}
                <br />
                Status: {r.status.replace('_', ' ')}
                {r.assigned_incident_id ? ` → incident #${r.assigned_incident_id}` : ''}
              </Popup>
            </Marker>
          ))}

        {pick && <Marker position={[pick.lat, pick.lng]} icon={PIN} />}
      </MapContainer>
      {mode !== 'live' && (
        <div className={`pointer-events-none absolute right-2 top-2 z-[900] rounded-md border px-2 py-1 text-[10px] font-semibold ${mode === 'streets' ? 'border-emerald-500/40 bg-emerald-950/80 text-emerald-200' : 'border-amber-500/40 bg-amber-950/80 text-amber-200'}`}>
          {mode === 'streets' ? 'OFFLINE STREET MAP · OpenStreetMap, stored on this server' : mode === 'custom' ? 'SELF-HOSTED TILES' : 'OFFLINE SCHEMATIC MAP'}
        </div>
      )}
    </div>
  );
}
