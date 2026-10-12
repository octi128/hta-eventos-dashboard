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
    variantLabels: { TWBcZNpC0: "Control", xC4TrKpso: "Variante B" },
  },
  {
    key: "houston",
    name: "Houston",
    landing: "/houston-new/houston",
    typ: "/houston-new/typ-evento",
    confirm: "/houston-new/confirmaci%C3%B3n",
    controlPageId: "EydMCY1m5",
    variantLabels: { EydMCY1m5: "Control", zbodSNUpy: "lab" },
  },
  {
    key: "orlando",
    name: "Orlando",
    landing: "/orlando/orlando",
    typ: "/orlando/typ-evento",
    confirm: "/orlando/confirmaci%C3%B3n",
    controlPageId: "yCW05L2nX",
    variantLabels: { yCW05L2nX: "Control" },
  },
];

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
        label: ev.variantLabels[r.webPageId] ?? `Variante ${r.webPageId}`,
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
        const [funnelRows, abRows] = await Promise.all([q(funnelQuery(ev), from), q(abQuery(ev), testFrom)]);
        return {
          key: ev.key, name: ev.name,
          paths: { landing: ev.landing, typ: ev.typ, confirm: decodeURIComponent(ev.confirm) },
          funnel: buildFunnel(funnelRows),
          tests: buildTests(ev, abRows),
        };
      })
    );
  }, apiKey);

  return { generatedAt: now.toISOString(), timezone: TZ, range: { days, from: from.toISOString(), to: now.toISOString() }, events };
}
