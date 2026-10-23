// MongoDB layer for unstructured, high-volume data: raw social-media posts,
// citizen SOS messages, field notes (with their NLP output) and IoT sensor
// time-series. Falls back to an in-memory store when MONGO_URL is not set.
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { localDataDir } from './postgres.js';

export let mongoMode = 'unknown';

const reportSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ['social', 'sos', 'field', 'sensor'], index: true },
    text: String,
    author: String,
    phone: String,
    lat: Number,
    lng: Number,
    locality: String,
    people: Number,
    nlp: mongoose.Schema.Types.Mixed,
    incidentId: { type: Number, index: true },
    status: { type: String, default: 'new' },
  },
  { timestamps: true },
);

const readingSchema = new mongoose.Schema(
  {
    sensorCode: { type: String, index: true },
    sensorType: String,
    value: Number,
    unit: String,
    anomaly: Boolean,
    analysis: mongoose.Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

class MongoStore {
  constructor() {
    this.Report = mongoose.model('Report', reportSchema);
    this.Reading = mongoose.model('SensorReading', readingSchema);
  }
  async addReport(doc) {
    const r = await this.Report.create(doc);
    return normalise(r.toObject());
  }
  async updateReport(id, patch) {
    const r = await this.Report.findByIdAndUpdate(id, patch, { new: true }).lean();
    return r && normalise(r);
  }
  async listReports({ channel, limit = 50 } = {}) {
    const q = channel ? { channel } : {};
    return (await this.Report.find(q).sort({ createdAt: -1 }).limit(limit).lean()).map(normalise);
  }
  async reportStats() {
    const byChannel = await this.Report.aggregate([{ $group: { _id: '$channel', n: { $sum: 1 } } }]);
    const byCategory = await this.Report.aggregate([{ $group: { _id: '$nlp.category', n: { $sum: 1 } } }]);
    return {
      byChannel: Object.fromEntries(byChannel.map((d) => [d._id, d.n])),
      byCategory: Object.fromEntries(byCategory.filter((d) => d._id).map((d) => [d._id, d.n])),
      total: await this.Report.countDocuments(),
    };
  }
  async addReading(doc) {
    return normalise((await this.Reading.create(doc)).toObject());
  }
  async recentReadings(sensorCode, limit = 30) {
    return (await this.Reading.find({ sensorCode }).sort({ createdAt: -1 }).limit(limit).lean()).map(normalise).reverse();
  }
}

class MemoryStore {
  /** file: optional JSON file the store is saved to, so reports survive a restart without MongoDB. */
  constructor(file) {
    this.reports = [];
    this.readings = [];
    this.seq = 0;
    this.file = file;
    this.timer = null;
    if (file && fs.existsSync(file)) {
      try {
        const d = JSON.parse(fs.readFileSync(file, 'utf8'));
        const revive = (x) => ({ ...x, createdAt: x.createdAt && new Date(x.createdAt), updatedAt: x.updatedAt && new Date(x.updatedAt) });
        this.reports = (d.reports || []).map(revive);
        this.readings = (d.readings || []).map(revive);
        this.seq = d.seq || 0;
      } catch (e) {
        console.warn('[db] could not read saved reports, starting empty:', e.message);
      }
    }
  }
  _save() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 1500);
    this.timer.unref?.();
  }
  flush() {
    if (!this.file) return;
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ seq: this.seq, reports: this.reports, readings: this.readings.slice(-5000) }));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.warn('[db] could not save reports:', e.message);
    }
  }
  _id() {
    return (++this.seq).toString(16).padStart(24, '0');
  }
  async addReport(doc) {
    const now = new Date();
    const r = { id: this._id(), status: 'new', ...doc, createdAt: now, updatedAt: now };
    this.reports.unshift(r);
    if (this.reports.length > 5000) this.reports.pop();
    this._save();
    return r;
  }
  async updateReport(id, patch) {
    const r = this.reports.find((x) => x.id === id);
    if (r) Object.assign(r, patch, { updatedAt: new Date() });
    this._save();
    return r || null;
  }
  async listReports({ channel, limit = 50 } = {}) {
    return this.reports.filter((r) => !channel || r.channel === channel).slice(0, limit);
  }
  async reportStats() {
    const byChannel = {};
    const byCategory = {};
    for (const r of this.reports) {
      byChannel[r.channel] = (byChannel[r.channel] || 0) + 1;
      if (r.nlp?.category) byCategory[r.nlp.category] = (byCategory[r.nlp.category] || 0) + 1;
    }
    return { byChannel, byCategory, total: this.reports.length };
  }
  async addReading(doc) {
    const r = { id: this._id(), ...doc, createdAt: new Date() };
    this.readings.push(r);
    if (this.readings.length > 20000) this.readings.shift();
    this._save();
    return r;
  }
  async recentReadings(sensorCode, limit = 30) {
    return this.readings.filter((r) => r.sensorCode === sensorCode).slice(-limit);
  }
}

function normalise(doc) {
  const { _id, __v, ...rest } = doc;
  return { id: String(_id), ...rest };
}

export let store;

export async function initMongo() {
  if (config.mongoUrl) {
    await mongoose.connect(config.mongoUrl, { serverSelectionTimeoutMS: 4000 });
    store = new MongoStore();
    mongoMode = 'mongodb';
  } else {
    const memory = process.env.DB_MODE === 'memory' || process.env.NODE_ENV === 'test';
    const file = memory ? null : `${localDataDir().replace(/local-db/, 'local-docs')}.json`;
    store = new MemoryStore(file);
    mongoMode = memory ? 'in-memory document store' : 'local document store (saved on disk)';
  }
  console.log(`[db] Report store ready → ${mongoMode}`);
  return store;
}

/** Write any pending report changes to disk (called on shutdown). */
export function flushStore() {
  store?.flush?.();
}
