# Regresión COD-1599: quitar asignaciones del borrador

## Ejecución local del 2026-11-16

- Se reprodujo `/entrega` en desarrollo antes del cambio: las filas iniciales de familias e insumos no tenían acción para quitarlas.
- Navegador integrado: en el borrador de insumos, quitar la última fila mostró `0 productos` y el mensaje para agregar un producto; Guardar y descargar planilla quedó deshabilitado. No se guardaron cambios desde esa sesión.
- Playwright Chromium: `tests/e2e/distribution-preparation-removal.spec.ts`, **4/4** en móvil (390×844) y escritorio (1440×900). Cubre familias e insumos, el recálculo de totales y disponibilidad, ausencia de llamadas al quitar, bloqueo al vaciar, bloqueo de Quitar durante el guardado, payload y persistencia solo de las filas restantes.
- `pnpm lint`: pasó sin errores ni advertencias.
- `pnpm build`: compilación, TypeScript y generación de rutas pasaron sin errores ni advertencias.
- `PORT=3025 pnpm start`: permaneció activo; `/login` respondió HTTP 200 y `/entrega` sin sesión redirigió con HTTP 307.
- Las pruebas usaron períodos, familias y recepciones sintéticos en PostgreSQL local `dev`; la limpieza confirmó cero períodos y familias COD-1599 restantes. No se cambió el esquema ni se creó una migración Prisma.
