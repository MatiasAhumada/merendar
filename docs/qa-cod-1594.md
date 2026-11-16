# Regresión visual de COD-1594

## Alineación del encabezado autenticado

La navegación autenticada usa un contenedor `max-w-7xl` con `px-4 sm:px-6 lg:px-8` tanto en el encabezado como en `main`. En pantallas menores a `lg`, los controles de menú y marca ocupan la primera fila; el título queda en la fila siguiente y comparte origen horizontal con el primer encabezado del contenido. En escritorio, el menú móvil y el logo móvil quedan ocultos.

La regresión E2E vive en `tests/e2e/logout-sidebar.spec.ts`. Compara la coordenada X del título del encabezado y el primer `h1` de `main` a 1440, 768, 390 y 320 px, y comprueba navegación desde el menú, visibilidad del avatar y ausencia del botón móvil en escritorio.

### Evidencia local del 2026-11-16

- Antes del cambio: diferencias X de 0 px a 1440, 96 px a 768, 104 px a 390 y 104 px a 320.
- Después del cambio: diferencias X de 0 px en los cuatro anchos.
- Navegador integrado: vista autenticada revisada en escritorio y a 390×844; el menú abrió y navegó a Familias. No se modificaron datos desde esa navegación.
- Playwright Chromium: `tests/e2e/logout-sidebar.spec.ts`, 3 pasadas y 3 omitidas por alcance desktop-only, en 390×844 y 1440×900. La prueba nueva también verificó 768 y 320 px.
- `pnpm lint` y `pnpm build`: pasaron sin errores ni advertencias.
- `pnpm start`: permaneció activo y `/login` respondió HTTP 200.
- No hubo cambios en el esquema Prisma ni se creó una migración.
