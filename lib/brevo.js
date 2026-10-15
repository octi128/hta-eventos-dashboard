// Lectura de campañas de email (Brevo) para las secuencias de cada evento.
// Solo lectura: usa BREVO_API_KEY (API key de Brevo con permisos de lectura de campañas).
const API = "https://api.brevo.com/v3/emailCampaigns";
const TZ = "America/Argentina/Buenos_Aires";
const DAY = 864e5;

async function listCampaigns(apiKey, status) {
  const all = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const params = new URLSearchParams({ status, type: "classic", limit: "100", offset: String(offset), sort: "desc", statistics: "globalStats" });
    const res = await fetch(`${API}?${params}`, { headers: { "api-key": apiKey, accept: "application/json" } });
    if (!res.ok) throw new Error(`Brevo respondió ${res.status} al listar campañas (${status})`);
    const { campaigns = [] } = await res.json();
    all.push(...campaigns);
    if (campaigns.length < 100) break;
  }
  return all;
}

// Paso de la secuencia a partir del nombre: "HW G07 Packs VIP" → 7, "Orlando 26 Sept - Mail 02" → 2.
const stepOf = (name) => {
  const m = name.match(/\bG(\d+)\b/) || name.match(/Mail (\d+)/i);
  return m ? Number(m[1]) : null;
};

const hourOf = (iso) => Number(new Date(iso).toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false }));

function summarize(c, now) {
  const g = c.statistics?.globalStats || {};
  const sent = g.sent || 0, opens = g.uniqueViews || 0, clicks = g.uniqueClicks || 0;
  const hoursSince = c.sentDate ? (now - new Date(c.sentDate)) / 36e5 : null;
  return {
    id: c.id, name: c.name, step: stepOf(c.name), sentDate: c.sentDate, hour: c.sentDate ? hourOf(c.sentDate) : null,
    sent, opens, openRate: sent ? opens / sent : null, clicks, clickRate: sent ? clicks / sent : null,
    unsubs: g.unsubscriptions || 0,
    // Brevo cuenta aperturas con demora: antes de 24 h el dato está incompleto.
    ready: hoursSince != null && hoursSince >= 24,
  };
}

// Ideas concretas a partir de los números. Son reglas simples: sirven de punto de partida, no reemplazan el criterio.
export function suggest(ev, seq, upcoming, now = new Date()) {
  const out = [];
  const ready = seq.filter((s) => s.ready && s.sent >= 100);
  for (const s of ready) {
    if (s.openRate < 0.25) out.push({ kind: "warning", tag: "Asunto y remitente", title: `G${s.step} abre ${pct(s.openRate)}`, body: "Probá un asunto más corto y concreto (un número, una fecha o el nombre del alumno), y revisá que el remitente sea reconocible." });
    if (s.clickRate < 0.02) out.push({ kind: "warning", tag: "Llamado a la acción", title: `G${s.step} casi no tiene clicks (${pct(s.clickRate)})`, body: "Poné el botón de confirmar lugar arriba del mail y en el mismo texto, no solo al final." });
    if (s.sent && s.unsubs / s.sent > 0.01) out.push({ kind: "critical", tag: "Bajas", title: `G${s.step} tuvo ${s.unsubs} bajas (${pct(s.unsubs / s.sent)})`, body: "Más de 1% de bajas en un solo envío suele ser frecuencia o tema fuera de lo esperado. Revisá si este mail llegó a gente que ya no quiere el tema." });
  }
  for (let i = 1; i < ready.length; i++) {
    const a = ready[i - 1], b = ready[i];
    const drop = a.openRate - b.openRate;
    if (drop >= 0.15) out.push({ kind: "warning", tag: "Caída de apertura", title: `Entre G${a.step} y G${b.step} la apertura cae ${Math.round(drop * 100)} puntos`, body: "Mirá qué cambió en ese envío (horario, asunto, remitente o lista) antes de tocar el contenido." });
  }
  // Mails que no se abren en la cola final: sobra alguno o hay que segmentar.
  const tail = ready.slice(-3);
  if (tail.length === 3 && tail.every((s) => s.openRate < 0.15)) out.push({ kind: "info", tag: "Cierre de la secuencia", title: "Los últimos mails casi no se abren", body: "Considerá acortar la secuencia o mandar los últimos solo a quienes abrieron algún mail antes." });
  // Horario: compara aperturas por hora de envío.
  const byHour = (h) => ready.filter((s) => s.hour === h);
  const morning = byHour(10), evening = ready.filter((s) => s.hour >= 18 && s.hour <= 21);
  if (morning.length >= 2 && evening.length >= 2) {
    const avg = (xs) => xs.reduce((t, s) => t + s.openRate, 0) / xs.length;
    const m = avg(morning), e = avg(evening);
    if (Math.abs(m - e) >= 0.05) {
      const best = m > e ? "a las 10" : "a la tarde/noche";
      out.push({ kind: "info", tag: "Horario", title: `Los envíos ${best} abren más (${pct(Math.max(m, e))} vs ${pct(Math.min(m, e))})`, body: "Usá ese horario para los mails importantes (confirmación, última llamada)." });
    }
  }
  // Frecuencia programada: dos mails el mismo día o más de uno por día en la misma semana.
  const days = {};
  for (const u of upcoming) {
    const d = new Date(u.scheduledAt).toLocaleDateString("en-CA", { timeZone: TZ });
    days[d] = (days[d] || 0) + 1;
  }
  const busy = Object.entries(days).filter(([, n]) => n >= 2);
  if (busy.length) out.push({ kind: "warning", tag: "Frecuencia", title: `Hay ${busy.length} día${busy.length > 1 ? "s" : ""} con 2 o más mails programados`, body: `Por ejemplo ${busy[0][0]}. Si la gente recibe dos mails del mismo evento en el día, las bajas suben: espaciá uno de los dos.` });
  // Mails programados después del evento.
  if (ev.eventDate) {
    const late = upcoming.filter((u) => new Date(u.scheduledAt) > new Date(ev.eventDate + "T23:59:59-03:00"));
    if (late.length) out.push({ kind: "critical", tag: "Programación", title: `${late.length} mail${late.length > 1 ? "s" : ""} programado${late.length > 1 ? "s" : ""} después del evento`, body: `${late.map((u) => u.name).slice(0, 2).join(" · ")}${late.length > 2 ? "…" : ""}. Revisá si siguen vigentes o si conviene cancelarlos.` });
  }
  if (!ready.length && seq.length) out.push({ kind: "info", tag: "Datos", title: "Todavía no hay envíos con más de 24 h", body: "Las aperturas se completan con el tiempo. Volvé a mirar cuando pasen un par de días." });
  return out;
}

const pct = (n) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);

export async function getEmailSequences({ apiKey, events, now = new Date() }) {
  const [sent, queued] = await Promise.all([listCampaigns(apiKey, "sent"), listCampaigns(apiKey, "queued")]);
  const matchEvent = (name) => events.find((ev) => ev.emailMatch && ev.emailMatch.test(name));
  const result = Object.fromEntries(events.map((ev) => [ev.key, { sequence: [], upcoming: [] }]));
  for (const c of sent) {
    const ev = matchEvent(c.name || "");
    if (ev) result[ev.key].sequence.push(summarize(c, now));
  }
  for (const c of queued) {
    const ev = matchEvent(c.name || "");
    if (ev && c.scheduledAt) result[ev.key].upcoming.push({ id: c.id, name: c.name, step: stepOf(c.name), scheduledAt: c.scheduledAt });
  }
  for (const ev of events) {
    const r = result[ev.key];
    r.sequence.sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
    r.upcoming.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    r.suggestions = suggest(ev, r.sequence, r.upcoming, now);
  }
  return result;
}
