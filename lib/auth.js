import { createHmac, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// Usuarios en la variable DASHBOARD_USERS: {"mail@dominio.com": "salt:hash", ...}
// Generar un hash: node scripts/hash-password.js "contraseña"
const SESSION_DAYS = 30;

const b64url = (buf) => Buffer.from(buf).toString("base64url");

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

function users() {
  try { return JSON.parse(process.env.DASHBOARD_USERS || "{}"); } catch { return {}; }
}

export function checkPassword(email, password) {
  const stored = users()[String(email).trim().toLowerCase()];
  if (!stored || typeof password !== "string") return false;
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  const given = scryptSync(password, salt, expected.length);
  return timingSafeEqual(given, expected);
}

function sign(payload) {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) throw new Error("Falta DASHBOARD_SECRET");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createToken(email) {
  const payload = b64url(JSON.stringify({ e: email.trim().toLowerCase(), exp: Date.now() + SESSION_DAYS * 864e5 }));
  return `${payload}.${sign(payload)}`;
}

// Devuelve el email de la sesión, o null si el token no es válido, venció o el usuario ya no existe.
export function verifyToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  let expected;
  try { expected = sign(payload); } catch { return null; }
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { e, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Date.now() > exp || !users()[e]) return null;
    return e;
  } catch { return null; }
}

export function sessionEmail(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? verifyToken(h.slice(7)) : null;
}
