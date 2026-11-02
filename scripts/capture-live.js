// Captura el primer pantallazo en celular de versiones que Framer no puede capturar (páginas muy largas),
// desde el sitio publicado y forzando la versión con ?framer_variant=.
// Uso: node scripts/capture-live.js <ruta> <id de página> [<id de página>...]
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const SITE = "https://eventos.highwaytradingacademy.com";
const [path, ...ids] = process.argv.slice(2);
const OUT = new URL("../variants/", import.meta.url);
const index = JSON.parse(readFileSync(new URL("index.json", OUT), "utf8"));
const launch = process.env.HTTPS_PROXY && process.env.SPKI
  ? { proxy: { server: process.env.HTTPS_PROXY }, args: [`--ignore-certificate-errors-spki-list=${process.env.SPKI}`] } : {};
const browser = await chromium.launch(launch);
for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(`${SITE}${path}?framer_variant=${id}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  writeFileSync(new URL(`${id}.jpg`, OUT), await page.screenshot({ type: "jpeg", quality: 80 }));
  index.pages[id] = { path, breakpoint: "Sitio publicado (celular)" };
  console.log(`✓ ${path} ${id}`);
  await page.close();
}
await browser.close();
writeFileSync(new URL("index.json", OUT), JSON.stringify(index, null, 2) + "\n");
