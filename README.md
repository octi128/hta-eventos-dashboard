# Dashboard de eventos HTA

Funnels y tests A/B de las landings de eventos (Hollywood, Houston, Orlando), con datos en vivo de la analítica de Framer (proyecto "Eventos").

- `index.html`: el dashboard (HTML + JS, sin build).
- `api/metrics.js`: función de Vercel que valida la contraseña y devuelve las métricas (caché de 5 min).
- `lib/metrics.js`: consultas a Framer y cálculos (funnel, reparto, confianza). Para sumar un evento, agregalo en `EVENTS`.

## Variables de entorno (Vercel)

| Variable | Qué es |
|---|---|
| `FRAMER_API_KEY` | API key del proyecto Eventos (Framer → Site Settings → General → API Keys) |
| `FRAMER_PROJECT_ID` | `0wBFGvK3jgiViVD7lN3n` |
| `DASHBOARD_PASSWORD` | Contraseña para entrar al dashboard |

Cada push a `main` se despliega solo en Vercel.
