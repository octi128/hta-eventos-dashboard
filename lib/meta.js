// Datos de los anuncios desde la API de Marketing de Meta: nombre, campaña, miniatura, link de destino,
// gasto e impresiones. Solo lectura (permiso ads_read). Se piden por ID de anuncio: los que ya vemos en
// utm_content de las landings, así no hace falta saber la cuenta publicitaria.
const GRAPH = "https://graph.facebook.com";
const CHUNK = 50; // máximo de IDs por pedido que acepta la Graph API

const AD_ID = /^\d{6,20}$/;
const num = (v) => (v == null || v === "" ? null : Number(v));

function insightFields(since, until) {
  return `insights.time_range(${JSON.stringify({ since, until })}){spend,impressions,reach,inline_link_clicks,ctr,cpm,actions}`;
}

const FIELDS = (since, until) => [
  "name", "effective_status", "campaign{name}", "adset{name}",
  "creative{thumbnail_url,url_tags,object_story_spec,asset_feed_spec}",
  insightFields(since, until),
].join(",");

// Todos los links de destino que puede tener el creativo (imagen, video, carrusel, dinámico).
function creativeLinks(c = {}) {
  const spec = c.object_story_spec || {};
  const links = [
    spec.link_data?.link,
    spec.link_data?.call_to_action?.value?.link,
    ...(spec.link_data?.child_attachments || []).map((x) => x.link),
    spec.video_data?.call_to_action?.value?.link,
    ...(c.asset_feed_spec?.link_urls || []).map((x) => x.website_url),
  ];
  return [...new Set(links.filter(Boolean))];
}

export function normalizeAd(ad) {
  const ins = ad.insights?.data?.[0] || {};
  const action = (type) => num((ins.actions || []).find((a) => a.action_type === type)?.value) ?? 0;
  const c = ad.creative || {};
  const links = creativeLinks(c);
  const forcedVariant = `${links.join(" ")} ${c.url_tags || ""}`.match(/framer_variant=([A-Za-z0-9_-]+)/)?.[1] ?? null;
  return {
    name: ad.name ?? null,
    status: ad.effective_status ?? null,
    campaign: ad.campaign?.name ?? null,
    adset: ad.adset?.name ?? null,
    thumb: c.thumbnail_url ?? null,
    link: links[0] ?? null,
    forcedVariant,
    spend: num(ins.spend) ?? 0,
    impressions: num(ins.impressions) ?? 0,
    reach: num(ins.reach) ?? 0,
    linkClicks: num(ins.inline_link_clicks) ?? 0,
    ctr: num(ins.ctr),
    cpm: num(ins.cpm),
    landingViews: action("landing_page_view"),
  };
}

async function graphGet(path, { token, version, fetchImpl }) {
  const res = await fetchImpl(`${GRAPH}/${version}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error?.message || `Meta respondió ${res.status}`);
  return body;
}

// Devuelve { ads: { [adId]: anuncio normalizado }, error }. Si un lote falla (por ejemplo, un ID que no es
// de la cuenta), se reintenta anuncio por anuncio y se saltean los que no se pueden leer.
export async function getMetaAds({ token, version = "v23.0", adIds, since, until, fetchImpl = fetch }) {
  const ids = [...new Set(adIds.filter((id) => AD_ID.test(id)))];
  const fields = encodeURIComponent(FIELDS(since, until));
  const opts = { token, version, fetchImpl };
  const out = {};
  let firstError = null;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    try {
      const body = await graphGet(`?ids=${chunk.join(",")}&fields=${fields}`, opts);
      for (const [id, ad] of Object.entries(body)) out[id] = normalizeAd(ad);
    } catch {
      const single = await Promise.allSettled(chunk.map((id) => graphGet(`${id}?fields=${fields}`, opts)));
      single.forEach((r, j) => {
        if (r.status === "fulfilled") out[chunk[j]] = normalizeAd(r.value);
        else firstError ??= r.reason?.message ?? String(r.reason);
      });
    }
  }
  if (!Object.keys(out).length && firstError) throw new Error(firstError);
  return { ads: out, error: firstError };
}
