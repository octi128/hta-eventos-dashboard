// Captura cómo se ve cada versión (original y variantes A/B) de cada landing, en celular.
// Uso: FRAMER_API_KEY=... node scripts/capture-variants.js
// Guarda las imágenes en variants/<id de página>.jpg y el índice en variants/index.json.
import { withConnection } from "framer-api";
import { mkdirSync, writeFileSync } from "node:fs";
import { EVENTS } from "../lib/metrics.js";

const PROJECT = process.env.FRAMER_PROJECT_ID || "0wBFGvK3jgiViVD7lN3n";
const OUT = new URL("../variants/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const index = { capturedAt: new Date().toISOString(), pages: {} };
await withConnection(PROJECT, async (framer) => {
  const pages = await framer.getNodesWithType("WebPageNode");
  for (const ev of EVENTS) {
    for (const page of pages.filter((p) => p.path === ev.landing)) {
      const kids = await framer.getChildren(page.id);
      const breakpoints = kids.filter((k) => k.isBreakpoint);
      const phone = breakpoints.find((k) => /phone/i.test(k.name || "")) ||
        breakpoints.sort((a, b) => parseFloat(a.width) - parseFloat(b.width))[0];
      if (!phone) { console.warn(`Sin breakpoint en ${page.id}`); continue; }
      // Primer pantallazo en celular: lo que la persona ve antes de scrollear.
      const opts = (scale) => ({ format: "jpeg", quality: 80, scale, clip: { x: 0, y: 0, width: 390, height: 844 } });
      // Las páginas muy largas superan el límite de Framer a escala 2: ahí se captura a escala 1.
      const shot = await framer.screenshot(phone.id, opts(2)).catch((err) => {
        if (err?.code !== "SCREENSHOT_TOO_LARGE") throw err;
        return framer.screenshot(phone.id, opts(1));
      }).catch((err) => {
        // Si ni así entra, queda la captura anterior (o se saca del sitio publicado con scripts/capture-live.js).
        console.warn(`✗ ${ev.name} ${page.id}: ${err.message}`);
        return null;
      });
      if (!shot) continue;
      writeFileSync(new URL(`${page.id}.jpg`, OUT), shot.data);
      index.pages[page.id] = { event: ev.key, path: page.path, breakpoint: phone.name };
      console.log(`✓ ${ev.name} ${page.id} (${phone.name})`);
    }
  }
}, process.env.FRAMER_API_KEY);
writeFileSync(new URL("index.json", OUT), JSON.stringify(index, null, 2) + "\n");
process.exit(0);
