// Conexión a Postgres (Neon, desde Vercel Storage). Usa DATABASE_URL o POSTGRES_URL.
import { neon } from "@neondatabase/serverless";

let client = null;
let schemaReady = null;

export const dbUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

// query(texto, parámetros) → filas. Devuelve null si no hay base configurada.
export function getQuery() {
  if (!dbUrl()) return null;
  if (!client) client = neon(dbUrl());
  return (text, params = []) => (client.query ? client.query(text, params) : client(text, params));
}

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS hta_events (
    id bigserial PRIMARY KEY,
    ts timestamptz NOT NULL DEFAULT now(),
    vid text NOT NULL,
    type text NOT NULL,
    path text NOT NULL,
    search text,
    ref text,
    exp text,
    arm text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    label text,
    href text,
    device text,
    country text
  )`,
  `ALTER TABLE hta_events ADD COLUMN IF NOT EXISTS page_id text`,
  `CREATE INDEX IF NOT EXISTS hta_events_exp_ts ON hta_events (exp, ts)`,
  `CREATE INDEX IF NOT EXISTS hta_events_path_ts ON hta_events (path, ts)`,
];

export function ensureSchemaOnce(query) {
  if (!schemaReady) {
    schemaReady = (async () => { for (const s of SCHEMA) await query(s); })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}
