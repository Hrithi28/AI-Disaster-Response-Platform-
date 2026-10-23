// PostgreSQL access layer. Three modes, same SQL everywhere:
//   1. DATABASE_URL set          → a real PostgreSQL server (Neon / RDS / local install)
//   2. default (demo / field)     → PGlite: real PostgreSQL compiled to WebAssembly, running inside
//                                   this Node process and STORED ON DISK (backend/data/local-db/).
//                                   No install, no internet, and data survives restarts.
//   3. DB_MODE=memory (tests)     → the same PGlite engine, in memory only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let pool;
let pglite;
export let pgMode = 'unknown';

export const localDataDir = () =>
  process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data', config.nodeRole === 'cloud' ? 'local-db-cloud' : 'local-db');

export async function initPostgres() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  if (config.databaseUrl) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
    await pool.query('SELECT 1');
    await pool.query(schema);
    pgMode = 'postgresql';
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const memory = process.env.DB_MODE === 'memory' || process.env.NODE_ENV === 'test';
    let dir;
    if (!memory) {
      dir = localDataDir();
      fs.mkdirSync(path.dirname(dir), { recursive: true });
    }
    pglite = memory ? new PGlite() : new PGlite(dir);
    await pglite.waitReady;
    await pglite.exec(schema);
    pool = { query: (text, params = []) => pglite.query(text, params) };
    pgMode = memory ? 'PGlite (in-memory PostgreSQL)' : 'PGlite (embedded PostgreSQL, saved on disk)';
    if (!memory) console.log(`[db] data folder: ${dir}`);
  }
  console.log(`[db] PostgreSQL ready → ${pgMode}`);
  return pool;
}

export async function closePostgres() {
  if (pglite) await pglite.close().catch(() => {});
  if (pool?.end) await pool.end().catch(() => {});
}

export async function query(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

export async function one(text, params = []) {
  const rows = await query(text, params);
  return rows[0] || null;
}

// Serialise JS values for JSONB columns.
export const json = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
