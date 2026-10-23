// Incident lifecycle: creation, AI severity scoring, report fusion and resolution.
import { findLocality, nearestLocality } from '../data/chennai.js';
import { json, one, query } from '../db/postgres.js';
import { haversineKm } from './geo.js';
import { predictSeverity, sendFeedback } from './ml.js';
import { createAlert } from './notifier.js';
import { EVENTS, publish } from './events.js';
import { emit } from './realtime.js';
import { state } from './state.js';

const NEED_BY_CATEGORY = {
  rescue: 'rescue',
  medical: 'medical',
  fire: 'firefighting',
  food_water: 'food_water',
  shelter: 'shelter',
  infrastructure: 'infrastructure',
};

export function buildFeatures(input = {}, type = 'flood') {
  const loc = nearestLocality(input.lat ?? 13.03, input.lng ?? 80.22);
  const intensity = state.scenario.type === type ? state.scenario.intensity : 0.4;
  const base = {
    disaster_type: type,
    rainfall_mm: ['flood', 'cyclone', 'landslide'].includes(type) ? Math.round(60 + 220 * intensity) : 5,
    wind_kmph: type === 'cyclone' ? Math.round(60 + 140 * intensity) : 15,
    magnitude: type === 'earthquake' ? +(4 + 3 * intensity).toFixed(1) : 0,
    water_level_m: ['flood', 'cyclone'].includes(type) ? +(0.5 + 2.5 * intensity).toFixed(2) : 0,
    population_density: loc.density,
    affected_people: 20,
    injured: 0,
    infrastructure_damage: +(0.15 + 0.5 * intensity).toFixed(2),
    report_count: 1,
  };
  const out = { ...base, ...(input.features || {}) };
  for (const k of ['affected_people', 'injured', 'report_count']) if (input[k] !== undefined) out[k] = Number(input[k]);
  return out;
}

export async function getIncident(id) {
  const inc = await one('SELECT * FROM incidents WHERE id = $1', [id]);
  if (!inc) return null;
  inc.dispatches = await query(
    `SELECT d.*, r.name AS resource_name, r.type AS resource_type FROM dispatches d
     JOIN resources r ON r.id = d.resource_id WHERE d.incident_id = $1 ORDER BY d.id`,
    [id],
  );
  return inc;
}

export async function listIncidents({ status, active } = {}) {
  if (active) return query(`SELECT * FROM incidents WHERE status <> 'resolved' ORDER BY severity_score DESC, id DESC`);
  if (status) return query(`SELECT * FROM incidents WHERE status = $1 ORDER BY id DESC`, [status]);
  return query(`SELECT * FROM incidents ORDER BY id DESC LIMIT 500`);
}

export async function createIncident(input, { silent = false } = {}) {
  const type = input.disaster_type || state.scenario.type;
  let lat = Number(input.lat);
  let lng = Number(input.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    const l = findLocality(input.locality) || nearestLocality(13.03, 80.22);
    lat = l.lat;
    lng = l.lng;
  }
  const features = buildFeatures({ ...input, lat, lng }, type);
  const pred = await predictSeverity(features);
  const locality = input.locality || nearestLocality(lat, lng).name;
  const title = input.title || `${cap(type)} emergency – ${locality}`;
  const inc = await one(
    `INSERT INTO incidents (title, description, disaster_type, lat, lng, locality, source, severity, severity_label,
       severity_score, confidence, probabilities, features, needs, affected_people, injured, report_count, model_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [
      title, input.description || null, type, lat, lng, locality, input.source || 'manual',
      pred.severity, pred.label, pred.score, pred.confidence, json(pred.probabilities), json(features),
      json(input.needs || []), features.affected_people, features.injured, features.report_count, pred.model_version,
    ],
  );
  emit('incident:new', inc);
  publish(EVENTS.INCIDENT_CREATED, inc);
  if (!silent && inc.severity >= 4) {
    await createAlert({
      level: inc.severity === 5 ? 'critical' : 'warning',
      title: `${inc.severity_label} ${type} incident`,
      message: `${title} · AI severity ${inc.severity_score}/100 · ${inc.affected_people} affected, ${inc.injured} injured`,
      incidentId: inc.id,
    });
  }
  return inc;
}

/** Re-score an incident after new information (reports, field updates). */
export async function rescore(incident, patch = {}) {
  const features = { ...incident.features, ...patch };
  const pred = await predictSeverity(features);
  const prevSeverity = incident.severity;
  const inc = await one(
    `UPDATE incidents SET features=$2, severity=$3, severity_label=$4, severity_score=$5, confidence=$6,
       probabilities=$7, affected_people=$8, injured=$9, report_count=$10, model_version=$11, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [
      incident.id, json(features), pred.severity, pred.label, pred.score, pred.confidence, json(pred.probabilities),
      features.affected_people, features.injured, features.report_count, pred.model_version,
    ],
  );
  emit('incident:update', inc);
  publish(EVENTS.INCIDENT_UPDATED, inc);
  if (inc.severity > prevSeverity && inc.severity >= 4) {
    await createAlert({
      level: inc.severity === 5 ? 'critical' : 'warning',
      title: `Severity escalated to ${inc.severity_label}`,
      message: `${inc.title} escalated ${prevSeverity}→${inc.severity} after ${inc.report_count} reports`,
      incidentId: inc.id,
    });
  }
  return inc;
}

export async function findNearbyOpen(lat, lng, km = 1.5) {
  const open = await query(`SELECT * FROM incidents WHERE status <> 'resolved'`);
  let best = null;
  let bestD = Infinity;
  for (const i of open) {
    const d = haversineKm({ lat, lng }, i);
    if (d < km && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/**
 * Data fusion: attach an NLP-classified report to an existing nearby incident
 * (raising its report count / casualty estimates and re-scoring it), or open a
 * new incident when nothing is active nearby.
 */
export async function ingestReport({ lat, lng, nlp, people, text, channel, disasterType }) {
  if (!nlp?.actionable || lat == null || lng == null) return { incident: null, merged: false };
  const need = NEED_BY_CATEGORY[nlp.category];
  const peopleCount = people || nlp.entities?.people_count || 0;
  const existing = await findNearbyOpen(lat, lng);
  if (existing) {
    const needs = Array.from(new Set([...(existing.needs || []), need].filter(Boolean)));
    await query(`UPDATE incidents SET needs=$2 WHERE id=$1`, [existing.id, json(needs)]);
    const f = existing.features;
    const patch = {
      report_count: (existing.report_count || 1) + 1,
      affected_people: f.affected_people + Math.max(5, peopleCount),
      injured: f.injured + (nlp.category === 'medical' ? Math.max(1, Math.round(peopleCount / 2)) : 0),
      infrastructure_damage: Math.min(1, f.infrastructure_damage + (nlp.category === 'infrastructure' ? 0.05 : 0.01)),
    };
    const inc = await rescore({ ...existing, needs }, patch);
    return { incident: inc, merged: true };
  }
  const loc = nearestLocality(lat, lng);
  const type = disasterType || (nlp.category === 'fire' ? 'fire' : state.scenario.type);
  const inc = await createIncident({
    title: `${labelFor(nlp.category)} – ${loc.name}`,
    description: text,
    disaster_type: type,
    lat,
    lng,
    locality: loc.name,
    source: channel,
    needs: need ? [need] : [],
    affected_people: Math.max(10, peopleCount * 3),
    injured: nlp.category === 'medical' ? Math.max(1, peopleCount) : 0,
  });
  return { incident: inc, merged: false };
}

/** Close an incident and feed the confirmed outcome back to the AI engine. */
export async function resolveIncident(id, actualSeverity) {
  const inc = await one(`SELECT * FROM incidents WHERE id=$1`, [id]);
  if (!inc || inc.status === 'resolved') return inc;
  const actual = Math.min(5, Math.max(1, Number(actualSeverity) || inc.severity));
  const updated = await one(
    `UPDATE incidents SET status='resolved', resolved_at=now(), updated_at=now(), actual_severity=$2 WHERE id=$1 RETURNING *`,
    [id, actual],
  );
  await query(
    `UPDATE dispatches SET status='completed', completed_at=now() WHERE incident_id=$1 AND status IN ('en_route','on_scene')`,
    [id],
  );
  const freed = await query(
    `UPDATE resources SET status='returning', assigned_incident_id=NULL, updated_at=now() WHERE assigned_incident_id=$1 RETURNING *`,
    [id],
  );
  freed.forEach((r) => emit('resource:update', r));
  await sendFeedback(inc.features, actual); // ← feedback loop to the ML engine
  emit('incident:update', updated);
  publish(EVENTS.INCIDENT_RESOLVED, updated);
  await createAlert({ level: 'info', title: 'Incident resolved', message: `${inc.title} closed (field-confirmed severity ${actual})`, incidentId: id });
  return updated;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const labelFor = (c) =>
  ({ rescue: 'Rescue request', medical: 'Medical emergency', fire: 'Fire', food_water: 'Food & water shortage', shelter: 'Shelter needed', infrastructure: 'Infrastructure damage' })[c] || 'Report';
