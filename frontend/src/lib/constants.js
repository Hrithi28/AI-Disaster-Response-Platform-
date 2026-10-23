export const SEV = {
  1: { label: 'Low', color: '#22c55e' },
  2: { label: 'Moderate', color: '#a3e635' },
  3: { label: 'High', color: '#f59e0b' },
  4: { label: 'Severe', color: '#f97316' },
  5: { label: 'Critical', color: '#e11d48' },
};

export const RESOURCE = {
  ambulance: { label: 'Ambulance', icon: '🚑', color: '#f43f5e' },
  rescue_boat: { label: 'Rescue Boat', icon: '🚤', color: '#38bdf8' },
  fire_truck: { label: 'Fire Tender', icon: '🚒', color: '#fb923c' },
  medical_team: { label: 'Medical Team', icon: '⚕️', color: '#f472b6' },
  relief_truck: { label: 'Relief Truck', icon: '🚚', color: '#a3e635' },
  ndrf_team: { label: 'NDRF Team', icon: '🦺', color: '#facc15' },
};

export const RES_STATUS = {
  available: { label: 'Available', cls: 'bg-emerald-500/15 text-emerald-300' },
  dispatched: { label: 'En route', cls: 'bg-sky-500/15 text-sky-300' },
  on_scene: { label: 'On scene', cls: 'bg-amber-500/15 text-amber-300' },
  returning: { label: 'Returning', cls: 'bg-violet-500/15 text-violet-300' },
  offline: { label: 'Offline', cls: 'bg-slate-500/20 text-slate-400' },
};

export const INC_STATUS = {
  open: { label: 'Open', cls: 'bg-rose-500/15 text-rose-300' },
  assigned: { label: 'Assigned', cls: 'bg-sky-500/15 text-sky-300' },
  in_progress: { label: 'In progress', cls: 'bg-amber-500/15 text-amber-300' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-500/15 text-emerald-300' },
};

export const DISASTER = {
  flood: { label: 'Flood', icon: '🌊' },
  cyclone: { label: 'Cyclone', icon: '🌀' },
  earthquake: { label: 'Earthquake', icon: '🏚️' },
  fire: { label: 'Fire', icon: '🔥' },
  landslide: { label: 'Landslide', icon: '⛰️' },
};

export const CATEGORY = {
  rescue: { label: 'Rescue', color: '#38bdf8' },
  medical: { label: 'Medical', color: '#f43f5e' },
  fire: { label: 'Fire', color: '#fb923c' },
  food_water: { label: 'Food & Water', color: '#a3e635' },
  shelter: { label: 'Shelter', color: '#c084fc' },
  infrastructure: { label: 'Infrastructure', color: '#94a3b8' },
  info: { label: 'Info', color: '#64748b' },
};

export const LOCALITIES = [
  ['Velachery', 12.9791, 80.2209], ['Tambaram', 12.9249, 80.1], ['Adyar', 13.0012, 80.2565], ['T Nagar', 13.0418, 80.2341],
  ['Anna Nagar', 13.085, 80.2101], ['Mudichur', 12.9089, 80.072], ['Pallikaranai', 12.9349, 80.2137], ['Ennore', 13.2146, 80.3203],
  ['Royapuram', 13.1137, 80.2954], ['Porur', 13.0382, 80.1565], ['Guindy', 13.0067, 80.2206], ['Saidapet', 13.0213, 80.2231],
  ['Sholinganallur', 12.901, 80.2279], ['Perungudi', 12.9654, 80.2461], ['Kodambakkam', 13.0521, 80.2255], ['Thiruvanmiyur', 12.983, 80.2594],
  ['Ashok Nagar', 13.0373, 80.2123], ['Chromepet', 12.9516, 80.1462], ['Manali', 13.166, 80.262], ['Kotturpuram', 13.0185, 80.2412],
].map(([name, lat, lng]) => ({ name, lat, lng }));

export const CENTER = [13.03, 80.22];

export const CHANNEL = {
  social: { label: 'Social', color: '#38bdf8' },
  sos: { label: 'Web SOS', color: '#f43f5e' },
  sms: { label: 'SMS (2G)', color: '#f59e0b' },
  lora: { label: 'LoRa mesh', color: '#a78bfa' },
  radio: { label: 'Radio relay', color: '#34d399' },
  voice: { label: 'Voice call', color: '#f472b6' },
  field: { label: 'Field team', color: '#a3e635' },
};

export const LEVEL = {
  online: { label: 'Online · cloud connected', short: 'Online', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', dot: '#22c55e' },
  lan: { label: 'LAN-only · no internet', short: 'LAN-only', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40', dot: '#f59e0b' },
  offline: { label: 'Offline · updates queued', short: 'Offline', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40', dot: '#e11d48' },
};

export const timeAgo = (t) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};
export const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));
