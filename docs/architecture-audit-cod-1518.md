# Auditoría de arquitectura COD-1518

Esta matriz acompaña las correcciones implementadas. El prompt completo está en prompt-base-tecnico-y-flujo-de-tickets.md; los ejemplos repetidos se evalúan según la regla que ilustran.

## Flujo solicitado en el prompt maestro

| Paso | Evidencia |
| --- | --- |
| Contexto del ticket y fuentes | COD-1518, dependencias COD-1516/COD-1517 y COD-1478, AGENTS.md, CLAUDE.md, README.md y docs/ revisados antes del cambio. |
| UX, navegador y sistema visual | Se usaron las primitives compartidas; regresión Chromium en móvil y escritorio, más inspección de /login en el navegador integrado. |
| Pruebas y base de datos | Integración local con guardas de entorno; no se necesitó modificar el esquema ni crear migraciones. |
| Validación | pnpm lint, pnpm typecheck, pnpm build, pnpm check:constants, pnpm check:schema-location, integración, E2E y HTTP. |
| Commit y push | Cambios organizados por corrección, enviados a dev sin force; hashes finales en el resumen del ticket. |
| Cierre y entrega | Se cierra después de verificar el push y la regresión; el estado se comprueba en Jira. |

## Matriz de convenciones técnicas

| Secciones del prompt | Alcance comprobado | Hallazgo/corrección y evidencia |
| --- | --- | --- |
| 1–2. Fuentes de verdad y objetivo | Schemas, constants, types/interfaces, servicios y consumidores de API/offline. | Los consumidores residuales usan los contratos centralizados; COD-1516/COD-1517 no se duplican. pnpm check:constants y pnpm check:schema-location pasan. |
| 3–8. Prohibiciones, comparaciones, ternarios, tipado y nombres | Todo src/**/*.ts(x), mediante TypeScript AST y ESLint. | Cero any, typeof en runtime fuera de zod.preprocess, comparaciones estrictas con nullish/booleanos, aserciones de tipo innecesarias, comentarios, ternarios fuera de return y ternarios anidados. Nombres y contratos se comprueban con ESLint y tsc. |
| 9–12. Funciones, SOLID, Clean Architecture, tipos e interfaces | Handlers y servicios de API, servicios de dominio, repositorios y DTOs. | Las rutas de registros, rendiciones, mercadería, usuarios y permisos delegan sus consultas y reglas de aplicación a servicios. /api/synchronizations quedó en 36 líneas de adaptación HTTP; su orquestación está en src/server/services/synchronization-request.service.ts. |
| 13–19. shadcn, controles, semántica y componentes compartidos | src/components/**/*.tsx y src/components/ui/. | El AST impide controles nativos ad hoc fuera de primitives. Button y Badge siguen siendo la fuente visual central; se eliminaron DataTable y GenericModal obsoletos tras comprobar que no tenían consumidores. |
| 20, 20.1–20.10. Variants y CVA | Primitives button, badge, card, field, alert, toggle y consumidores. | Las variantes continúan tipadas y centralizadas; Button y Badge preservan el comportamiento asChild con ramas explícitas. El typecheck y las pruebas de navegador pasan. |
| 21–26. Modificaciones shadcn, tokens, Tailwind, clases e iconografía | Primitives y componentes de dominio tocados; src/app/globals.css y constantes de marca. | Sin segundo sistema visual ni cambios de paleta. Los cambios mantienen tokens y Hugeicons existentes; los estilos CSS custom tienen tipos explícitos, sin aserciones inseguras. |
| 27–32. Formularios, validación, mobile-first, tablas y accesibilidad | Familias, entrega, mercadería, rendiciones, usuarios y sus schemas. | Validación de fronteras con Zod; primitives y labels existentes. E2E cubre flujos y viewport móvil de 390×844 y escritorio de 1440×900; no se detectaron regresiones de accesibilidad en los recorridos existentes. |
| 33–36. Estados UI, Server Components, efectos y estado | Páginas, Client Components y servicios cliente. | Las páginas siguen siendo Server Components por defecto; los componentes interactivos conservan la directiva use client. El AST evita imports de implementación de servidor desde Client Components. Los estados/loading y preparación offline existentes se preservan. |
| 37–41. HTTP, errores, status, REST y acciones | src/app/api/**, src/services/**, handlers de error y cliente Axios. | Requests cliente usan Axios centralizado; el fetch restante pertenece a preparación de navegación offline que necesita Request.cache, credenciales y redirects manuales. normalizeApiError centraliza la conversión; status y contratos REST se preservan en integración. |
| 42–44. Constantes y textos UI | src/constants/**, schemas, servicios y consumidores. | pnpm check:constants pasa; se centralizaron el mapeo de recursos/capacidades de sincronización y los mensajes ya existentes se reutilizan. |
| 45–49. Prisma, repositorios, servicios, handlers y validación | Todo src/server/** y src/app/api/**. | Ningún handler importa repositorios ni ejecuta Prisma. El AST detecta imports directos, consultas Prisma y ciclos de imports runtime. Las transacciones serializables, idempotencia y locks existentes se preservaron. |
| 50–51. Seguridad y secretos | Sesión, autorización por capacidad, origen, endpoints privados, SW y configuración. | Revalidación en servidor y aislamiento de respuestas privadas preservados; sin secretos nuevos ni permisos relajados. Integración ejercita roles, sesión, origen, cuenta y conflictos. |
| 52–53. Comentarios y duplicación | Código propio bajo src/; componentes y servicios compartidos. | Se eliminaron los comentarios de código encontrados en el handler de sincronización. El control AST bloquea comentarios; no quedan directorios vacíos ni duplicados confirmados en el alcance corregido. |
| 54–65. Método, decisión shadcn, consistencia visual, layouts, componentes, rendimiento y dependencias | Componentes compartidos, src/components/ui, src/app, package.json y consumers. | Se reutilizaron primitives existentes; no se instaló stack nuevo ni se cambió el diseño. La duplicación DataTable/GenericModal se retiró porque no tenía usos. Sin cambios de dependencias. |
| 66–67. Testing y validación previa | Suites de integración y E2E, lint, TypeScript, build, start y respuestas HTTP. | Integración: 28/28. Chromium: 40 aprobadas, 2 omitidas por ser exclusivas de escritorio al correr el proyecto móvil. Build sin warnings; /login 200 y /api/records sin sesión 401. |
| 68. Checklist TypeScript | Todo src/**/*.ts(x). | allowJs desactivado; reglas AST para any, typeof, nullish/booleanos, ternarios, aserciones y efectos; pnpm typecheck pasa. |
| 69. Checklist de arquitectura | Imports, grafo runtime y límites handler/service/repository. | No hay ciclos runtime ni imports indebidos. La persistencia queda encapsulada y la lógica de negocio/orquestación sale de handlers. |
| 70. Checklist shadcn | Nodos JSX de componentes y primitives existentes. | El control AST impide button, input, textarea, select, dialog y table fuera de components/ui. E2E verifica los recorridos existentes. |
| 71–73. Checklist móvil, accesibilidad y Next.js | E2E móvil/escritorio, routing, componentes cliente/servidor y navegación offline. | Navegación, acceso offline por ruta, formularios y acciones siguen aprobados. Sin aliases /offline, caché privada ni nuevos efectos de fetch cliente. |
| 74–75. Corrección de deuda y no sobreingeniería | Hallazgos relacionados con el alcance de COD-1518. | Se corrigieron los hallazgos en código; no se crearon tickets sustitutos, factories, placeholders ni migraciones de esquema. |
| 76–79. Componentes genéricos, única fuente visual, no divergencia y decisión UI | Primitives, wrappers existentes y consumidores de los patrones corregidos. | Se mantiene Button/Badge como fuente compartida y las pantallas componen primitives existentes. No se agregó otro sistema ni controles paralelos. |
| 80–82. Comportamiento del agente y prioridad final | Diff, scripts, dependencias y cambios de producto. | Se priorizó infraestructura existente, tipado, responsabilidades y pruebas; no se redujo alcance de tests ni se introdujeron dependencias. |

## Inventario y límites de plataforma

- src/server/security no existe; no se encontró tooling que la recree.
- src/server/services contiene solo TypeScript. Todo src está sujeto a TypeScript; allowJs permanece desactivado.
- public/sw.js y public/sw-config.js pertenecen a la frontera del Service Worker/plataforma y se mantienen fuera de servicios de negocio.
- find src -type d -empty no devuelve directorios.
- No se modificaron migraciones Prisma ni datos persistidos.
- Las pruebas de integración y navegador conservan sus suites completas y guardas locales.
