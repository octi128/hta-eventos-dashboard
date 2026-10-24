import { getQuery, ensureSchemaOnce } from "../lib/db.js";
import { cleanEvent, insertEvents } from "../lib/tracking.js";

// Solo acepta eventos enviados desde los sitios de Highway.
const ALLOWED = /^https:\/\/([a-z0-9-]+\.)*highwaytradingacademy\.com$/;

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).end();
  if (!ALLOWED.test(origin)) return res.status(403).end();

  const query = getQuery();
  if (!query) return res.status(503).json({ error: "Falta DATABASE_URL" });

  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString("utf8");
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).end(); }
  }
  const list = Array.isArray(body?.events) ? body.events.slice(0, 20) : [body];
  const rows = list.map((e) => cleanEvent(e, req.headers)).filter(Boolean);
  if (!rows.length) return res.status(400).end();

  try {
    await ensureSchemaOnce(query);
    await insertEvents(query, rows);
  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
  return res.status(204).end();
}
