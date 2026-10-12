import { checkPassword, createToken } from "../lib/auth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const { email, password } = req.body || {};
  if (!email || !password || !checkPassword(email, password)) {
    await new Promise((r) => setTimeout(r, 600)); // frena intentos repetidos
    return res.status(401).json({ error: "Email o contraseña incorrectos" });
  }
  return res.status(200).json({ token: createToken(email), email: email.trim().toLowerCase() });
}
