-- PostgreSQL schema: structured, relational records
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'citizen' CHECK (role IN ('admin', 'responder', 'citizen', 'volunteer')),
  resource_id   INTEGER,
  phone         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incidents (
  id               SERIAL PRIMARY KEY,
  title            TEXT NOT NULL,
  description      TEXT,
  disaster_type    TEXT NOT NULL CHECK (disaster_type IN ('flood', 'cyclone', 'earthquake', 'fire', 'landslide')),
  lat              DOUBLE PRECISION NOT NULL,
  lng              DOUBLE PRECISION NOT NULL,
  locality         TEXT,
  source           TEXT NOT NULL DEFAULT 'manual',
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved')),
  severity         INTEGER NOT NULL DEFAULT 3,
  severity_label   TEXT,
  severity_score   DOUBLE PRECISION NOT NULL DEFAULT 50,
  confidence       DOUBLE PRECISION,
  probabilities    JSONB,
  features         JSONB NOT NULL,
  needs            JSONB,
  affected_people  INTEGER NOT NULL DEFAULT 0,
  injured          INTEGER NOT NULL DEFAULT 0,
  report_count     INTEGER NOT NULL DEFAULT 1,
  actual_severity  INTEGER,
  model_version    INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS resources (
  id                   SERIAL PRIMARY KEY,
  name                 TEXT NOT NULL,
  type                 TEXT NOT NULL CHECK (type IN ('ambulance', 'rescue_boat', 'fire_truck', 'medical_team', 'relief_truck', 'ndrf_team')),
  base_name            TEXT,
  base_lat             DOUBLE PRECISION NOT NULL,
  base_lng             DOUBLE PRECISION NOT NULL,
  lat                  DOUBLE PRECISION NOT NULL,
  lng                  DOUBLE PRECISION NOT NULL,
  capacity             INTEGER NOT NULL DEFAULT 1,
  status               TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'dispatched', 'on_scene', 'returning', 'offline')),
  assigned_incident_id INTEGER REFERENCES incidents(id),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispatches (
  id           SERIAL PRIMARY KEY,
  incident_id  INTEGER NOT NULL REFERENCES incidents(id),
  resource_id  INTEGER NOT NULL REFERENCES resources(id),
  distance_km  DOUBLE PRECISION NOT NULL,
  eta_min      DOUBLE PRECISION NOT NULL,
  route        JSONB,
  method       TEXT NOT NULL DEFAULT 'optimizer',
  status       TEXT NOT NULL DEFAULT 'en_route' CHECK (status IN ('en_route', 'on_scene', 'completed', 'cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  arrived_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS alerts (
  id          SERIAL PRIMARY KEY,
  level       TEXT NOT NULL CHECK (level IN ('info', 'warning', 'critical')),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  incident_id INTEGER,
  channels    JSONB,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sensors (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  sensor_type TEXT NOT NULL,
  locality    TEXT,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  last_value  DOUBLE PRECISION,
  unit        TEXT,
  anomaly     BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
CREATE INDEX IF NOT EXISTS idx_dispatches_incident ON dispatches(incident_id);

-- ===================== v2 additions =====================
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS camp_id INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS volunteer_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_resets (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER,
  user_email TEXT,
  role       TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  status     INTEGER,
  details    JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS camps (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  locality   TEXT,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  capacity   INTEGER NOT NULL,
  occupancy  INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'open',
  contact    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory (
  id         SERIAL PRIMARY KEY,
  camp_id    INTEGER NOT NULL REFERENCES camps(id),
  item       TEXT NOT NULL,
  category   TEXT NOT NULL,
  quantity   DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit       TEXT NOT NULL,
  min_level  DOUBLE PRECISION NOT NULL DEFAULT 0,
  per_person_daily DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (camp_id, item)
);

CREATE TABLE IF NOT EXISTS inventory_tx (
  id         SERIAL PRIMARY KEY,
  camp_id    INTEGER NOT NULL,
  item       TEXT NOT NULL,
  delta      DOUBLE PRECISION NOT NULL,
  reason     TEXT NOT NULL,
  user_id    INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sms_messages (
  id          SERIAL PRIMARY KEY,
  direction   TEXT NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'sms',
  phone       TEXT NOT NULL,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL,
  incident_id INTEGER,
  report_id   TEXT,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS processed_ops (
  op_id      TEXT PRIMARY KEY,
  response   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id         SERIAL PRIMARY KEY,
  entity     TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  op         TEXT NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS synced_records (
  id          SERIAL PRIMARY KEY,
  node_id     TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  op          TEXT,
  payload     JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (node_id, entity, entity_id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER,
  role       TEXT,
  endpoint   TEXT NOT NULL UNIQUE,
  keys       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_incident ON sms_messages(incident_id);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON sync_outbox(synced_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS route_engine TEXT;
