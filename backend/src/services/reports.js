// Shared ingestion pipeline for every free-text channel (social, SOS web form,
// SMS, LoRa mesh, radio relay, field app): NLP → document store → data fusion
// into incidents → auto-dispatch for critical cases.
import { store } from '../db/mongo.js';
import { autoDispatchCritical } from './allocation.js';
import { ingestReport } from './incidents.js';
import { classifyReport } from './ml.js';
import { emit } from './realtime.js';

export async function processReport({ channel, text, lat, lng, author, phone, people, disasterType }) {
  const nlp = await classifyReport(text);
  let report = await store.addReport({ channel, text, lat, lng, author, phone, people, nlp, locality: nlp.entities?.locations?.[0] });
  const { incident, merged } = await ingestReport({ lat, lng, nlp, people, text, channel, disasterType });
  if (incident) report = (await store.updateReport(report.id, { incidentId: incident.id, status: merged ? 'merged' : 'incident_created' })) || report;
  emit('report:new', report);
  if (incident && incident.severity >= 4) await autoDispatchCritical();
  return { report, incident, merged };
}
