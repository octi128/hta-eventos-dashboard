import { EXPERIMENTS, SITE } from "../../lib/experiments.js";

const COOKIE_DAYS = 30;

// Cada persona queda en un brazo (A o B) y siempre ve el mismo: la cookie lo recuerda.
// Los parámetros de Meta (utm_*, fbclid) pasan tal cual a la landing.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  const name = String(req.query.exp || "");
  const exp = EXPERIMENTS[name];
  if (!exp) return res.status(404).send("Experimento no encontrado");

  const cookieName = `hta_ab_${name}`;
  const match = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${cookieName}=([AB])`));
  const arm = match ? match[1] : Math.random() < 0.5 ? "A" : "B";
  res.setHeader("Set-Cookie", `${cookieName}=${arm}; Path=/; Max-Age=${COOKIE_DAYS * 86400}; SameSite=Lax; Secure`);

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== "exp") params.append(k, Array.isArray(v) ? v[0] : String(v));
  }
  params.set("framer_variant", exp.arms[arm].variant);
  params.set("hta_v", arm);
  res.setHeader("Location", `${SITE}${exp.landing}?${params.toString()}`);
  res.status(302).end();
}
