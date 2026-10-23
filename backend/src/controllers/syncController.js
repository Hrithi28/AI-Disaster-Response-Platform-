import { config } from '../config.js';
import { cloudSummary, ingest as ingestRecords, pushOnce, status } from '../services/sync.js';

export const getStatus = async (_req, res) => res.json(await status());
export const pushNow = async (_req, res) => res.json(await pushOnce());

export async function ingest(req, res) {
  if (req.headers['x-sync-key'] !== config.syncKey) return res.status(401).json({ error: 'Invalid sync key' });
  const { node_id, records } = req.body || {};
  if (!node_id || !Array.isArray(records)) return res.status(400).json({ error: 'node_id and records[] required' });
  res.json({ accepted: await ingestRecords(node_id, records) });
}

export const nodes = async (_req, res) => res.json(await cloudSummary());
