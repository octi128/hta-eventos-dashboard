import { withConnection } from "framer-api";

// Eventos que mide el dashboard. Para sumar uno nuevo (p. ej. Orlando), agregalo acá.
export const EVENTS = [
  {
    key: "hollywood",
    name: "Hollywood",
    landing: "/hw/hollywood",
    typ: "/hw/typ-evento",
    confirm: "/hw/confirmaci%C3%B3n",
    controlPageId: "TWBcZNpC0",
    variants: {
      TWBcZNpC0: { label: "Control", desc: "La original: subtítulo con el caso del alumno promedio ($3.000/mes), cuenta regresiva y fecha." },
      xC4TrKpso: {
        label: "Variante B",
        desc: "Subtítulo \"para traders con experiencia o desde cero\" y lugar del evento en vez de la cuenta regresiva.",
      },
    },
  },
  {
    key: "houston",
    name: "Houston",
    landing: "/houston-new/houston",
    typ: "/houston-new/typ-evento",
    confirm: "/houston-new/confirmaci%C3%B3n",
    controlPageId: "EydMCY1m5",
    variants: {
      EydMCY1m5: { label: "Control", desc: "La original: fondo blanco, foto del evento y promesa de $8.000/mes." },
      zbodSNUpy: { label: "lab", desc: "Rediseño oscuro con Adrián y el skyline de Houston; promesa de $4.000/mes extra." },
    },
  },
  {
    key: "orlando",
    name: "Orlando",
    landing: "/orlando/orlando",
    typ: "/orlando/typ-evento",
    confirm: "/orlando/confirmaci%C3%B3n",
    controlPageId: "yCW05L2nX",
    variants: {
      yCW05L2nX: { label: "Control", desc: "La landing actual (sin test A/B)." },
    },
  },
];

export const PUBLIC_URL = "https://eventos.highwaytradingacademy.com";
export const FRAMER_EDITOR_URL = "https://framer.com/projects/Eventos--0wBFGvK3jgiViVD7lN3n";

export const TZ = "America/Argentina/Buenos_Aires";
const TEST_LOOKBACK_DAYS = 90;

const sq = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Visitantes que vieron la landing, y cuántos de ellos avanzaron en cada paso
// (enlazados por el hash diario de visitante).
function funnelQuery(ev) {
  return `
WITH
  landing AS (
    SELECT dailyVisitorIdHash AS v,
           toString(toDate(min(timestamp), '${TZ}')) AS d,
           max(utmSource != '') AS paid,
           if(max(utmSource) = '', '(directo)', max(utmSource)) AS src
    FROM events_v2
    WHERE eventType = 'pageview' AND pathname = ${sq(ev.landing)}
    GROUP BY v
  ),
  sub AS (SELECT DISTINCT dailyVisitorIdHash AS v FROM events_v2 WHERE eventType = 'form_submit' AND pathname = ${sq(ev.landing)}),
  typ AS (SELECT DISTINCT dailyVisitorIdHash AS v FROM events_v2 WHERE eventType = 'pageview' AND pathname = ${sq(ev.typ)}),
  conf AS (SELECT DISTINCT dailyVisitorIdHash AS v FROM events_v2 WHERE eventType = 'pageview' AND pathname = ${sq(ev.confirm)})
SELECT d, paid, src,
       count() AS visitors,
       countIf(v IN (SELECT v FROM sub)) AS submitters,
       countIf(v IN (SELECT v FROM typ)) AS typ,
       countIf(v IN (SELECT v FROM conf)) AS confirmed
FROM landing
GROUP BY d, paid, src
ORDER BY d
LIMIT 5000`;
}

// Lo mismo, separado por test A/B y variante.
function abQuery(ev) {
  return `
WITH
  landing AS (
    SELECT abTestId, webPageId, dailyVisitorIdHash AS v,
           max(utmSource != '') AS paid,
           min(timestamp) AS firstTs, max(timestamp) AS lastTs
    FROM events_v2
    WHERE eventType = 'pageview' AND pathname = ${sq(ev.landing)} AND abTestId != ''
    GROUP BY abTestId, webPageId, v
  ),
  sub AS (SELECT DISTINCT dailyVisitorIdHash AS v FROM events_v2 WHERE eventType = 'form_submit' AND pathname = ${sq(ev.landing)}),
  typ AS (SELECT DISTINCT dailyVisitorIdHash AS v FROM events_v2 WHERE eventType = 'pageview' AND pathname = ${sq(ev.typ)}),
  conf AS (SELECT DISTINCT dailyVisitorIdHash AS v FROM events_v2 WHERE eventType = 'pageview' AND pathname = ${sq(ev.confirm)})
SELECT abTestId, webPageId, paid,
       count() AS visitors,
       countIf(v IN (SELECT v FROM sub)) AS submitters,
       countIf(v IN (SELECT v FROM typ)) AS typ,
       countIf(v IN (SELECT v FROM conf)) AS confirmed,
       toString(min(firstTs)) AS firstTs,
       toString(max(lastTs)) AS lastTs
FROM landing
GROUP BY abTestId, webPageId, paid
LIMIT 500`;
}

// Comportamiento por visitante en la landing: de dónde viene, con qué dispositivo,
// si interactuó (clic o formulario) y si envió el formulario.
function diagnosisQuery(ev) {
  return `
WITH per AS (
  SELECT dailyVisitorIdHash AS v,
         anyIf(utmCampaign, utmCampaign != '') AS camp,
         anyIf(utmContent, utmContent != '') AS ad,
         anyIf(utmSource, utmSource != '') AS src,
         any(device) AS dev,
         any(browser) AS br,
         countIf(eventType = 'click') AS clicks,
         anyIf(utmTerm, utmTerm != '') AS adset,
         countIf(eventType = 'form_submit') AS submits
  FROM events_v2
  WHERE pathname = ${sq(ev.landing)}
  GROUP BY v
  HAVING countIf(eventType = 'pageview') > 0
),
typ AS (SELECT DISTINCT dailyVisitorIdHash AS v FROM events_v2 WHERE eventType = 'pageview' AND pathname = ${sq(ev.typ)}),
conf AS (SELECT DISTINCT dailyVisitorIdHash AS v FROM events_v2 WHERE eventType = 'pageview' AND pathname = ${sq(ev.confirm)})
SELECT camp, adset, ad, src, dev, br,
       count() AS visitors,
       countIf(clicks > 0 OR submits > 0) AS interacted,
       countIf(submits > 0) AS submitters,
       countIf(v IN (SELECT v FROM typ)) AS typ,
       countIf(v IN (SELECT v FROM conf)) AS confirmed
FROM per
GROUP BY camp, adset, ad, src, dev, br
LIMIT 10000`;
}

// Clics en enlaces que sacan a la persona de la landing.
function outboundQuery(ev) {
  return `
SELECT href, uniq(dailyVisitorIdHash) AS visitors
FROM events_v2
WHERE pathname = ${sq(ev.landing)} AND eventType = 'click' AND href != ''
  AND NOT startsWith(href, ${sq(ev.landing)}) AND NOT startsWith(href, '#')
GROUP BY href
ORDER BY visitors DESC
LIMIT 8`;
}

const STEPS = ["visitors", "submitters", "typ", "confirmed"];
const zero = () => Object.fromEntries(STEPS.map((k) => [k, 0]));
const add = (acc, row) => { for (const k of STEPS) acc[k] += Number(row[k]) || 0; return acc; };

// Distribución normal acumulada (Abramowitz–Stegun).
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// Test z de dos proporciones: variante vs control.
export function compare(control, variant) {
  const n1 = control.visitors, n2 = variant.visitors;
  const a = control.submitters, b = variant.submitters;
  if (!n1 || !n2) return null;
  const p1 = a / n1, p2 = b / n2, p = (a + b) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return null;
  const z = (p2 - p1) / se;
  const pValue = 2 * (1 - normCdf(Math.abs(z)));
  return { lift: p1 ? (p2 - p1) / p1 : null, z, pValue, confidence: 1 - pValue };
}

// Chequeo de reparto (SRM): ¿los visitantes se dividen parejo entre variantes?
function srm(counts) {
  const total = counts.reduce((s, c) => s + c, 0);
  if (!total || counts.length < 2) return null;
  const expected = total / counts.length;
  const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
  // gl = 1 para dos variantes: p = 2·(1 − Φ(√χ²))
  const pValue = counts.length === 2 ? 2 * (1 - normCdf(Math.sqrt(chi2))) : null;
  return { chi2, pValue, broken: chi2 > 10.83 /* p < 0.001 */ };
}

function buildFunnel(rows) {
  const all = zero(), paid = zero();
  const daily = new Map(), sources = new Map();
  for (const r of rows) {
    add(all, r);
    if (Number(r.paid)) add(paid, r);
    if (!daily.has(r.d)) daily.set(r.d, { d: r.d, all: zero(), paid: zero() });
    const day = daily.get(r.d);
    add(day.all, r);
    if (Number(r.paid)) add(day.paid, r);
    if (!sources.has(r.src)) sources.set(r.src, { source: r.src, ...zero() });
    add(sources.get(r.src), r);
  }
  return {
    all, paid,
    daily: [...daily.values()].sort((x, y) => x.d.localeCompare(y.d)),
    sources: [...sources.values()].sort((x, y) => y.visitors - x.visitors),
  };
}

function buildTests(ev, rows) {
  const tests = new Map();
  for (const r of rows) {
    if (!tests.has(r.abTestId)) tests.set(r.abTestId, { id: r.abTestId, firstTs: r.firstTs, lastTs: r.lastTs, variants: new Map() });
    const t = tests.get(r.abTestId);
    if (r.firstTs < t.firstTs) t.firstTs = r.firstTs;
    if (r.lastTs > t.lastTs) t.lastTs = r.lastTs;
    if (!t.variants.has(r.webPageId)) {
      t.variants.set(r.webPageId, {
        pageId: r.webPageId,
        label: ev.variants[r.webPageId]?.label ?? `Variante ${r.webPageId}`,
        isControl: r.webPageId === ev.controlPageId,
        all: zero(), paid: zero(),
      });
    }
    const v = t.variants.get(r.webPageId);
    add(v.all, r);
    if (Number(r.paid)) add(v.paid, r);
  }
  return [...tests.values()]
    .map((t) => {
      const variants = [...t.variants.values()].sort((a, b) => (b.isControl - a.isControl) || b.all.visitors - a.all.visitors);
      const control = variants.find((v) => v.isControl) ?? variants[0];
      const totalVisitors = variants.reduce((s, v) => s + v.all.visitors, 0);
      for (const v of variants) {
        v.share = totalVisitors ? v.all.visitors / totalVisitors : 0;
        v.vsControl = v === control ? null : { all: compare(control.all, v.all), paid: compare(control.paid, v.paid) };
      }
      return { id: t.id, firstTs: t.firstTs, lastTs: t.lastTs, totalVisitors, srm: srm(variants.map((v) => v.all.visitors)), variants };
    })
    .sort((a, b) => b.lastTs.localeCompare(a.lastTs));
}

const DIAG_KEYS = ["visitors", "interacted", "submitters", "typ", "confirmed"];
const dzero = () => ({ visitors: 0, interacted: 0, submitters: 0, typ: 0, confirmed: 0 });
const dadd = (acc, r) => { for (const k of DIAG_KEYS) acc[k] += Number(r[k]) || 0; return acc; };
const crate = (g) => (g.visitors ? g.submitters / g.visitors : 0);

function groupBy(rows, keyFn, extra) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, { key: k, ...extra(r), ...dzero() });
    dadd(m.get(k), r);
  }
  return [...m.values()].sort((a, b) => b.visitors - a.visitors);
}

// Campaña "rota": mucho tráfico y una conversión muy por debajo del resto del evento.
const MIN_CAMPAIGN_VISITORS = 150;
const MIN_SEGMENT_VISITORS = 100;

function buildDiagnosis(rows, outbound) {
  const total = rows.reduce(dadd, dzero());
  const campaigns = groupBy(rows, (r) => r.camp || "", (r) => ({ campaign: r.camp || "", source: r.src || "" }));
  const srcByCamp = new Map();
  for (const r of rows) {
    const k = r.camp || "";
    if (!srcByCamp.has(k)) srcByCamp.set(k, new Map());
    const m = srcByCamp.get(k);
    m.set(r.src || "", (m.get(r.src || "") || 0) + Number(r.visitors));
  }
  for (const c of campaigns) {
    // Fuentes de la campaña, de mayor a menor tráfico.
    c.sources = [...srcByCamp.get(c.campaign)].sort((a, b) => b[1] - a[1]).map(([src, v]) => ({ src, share: c.visitors ? v / c.visitors : 0 }));
    delete c.source;
    const rest = { visitors: total.visitors - c.visitors, submitters: total.submitters - c.submitters };
    const restRate = rest.visitors ? rest.submitters / rest.visitors : 0;
    c.restRate = restRate;
    c.flagged = Boolean(c.campaign) && c.visitors >= MIN_CAMPAIGN_VISITORS && restRate > 0 && crate(c) < restRate * 0.25;
  }
  const flaggedIds = new Set(campaigns.filter((c) => c.flagged).map((c) => c.campaign));
  const flaggedTotal = campaigns.filter((c) => c.flagged).reduce(dadd, dzero());
  const clean = rows.filter((r) => !flaggedIds.has(r.camp || ""));
  const cleanTotal = clean.reduce(dadd, dzero());
  const cleanRateAll = crate(cleanTotal);

  // Cada anuncio (utm_content) con su campaña y conjunto, del más visitado al menos.
  const ads = groupBy(rows.filter((r) => r.ad), (r) => `${r.camp}|${r.ad}`, (r) => ({ campaign: r.camp || "", adset: r.adset || "", ad: r.ad }))
    .filter((a) => a.visitors >= 10)
    .slice(0, 40)
    .map((a) => ({ ...a, flagged: flaggedIds.has(a.campaign) || (a.visitors >= 100 && cleanRateAll > 0 && crate(a) < cleanRateAll * 0.25) }));

  // Dispositivo y navegador, sin las campañas rotas para no mezclar causas.
  const segments = groupBy(clean, (r) => `${r.dev}|${r.br}`, (r) => ({ device: r.dev, browser: r.br }))
    .filter((s) => s.visitors >= 20);
  const cleanRate = crate(cleanTotal);
  for (const s of segments) s.flagged = s.visitors >= MIN_SEGMENT_VISITORS && cleanRate > 0 && crate(s) < cleanRate * 0.6;

  return {
    total, clean: cleanTotal, flaggedTotal,
    campaigns: campaigns.filter((c) => c.visitors >= 10).slice(0, 12),
    ads, segments,
    outbound: outbound.map((o) => ({ href: o.href, visitors: Number(o.visitors) })),
  };
}

export async function getMetrics({ projectId, apiKey, days }) {
  const now = new Date();
  const from = new Date(now);
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  const testFrom = new Date(now.getTime() - TEST_LOOKBACK_DAYS * 864e5);

  const events = await withConnection(projectId, async (framer) => {
    const q = (query, start) => framer.agent.queryAnalytics({ query, from: start.toISOString(), to: now.toISOString() });
    return Promise.all(
      EVENTS.map(async (ev) => {
        const [funnelRows, abRows, diagRows, outRows] = await Promise.all([
          q(funnelQuery(ev), from), q(abQuery(ev), testFrom), q(diagnosisQuery(ev), from), q(outboundQuery(ev), from),
        ]);
        return {
          key: ev.key, name: ev.name,
          paths: { landing: ev.landing, typ: ev.typ, confirm: decodeURIComponent(ev.confirm) },
          publicUrl: PUBLIC_URL + ev.landing,
          editorUrl: FRAMER_EDITOR_URL,
          versions: Object.entries(ev.variants).map(([pageId, v]) => ({ pageId, isControl: pageId === ev.controlPageId, ...v })),
          funnel: buildFunnel(funnelRows),
          tests: buildTests(ev, abRows),
          diagnosis: buildDiagnosis(diagRows, outRows),
        };
      })
    );
  }, apiKey);

  return { generatedAt: now.toISOString(), timezone: TZ, range: { days, from: from.toISOString(), to: now.toISOString() }, events };
}
