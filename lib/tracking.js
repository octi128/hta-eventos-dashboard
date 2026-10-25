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
    page_id: typeof e.page_id === "string" && /^[A-Za-z0-9_-]{4,20}$/.test(e.page_id) ? e.page_id : null,
    country: str(headers["x-vercel-ip-country"], 4),
  };
  for (const k of UTM) row[k] = str(src[k], 100);
  return row;
}

const COLS = ["vid", "type", "path", "search", "ref", "exp", "arm", ...UTM, "label", "href", "device", "country", "page_id"];

export async function insertEvents(query, rows) {
  if (!rows.length) return;
  const values = [], params = [];
  rows.forEach((r, i) => {
    values.push(`(${COLS.map((_, j) => `$${i * COLS.length + j + 1}`).join(",")})`);
    for (const c of COLS) params.push(r[c] ?? null);
  });
  await query(`INSERT INTO hta_events (${COLS.join(",")}) VALUES ${values.join(",")}`, params);
}

// Versión de cada persona, tomada de su visita a la landing: la que asignó nuestro link /go (hta_v)
// o la que sirvió Framer (page_id). Las visitas con framer_variant en el link sin hta_v quedan afuera:
// el anuncio fuerza la versión y no pasan por el reparto. Las visitas de prueba (utm_content=prueba-navegador) no cuentan.
// Parámetros: $1 experimento, $2 landing, $3 desde, $4 page_id de A, $5 page_id de B.
const ASSIGN = `
  assign AS (
    SELECT vid,
      (array_agg(CASE WHEN exp = $1 AND arm IN ('A', 'B') THEN arm WHEN page_id = $4 THEN 'A' ELSE 'B' END ORDER BY ts)
        FILTER (WHERE (exp = $1 AND arm IN ('A', 'B'))
                   OR (page_id IN ($4, $5) AND position('framer_variant=' IN coalesce(search, '')) = 0)))[1] AS arm,
      (array_agg(utm_content ORDER BY ts) FILTER (WHERE utm_content IS NOT NULL))[1] AS ad
    FROM hta_events
    WHERE type = 'pageview' AND path = $2 AND ts >= $3
      AND vid NOT IN (SELECT vid FROM hta_events WHERE utm_content = 'prueba-navegador' AND vid IS NOT NULL)
      -- quien entró con un link que fuerza la versión (sin pasar por /go) vio esa versión: no cuenta
      AND vid NOT IN (SELECT vid FROM hta_events WHERE type = 'pageview' AND path = $2 AND vid IS NOT NULL
                      AND position('framer_variant=' IN coalesce(search, '')) > 0 AND NOT (coalesce(exp, '') = $1 AND coalesce(arm, '') IN ('A', 'B')))
    GROUP BY vid
  )`;
const assignParams = (exp, paths, fromIso) => [exp.key, paths.landing, fromIso, exp.arms.A.variant, exp.arms.B.variant];

// Por versión y anuncio: personas únicas en cada paso del funnel del evento.
export async function experimentRows(query, exp, paths, fromIso) {
  return query(
    `WITH ${ASSIGN}
     SELECT a.arm, coalesce(a.ad, '') AS ad,
       count(DISTINCT a.vid) AS visitors,
       count(DISTINCT e.vid) FILTER (WHERE e.type = 'form_submit' AND e.path = $2) AS submitters,
       count(DISTINCT e.vid) FILTER (WHERE e.type = 'pageview' AND e.path = $6) AS typ,
       count(DISTINCT e.vid) FILTER (WHERE e.type = 'pageview' AND e.path = $7) AS confirmed,
       count(DISTINCT e.vid) FILTER (WHERE e.type = 'click' AND e.path = $2) AS clickers
     FROM assign a LEFT JOIN hta_events e ON e.vid = a.vid AND e.ts >= $3
     WHERE a.arm IS NOT NULL
     GROUP BY a.arm, coalesce(a.ad, '')`,
    [...assignParams(exp, paths, fromIso), paths.typ, paths.confirm],
  );
}

// Páginas que visita cada versión (sirve para ver VIP y otras páginas sin configurarlas una por una).
export async function experimentPaths(query, exp, paths, fromIso) {
  return query(
    `WITH ${ASSIGN}
     SELECT a.arm, e.path, count(DISTINCT e.vid) AS people
     FROM assign a JOIN hta_events e ON e.vid = a.vid AND e.type = 'pageview' AND e.ts >= $3
     WHERE a.arm IS NOT NULL
     GROUP BY a.arm, e.path ORDER BY people DESC LIMIT 40`,
    assignParams(exp, paths, fromIso),
  );
}

// Botones y enlaces que más se tocan en la landing, por versión.
export async function experimentClicks(query, exp, paths, fromIso) {
  return query(
    `WITH ${ASSIGN}
     SELECT a.arm, e.label, count(DISTINCT e.vid) AS people
     FROM assign a JOIN hta_events e ON e.vid = a.vid AND e.type = 'click' AND e.path = $2 AND e.label IS NOT NULL AND e.ts >= $3
     WHERE a.arm IS NOT NULL
     GROUP BY a.arm, e.label ORDER BY people DESC LIMIT 30`,
    assignParams(exp, paths, fromIso),
  );
}
