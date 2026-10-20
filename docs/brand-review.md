# Revisión visual de la identidad Merendar

Revisión realizada el 20 de octubre de 2026 en el build de producción local.

## Navegador integrado

Se comprobó el panel autenticado en el navegador integrado (viewport 575 × 697). El emblema de casa, sol, manos y comunidad aparece en la barra móvil; los colores cálidos se aplican a la navegación, los avisos y la tarjeta del operativo. La navegación inferior y el contenido principal permanecen visibles sin desbordamiento horizontal.

El recurso del isotipo responde HTTP 200. Tras desactivar la optimización de Next.js para los logos de marca, el navegador muestra el recurso actualizado en lugar de la versión guardada en caché.

## Validaciones

- `pnpm lint`: correcto.
- `pnpm build`: correcto.
- `pnpm start -p 3002`: servidor listo; `/login` responde HTTP 200.
