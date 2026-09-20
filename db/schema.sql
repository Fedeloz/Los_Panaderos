CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS incidents (
  id              TEXT PRIMARY KEY,           -- 'ES-2026-0412'
  declared_at     TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL,              -- watch|active|contained|closed
  origin          GEOGRAPHY(POINT, 4326) NOT NULL,
  perimeter       GEOGRAPHY(POLYGON, 4326),   -- observed, updated by drones
  evac_polygon    GEOGRAPHY(POLYGON, 4326),   -- authorized evacuation zone
  evac_authorized_by   TEXT,                  -- NULL until a human authorizes
  evac_authorized_at   TIMESTAMPTZ,
  toa_raster_path TEXT                        -- path to time_of_arrival.tif
);

CREATE TABLE IF NOT EXISTS dwellings (
  id              BIGSERIAL PRIMARY KEY,
  cadastral_ref   TEXT UNIQUE,
  geom            GEOGRAPHY(POLYGON, 4326) NOT NULL,
  centroid        GEOGRAPHY(POINT, 4326) NOT NULL,
  use_code        TEXT NOT NULL,   -- residential|tourist|health|education|agricultural|industrial
  est_occupancy   INT,
  plus_code       TEXT,            -- speakable location reference
  access_road     TEXT
);
CREATE INDEX IF NOT EXISTS dwellings_geom_gix ON dwellings USING GIST (geom);
CREATE INDEX IF NOT EXISTS dwellings_centroid_gix ON dwellings USING GIST (centroid);

CREATE TABLE IF NOT EXISTS contacts (
  id              BIGSERIAL PRIMARY KEY,
  dwelling_id     BIGINT REFERENCES dwellings(id),
  display_name    TEXT,
  phone_e164      TEXT,
  priority        INT NOT NULL DEFAULT 1,     -- 1 = call first
  channels        TEXT[] NOT NULL DEFAULT '{voice}',
  language        TEXT NOT NULL DEFAULT 'es',
  vulnerability   JSONB NOT NULL DEFAULT '{}',
    -- {"mobility":"impaired","oxygen":true,"livestock":true,"lives_alone":true}
  source          TEXT NOT NULL               -- padron|optin|utility|SYNTHETIC
);
CREATE INDEX IF NOT EXISTS contacts_dwelling_ix ON contacts (dwelling_id);

-- state machine is PER DWELLING, not per contact
CREATE TABLE IF NOT EXISTS evac_state (
  incident_id     TEXT REFERENCES incidents(id),
  dwelling_id     BIGINT REFERENCES dwellings(id),
  state           TEXT NOT NULL,
    -- pending|dialing|confirmed|needs_assistance|refusing|unreachable|no_contact_data|evacuated
  attempts        INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  eta_front_min   REAL,          -- sampled from the TOA raster
  evac_time_min   REAL,          -- time this dwelling needs to get out
  priority_score  REAL,          -- eta_front_min - evac_time_min, ascending
  notes           TEXT,
  PRIMARY KEY (incident_id, dwelling_id)
);

CREATE TABLE IF NOT EXISTS interactions (       -- immutable audit log
  id              BIGSERIAL PRIMARY KEY,
  incident_id     TEXT,
  dwelling_id     BIGINT,
  contact_id      BIGINT,
  channel         TEXT,
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  outcome         TEXT,
  extracted       JSONB,          -- structured data from the agent
  transcript_url  TEXT,
  agent_version   TEXT,
  human_takeover  BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS resources (
  id              TEXT PRIMARY KEY,           -- 'AB-12', 'TK-03'
  kind            TEXT NOT NULL,              -- brigade|water_tanker|engine|helicopter
  display_name    TEXT,
  base_name       TEXT,
  base_loc        GEOGRAPHY(POINT, 4326) NOT NULL,
  capacity        INT,
  status          TEXT NOT NULL DEFAULT 'available',  -- available|committed|enroute|onsite|offline
  committed_incident TEXT REFERENCES incidents(id),
  eta_min         REAL
);

CREATE TABLE IF NOT EXISTS location_tokens (  -- one-time browser-GPS capture links
  token           TEXT PRIMARY KEY,
  incident_id     TEXT,
  dwelling_id     BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  lat             FLOAT8,
  lon             FLOAT8,
  accuracy_m      FLOAT8,
  captured_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS geocode_cache (
  query_norm      TEXT PRIMARY KEY,
  result          JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
