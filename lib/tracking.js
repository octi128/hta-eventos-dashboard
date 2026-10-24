// Medición propia: eventos de las landings (visita, clic, formulario) y resultados por experimento.
export const EVENT_TYPES = new Set(["pageview", "click", "form_submit"]);
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const str = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

// Normaliza y valida un evento del navegador. Nunca guarda lo que la persona escribe en el formulario.
export function cleanEvent(e, headers = {}) {
  if (!e || typeof e !== "object") return null;
  const type = EVENT_TYPES.has(e.type) ? e.type : null;
  const vid = typeof e.vid === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(e.vid) ? e.vid : null;
  const path = str(e.path, 300);
  if (!type || !vid || !path || !path.startsWith("/")) return null;
  const arm = e.arm === "A" || e.arm === "B" ? e.arm : null;
  const src = e.src && typeof e.src === "object" ? e.src : {};
  const row = {
    vid, type, path,
    search: str(e.search, 1000), ref: str(e.ref, 300),
    exp: arm ? str(e.exp, 40) : null, arm: str(e.exp, 40) ? arm : null,
    label: str(e.label, 120), href: str(e.href, 300),
    device: e.device === "mobile" || e.device === "desktop" ? e.device : null,
    country: str(headers["x-vercel-ip-country"], 4),
  };
  for (const k of UTM) row[k] = str(src[k], 100);
  return row;
}

const COLS = ["vid", "type", "path", "search", "ref", "exp", "arm", ...UTM, "label", "href", "device", "country"];

export async function insertEvents(query, rows) {
  if (!rows.length) return;
  const values = [], params = [];
  rows.forEach((r, i) => {
    values.push(`(${COLS.map((_, j) => `$${i * COLS.length + j + 1}`).join(",")})`);
    for (const c of COLS) params.push(r[c] ?? null);
  });
  await query(`INSERT INTO hta_events (${COLS.join(",")}) VALUES ${values.join(",")}`, params);
}

// Por brazo y anuncio: personas únicas en cada paso del funnel del evento.
export async function experimentRows(query, exp, ev, fromIso) {
  return query(
    `SELECT arm, coalesce(utm_content, '') AS ad,
       count(DISTINCT vid) FILTER (WHERE type = 'pageview' AND path = $2) AS visitors,
       count(DISTINCT vid) FILTER (WHERE type = 'form_submit' AND path = $2) AS submitters,
       count(DISTINCT vid) FILTER (WHERE type = 'pageview' AND path = $3) AS typ,
       count(DISTINCT vid) FILTER (WHERE type = 'pageview' AND path = $4) AS confirmed,
       count(DISTINCT vid) FILTER (WHERE type = 'click' AND path = $2) AS clickers
     FROM hta_events
     WHERE exp = $1 AND arm IN ('A', 'B') AND ts >= $5
     GROUP BY arm, ad`,
    [exp.key, ev.landing, ev.typ, ev.confirm, fromIso],
  );
}

// Páginas que visita cada brazo (sirve para ver VIP y otras páginas sin configurarlas una por una).
export async function experimentPaths(query, exp, fromIso) {
  return query(
    `SELECT arm, path, count(DISTINCT vid) AS people
     FROM hta_events WHERE exp = $1 AND arm IN ('A', 'B') AND type = 'pageview' AND ts >= $2
     GROUP BY arm, path ORDER BY people DESC LIMIT 40`,
    [exp.key, fromIso],
  );
}

// Botones y enlaces que más se tocan en la landing, por brazo.
export async function experimentClicks(query, exp, ev, fromIso) {
  return query(
    `SELECT arm, label, count(DISTINCT vid) AS people
     FROM hta_events WHERE exp = $1 AND arm IN ('A', 'B') AND type = 'click' AND path = $2 AND label IS NOT NULL AND ts >= $3
     GROUP BY arm, label ORDER BY people DESC LIMIT 30`,
    [exp.key, ev.landing, fromIso],
  );
}
