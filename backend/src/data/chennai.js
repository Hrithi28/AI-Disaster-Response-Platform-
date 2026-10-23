// Reference geography for the demo region (Chennai, Tamil Nadu).
export const LOCALITIES = [
  { name: 'Velachery', ta: 'வேளச்சேரி', lat: 12.9791, lng: 80.2209, density: 26000, lowLying: true },
  { name: 'Tambaram', ta: 'தாம்பரம்', lat: 12.9249, lng: 80.1, density: 14000, lowLying: false },
  { name: 'Adyar', ta: 'அடையாறு', lat: 13.0012, lng: 80.2565, density: 22000, lowLying: true },
  { name: 'T Nagar', ta: 'தி. நகர்', lat: 13.0418, lng: 80.2341, density: 29000, lowLying: false },
  { name: 'Anna Nagar', ta: 'அண்ணா நகர்', lat: 13.085, lng: 80.2101, density: 21000, lowLying: false },
  { name: 'Mudichur', ta: 'முடிச்சூர்', lat: 12.9089, lng: 80.072, density: 9000, lowLying: true },
  { name: 'Pallikaranai', ta: 'பள்ளிக்கரணை', lat: 12.9349, lng: 80.2137, density: 12000, lowLying: true },
  { name: 'Ennore', ta: 'எண்ணூர்', lat: 13.2146, lng: 80.3203, density: 8000, lowLying: true },
  { name: 'Royapuram', ta: 'ராயபுரம்', lat: 13.1137, lng: 80.2954, density: 25000, lowLying: true },
  { name: 'Porur', ta: 'போரூர்', lat: 13.0382, lng: 80.1565, density: 15000, lowLying: false },
  { name: 'Guindy', ta: 'கிண்டி', lat: 13.0067, lng: 80.2206, density: 11000, lowLying: false },
  { name: 'Saidapet', ta: 'சைதாப்பேட்டை', lat: 13.0213, lng: 80.2231, density: 24000, lowLying: true },
  { name: 'Sholinganallur', ta: 'சோழிங்கநல்லூர்', lat: 12.901, lng: 80.2279, density: 10000, lowLying: true },
  { name: 'Perungudi', ta: 'பெருங்குடி', lat: 12.9654, lng: 80.2461, density: 13000, lowLying: true },
  { name: 'Kodambakkam', ta: 'கோடம்பாக்கம்', lat: 13.0521, lng: 80.2255, density: 27000, lowLying: false },
  { name: 'Thiruvanmiyur', ta: 'திருவான்மியூர்', lat: 12.983, lng: 80.2594, density: 17000, lowLying: false },
  { name: 'Ashok Nagar', ta: 'அசோக் நகர்', lat: 13.0373, lng: 80.2123, density: 23000, lowLying: false },
  { name: 'Chromepet', ta: 'குரோம்பேட்டை', lat: 12.9516, lng: 80.1462, density: 16000, lowLying: false },
  { name: 'Manali', ta: 'மணலி', lat: 13.166, lng: 80.262, density: 7000, lowLying: true },
  { name: 'Kotturpuram', ta: 'கோட்டூர்புரம்', lat: 13.0185, lng: 80.2412, density: 15000, lowLying: true },
];

export const RESOURCE_BASES = [
  { base: 'Rajiv Gandhi Govt General Hospital', lat: 13.081, lng: 80.277, units: { ambulance: 3, medical_team: 1 } },
  { base: 'Stanley Medical College Hospital', lat: 13.106, lng: 80.287, units: { ambulance: 2, medical_team: 1 } },
  { base: 'Velachery 108 Base', lat: 12.981, lng: 80.218, units: { ambulance: 2 } },
  { base: 'Tambaram Govt Hospital', lat: 12.926, lng: 80.117, units: { ambulance: 2, medical_team: 1 } },
  { base: 'Egmore Fire Station', lat: 13.0732, lng: 80.2609, units: { fire_truck: 2 } },
  { base: 'Guindy Fire Station', lat: 13.01, lng: 80.212, units: { fire_truck: 2 } },
  { base: 'Tambaram Fire Station', lat: 12.923, lng: 80.127, units: { fire_truck: 1 } },
  { base: 'Adyar Boat Station', lat: 13.005, lng: 80.25, units: { rescue_boat: 3 } },
  { base: 'Velachery Lake Base', lat: 12.975, lng: 80.225, units: { rescue_boat: 2 } },
  { base: 'Ennore Coast Guard Post', lat: 13.21, lng: 80.315, units: { rescue_boat: 2 } },
  { base: 'NDRF Camp, Guindy', lat: 13.012, lng: 80.205, units: { ndrf_team: 3 } },
  { base: 'SDRF Avadi', lat: 13.115, lng: 80.1, units: { ndrf_team: 1 } },
  { base: 'Collectorate Relief Depot', lat: 13.09, lng: 80.285, units: { relief_truck: 2 } },
  { base: 'Chromepet Relief Depot', lat: 12.9516, lng: 80.145, units: { relief_truck: 2 } },
];

export const SENSORS = [
  { code: 'WL-ADYAR-01', sensor_type: 'water_level', locality: 'Adyar River – Kotturpuram', lat: 13.014, lng: 80.244 },
  { code: 'WL-COOUM-01', sensor_type: 'water_level', locality: 'Cooum – Chintadripet', lat: 13.076, lng: 80.268 },
  { code: 'WL-VELA-01', sensor_type: 'water_level', locality: 'Velachery Lake', lat: 12.976, lng: 80.223 },
  { code: 'WL-PALLI-01', sensor_type: 'water_level', locality: 'Pallikaranai Marsh', lat: 12.94, lng: 80.215 },
  { code: 'WL-CHEMB-01', sensor_type: 'water_level', locality: 'Chembarambakkam Outlet', lat: 13.011, lng: 80.06 },
  { code: 'WL-BUCK-01', sensor_type: 'water_level', locality: 'Buckingham Canal – Royapuram', lat: 13.115, lng: 80.29 },
  { code: 'RG-NUNG-01', sensor_type: 'rain_gauge', locality: 'Nungambakkam', lat: 13.067, lng: 80.241 },
  { code: 'RG-MEEN-01', sensor_type: 'rain_gauge', locality: 'Meenambakkam', lat: 12.994, lng: 80.18 },
  { code: 'RG-TAMB-01', sensor_type: 'rain_gauge', locality: 'Tambaram', lat: 12.925, lng: 80.105 },
  { code: 'WD-ENNR-01', sensor_type: 'wind', locality: 'Ennore Port', lat: 13.214, lng: 80.32 },
  { code: 'WD-MARI-01', sensor_type: 'wind', locality: 'Marina Beach', lat: 13.05, lng: 80.283 },
  { code: 'SM-GUIN-01', sensor_type: 'seismic', locality: 'Guindy', lat: 13.007, lng: 80.22 },
];

export function nearestLocality(lat, lng) {
  let best = LOCALITIES[0];
  let bestD = Infinity;
  for (const l of LOCALITIES) {
    const d = (l.lat - lat) ** 2 + (l.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best;
}

export const findLocality = (name) => LOCALITIES.find((l) => l.name.toLowerCase() === String(name).toLowerCase());

const ALIASES = { tnagar: 'T Nagar', 't.nagar': 'T Nagar', 'thyagaraya nagar': 'T Nagar', 'ashoknagar': 'Ashok Nagar', 'annanagar': 'Anna Nagar', 'thiruvanmiyur': 'Thiruvanmiyur', 'tiruvanmiyur': 'Thiruvanmiyur', 'chrompet': 'Chromepet', 'adayar': 'Adyar', 'velacheri': 'Velachery', 'tambram': 'Tambaram', 'sholinganalur': 'Sholinganallur', 'ta nagar': 'T Nagar', 'தியாகராய நகர்': 'T Nagar' };

const taStem = (n) => (n.length > 4 && (n.endsWith('்') || n.endsWith('ு')) ? n.slice(0, -2) : n);

/** Find a locality mentioned in free text (English, common misspellings or Tamil). */
export function localityInText(text) {
  const low = String(text).toLowerCase();
  const compact = low.replace(/\s+/g, '');
  for (const l of LOCALITIES) {
    const n = l.name.toLowerCase();
    if (low.includes(n) || compact.includes(n.replace(/\s+/g, '')) || (l.ta && text.includes(taStem(l.ta)))) return l;
  }
  for (const [alias, name] of Object.entries(ALIASES)) if (low.includes(alias) || text.includes(alias)) return findLocality(name);
  return null;
}

// ---- Street-level geocoding from OpenStreetMap street names (EN + Tamil) ----
// Lets an SMS like "trapped near Taramani Link Road" be placed on the right street
// with no internet (built by tools/map/build_offline_map.py).
import fs from 'node:fs';

let STREETS = null;
const GENERIC = /^(main road|first street|second street|cross street|new street|north street|south street|east street|west street|church road|school road|temple street|koil street|bazaar street)$/i;
function streets() {
  if (STREETS) return STREETS;
  try {
    const raw = JSON.parse(fs.readFileSync(new URL('../../data/chennai-streets.gazetteer.json', import.meta.url), 'utf8'));
    STREETS = Object.entries(raw)
      .filter(([name]) => name.length >= 8 && (/\s/.test(name) || /[஀-௿]/.test(name)) && !GENERIC.test(name))
      .map(([name, [lat, lng]]) => ({ name, key: name.toLowerCase(), lat, lng }))
      .sort((a, b) => b.name.length - a.name.length); // longest (most specific) first
  } catch {
    STREETS = [];
  }
  return STREETS;
}

/** Find an OSM street name mentioned in free text; returns { name, lat, lng } or null. */
export function streetInText(text) {
  const low = ` ${String(text).toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ')} `;
  for (const s of streets()) {
    if (low.includes(` ${s.key} `) || (/[஀-௿]/.test(s.name) && text.includes(s.name))) return s;
  }
  return null;
}

export const streetCount = () => streets().length;
