# COD-1600: historial de entregas

## Reproducción previa

- En `/entrega` autenticado en desarrollo, la vista mostraba preparación de jornada, retiros por jornada y una lista de registros limitada al período elegido. No había sección de historial ni filtros para consultar otros períodos.
- No se modificaron datos durante la revisión visual inicial.

## Cobertura implementada

- `tests/records.integration.test.ts` valida dos períodos, uno con rendición, una familia inactiva, un retiro por jornada con `DistributionRecord` vinculado, deduplicación, filtros combinados, cero coincidencias y rango de fechas invertido.
- `tests/e2e/distribution-history.spec.ts` recorre los filtros y el estado vacío, y confirma la lectura del snapshot offline en Chromium móvil de 390×844 y escritorio de 1440×900. También valida que no exista overflow horizontal.
- El E2E intercepta la descarga de PDFs históricos de otras pruebas presentes en el entorno compartido y devuelve PDFs sintéticos pequeños. El historial y el snapshot se consultan en la aplicación real.
- gstack abrió la ruta local autenticada después del cambio. La sección mostró sus controles accesibles, el mensaje de permiso vigente y el estado vacío; la consola no tuvo errores. `gstack browse responsive` generó capturas para 375×812, 768×1024 y 1280×720.

## Resultado

- `ALLOW_SYNC_INTEGRATION_TESTS=true pnpm exec tsx --test tests/records.integration.test.ts`: 1/1 aprobada.
- `ALLOW_BROWSER_TESTS=true pnpm exec playwright test tests/e2e/distribution-history.spec.ts`: 2/2 aprobadas (móvil y escritorio).
- `pnpm lint`: aprobado sin errores ni advertencias.
- `pnpm build`: aprobado; incluye `/api/records/history`.
- `pnpm start`: permaneció activo y `/login` respondió HTTP 200.
- Sin cambios de esquema ni migración Prisma.
