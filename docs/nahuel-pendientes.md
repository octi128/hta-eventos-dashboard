# Pendientes para el dashboard general (Nahuel)

Fase final: integrar estos cambios en el dashboard general de la empresa. No se implementa todavía.

## Páginas a medir

| Página | URL | Test A/B |
|---|---|---|
| Hollywood | https://eventos.highwaytradingacademy.com/hw/hollywood | Sí: `?framer_variant=TWBcZNpC0` (A) y `?framer_variant=xC4TrKpso` (B) |
| Houston | https://eventos.highwaytradingacademy.com/houston-new/houston | Sí: `?framer_variant=EydMCY1m5` (A) y `?framer_variant=zbodSNUpy` (B) |
| Orlando | https://eventos.highwaytradingacademy.com/orlando/orlando | No |
| New York | https://eventos.highwaytradingacademy.com/new-york/inicio | No |
| Retargeting (tráfico pago) | https://eventos.highwaytradingacademy.com/rtg/agenda-tu-llamada | Revisar |
| Retargeting (tráfico frío) | https://eventos.highwaytradingacademy.com/rtg/agenda-tu-llamada-fr | Revisar |
| Un día en Highway | https://eventos.highwaytradingacademy.com/un-dia-en-highway | No |

## Hallazgos sobre los tests actuales

- **Hollywood A vs B:** casi el mismo copy. Título, subtítulo y secciones son iguales. Solo cambian el texto del botón ("ASEGURAR MI LUGAR" vs "RESERVAR MI LUGAR GRATUITO AHORA") y el bloque de lugar y fecha.
- **Descripción de la variante B en el dashboard:** dice "subtítulo para traders con experiencia o desde cero". Ese texto no aparece en el HTML público. Revisar si la descripción está desactualizada.
- **Houston A vs B:** mismo título y secciones. Cambian el lugar del evento y el bloque "Esto es lo que vivirás en el evento del 31 de Octubre". El resto es diseño.
- **Framer A/B:** el reparto configurado en 50/50 no se cumple (en el test de Hollywood se vio 83/17 con 64 visitantes, y 88/12 en el test anterior). Reportar a soporte de Framer con capturas del panel y conteos.
- **Cuenta regresiva:** el dashboard ya muestra cuenta regresiva hasta 1.000 visitantes en el test nuevo de Hollywood.

## Cambios pendientes de definir

- [ ] Hipótesis o copy nuevo para cada variante de Hollywood y Houston (título, promesa, oferta o botón).
- [ ] Qué medir en Orlando, New York y "Un día en Highway" (hoy no están en el dashboard).
- [ ] Qué cambiar en las dos páginas de retargeting. La de tráfico pago tiene muy poco contenido en el HTML público; revisar.
- [ ] Decidir si los tests se hacen en Framer o desde Meta con URLs separadas.

## Para el dashboard de Nahuel

- Agregar New York, "Un día en Highway" y las dos páginas de retargeting como eventos o embudos.
- Mostrar el funnel completo por página, no solo por evento.
- Medir secuencias de email por evento (ya hay una integración con Brevo en este dashboard).
- Mantener el aviso de tráfico desparejo y la cuenta regresiva para tests nuevos.
