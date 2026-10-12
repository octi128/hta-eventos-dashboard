import { timingSafeEqual } from "node:crypto";
import { getMetrics } from "../lib/metrics.js";

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

function authorized(req) {
  const expected = process.env.DASHBOARD_PASSWORD;
  const given = req.headers["x-dashboard-key"];
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!authorized(req)) return res.status(401).json({ error: "Contraseña incorrecta" });

  const { FRAMER_API_KEY, FRAMER_PROJECT_ID } = process.env;
  if (!FRAMER_API_KEY || !FRAMER_PROJECT_ID) return res.status(500).json({ error: "Faltan FRAMER_API_KEY o FRAMER_PROJECT_ID" });

  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 14));
  const fresh = req.query.fresh === "1";
  const hit = cache.get(days);
  if (hit && !fresh && Date.now() - hit.at < CACHE_MS) return res.status(200).json({ ...hit.data, cached: true });

  try {
    const data = await getMetrics({ projectId: FRAMER_PROJECT_ID, apiKey: FRAMER_API_KEY, days });
    cache.set(days, { at: Date.now(), data });
    return res.status(200).json(data);
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "No se pudieron leer los datos de Framer", detail: String(err?.message ?? err).slice(0, 300) });
  }
}
