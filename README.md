# Dashboard de eventos HTA

Funnels y tests A/B de las landings de eventos (Hollywood, Houston, Orlando), con datos en vivo de la analítica de Framer (proyecto "Eventos").

- `index.html`: el dashboard (HTML + JS, sin build).
- `api/login.js`: login con email y contraseña; devuelve una sesión firmada de 30 días.
- `api/metrics.js`: función de Vercel que valida la sesión y devuelve las métricas (caché de 5 min).
- `lib/auth.js`: hash de contraseñas (scrypt) y firma de sesiones.
- `lib/metrics.js`: consultas a Framer y cálculos (funnel, reparto, confianza). Para sumar un evento, agregalo en `EVENTS`.

## Capturas de cada versión (tests A/B)

`variants/` tiene una captura del primer pantallazo en celular de cada versión de cada landing; el dashboard la muestra en "Cuál es cuál". Si cambia el diseño de una versión o se crea una variante nueva:

1. Agregá la variante (id de página, nombre y qué cambia) en `variants` dentro de `EVENTS` en `lib/metrics.js`.
2. Regenerá las capturas: `FRAMER_API_KEY=... node scripts/capture-variants.js`
3. Subí los cambios a `main`.

## Variables de entorno (Vercel)

| Variable | Qué es |
|---|---|
| `FRAMER_API_KEY` | API key del proyecto Eventos (Framer → Site Settings → General → API Keys) |
| `FRAMER_PROJECT_ID` | `0wBFGvK3jgiViVD7lN3n` |
| `BREVO_API_KEY` | (opcional) API key de Brevo con permiso de lectura de campañas. Sin esta variable, la sección de secuencias de email muestra cómo conectarla. |
| `META_ACCESS_TOKEN` | (opcional) Token de solo lectura de Meta (permiso `ads_read`, idealmente de un usuario del sistema que no vence). Suma nombre, miniatura, link, gasto y costo por formulario de cada anuncio. |
| `META_API_VERSION` | (opcional) Versión de la Graph API. Por defecto `v23.0`. |
| `DASHBOARD_USERS` | Usuarios habilitados, en JSON: `{"mail@dominio.com": "salt:hash"}` |
| `DASHBOARD_SECRET` | Clave para firmar las sesiones. Cambiarla cierra la sesión de todos |

## Sumar o quitar un usuario

1. Generá el hash de la contraseña: `node scripts/hash-password.js "contraseña"`
2. Agregá (o borrá) la entrada `"mail": "hash"` en `DASHBOARD_USERS` en Vercel → Settings → Environment Variables.
3. Redeployá. Un usuario borrado pierde el acceso aunque tenga una sesión abierta.

Cada push a `main` se despliega solo en Vercel.

## Secuencias de email (Brevo)

Cada evento toma sus campañas por el nombre del mail (`emailMatch` en `lib/metrics.js`, p. ej. `HW G07 …` para Hollywood). Para cada mail muestra destinatarios, apertura, clicks y bajas, y genera ideas según reglas simples en `lib/brevo.js` (asunto, llamado a la acción, bajas, frecuencia, horario y mails programados después del evento).

## Anuncios de Meta

Con `META_ACCESS_TOKEN`, el dashboard pide a la Graph API los anuncios que aparecen en `utm_content` de las landings (los 150 con más visitas): nombre, campaña, miniatura, link de destino, gasto, impresiones, CTR y clics (`lib/meta.js`). No hace falta el ID de la cuenta publicitaria. Si el link de un anuncio tiene `framer_variant`, se marca como link forzado. Gasto y costo por formulario están en la pestaña Anuncios; en la pestaña del test A/B se usan el nombre y la miniatura.

## Errores y mejoras de la landing

Lo que el dashboard no puede medir (un texto roto, un botón difícil de encontrar) se agrega en `notes` de cada evento en `lib/metrics.js`. Aparece en el diagnóstico junto con lo que sí se detecta solo.

## A/B testing y medición propios

No dependemos del A/B de Framer (reparte mal) ni de su analítica para los experimentos.

- **Link único por anuncio:** `https://hta-eventos-dashboard.vercel.app/go/<experimento>` (por ejemplo `/go/hollywood`). Reparte 50/50, recuerda la versión 30 días con una cookie y pasa los `utm_*` de Meta a la landing con `hta_e` y `hta_v`. Los experimentos se definen en `lib/experiments.js`.
- **Script de medición:** `t.js` registra visitas (también los cambios de página sin recarga), clics en botones y enlaces, y envíos de formulario. No guarda lo que la persona escribe. Se instala en Framer con el código de `lib/snippet.js` (custom code, al final del `<head>`).
- **Receptor:** `/api/t` guarda los eventos en Postgres (tabla `hta_events`, se crea sola). Solo acepta envíos desde dominios de `highwaytradingacademy.com`.
- **Base de datos:** Vercel → Storage → Neon (Postgres), conectada a este proyecto. Carga `DATABASE_URL` sola. Sin base, el dashboard sigue mostrando los datos de Framer.
