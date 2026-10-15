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
| `DASHBOARD_USERS` | Usuarios habilitados, en JSON: `{"mail@dominio.com": "salt:hash"}` |
| `DASHBOARD_SECRET` | Clave para firmar las sesiones. Cambiarla cierra la sesión de todos |

## Sumar o quitar un usuario

1. Generá el hash de la contraseña: `node scripts/hash-password.js "contraseña"`
2. Agregá (o borrá) la entrada `"mail": "hash"` en `DASHBOARD_USERS` en Vercel → Settings → Environment Variables.
3. Redeployá. Un usuario borrado pierde el acceso aunque tenga una sesión abierta.

Cada push a `main` se despliega solo en Vercel.

## Secuencias de email (Brevo)

Cada evento toma sus campañas por el nombre del mail (`emailMatch` en `lib/metrics.js`, p. ej. `HW G07 …` para Hollywood). Para cada mail muestra destinatarios, apertura, clicks y bajas, y genera ideas según reglas simples en `lib/brevo.js` (asunto, llamado a la acción, bajas, frecuencia, horario y mails programados después del evento).

## Errores y mejoras de la landing

Lo que el dashboard no puede medir (un texto roto, un botón difícil de encontrar) se agrega en `notes` de cada evento en `lib/metrics.js`. Aparece en el diagnóstico junto con lo que sí se detecta solo.
