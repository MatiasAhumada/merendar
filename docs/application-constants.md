# Constantes de aplicación

Usá `src/constants/<responsabilidad>.constant.ts` para valores de dominio, catálogos, mensajes y texto visible. Ampliá el catálogo del dominio existente cuando el valor tenga un único propietario; usá `application-ui.constant.ts` solo para texto transversal y `common-ui.constant.ts` para etiquetas de primitivas compartidas. Importá los valores desde su módulo, sin copiarlos a schemas, handlers, servicios o componentes.

Usá `src/config/*.config.ts` para configuración de entorno o infraestructura. Los secretos se leen directamente del entorno en el módulo servidor que los necesita y no se exportan desde constantes compartidas. Los datos calculados con estado o respuesta de API permanecen en su servicio; solo sus parámetros estáticos van al catálogo. Los valores HTTP usados por el Service Worker se incluyen en `OFFLINE_SERVICE_WORKER` y se materializan con `pnpm` en `public/sw-config.js`.

Para mensajes con datos variables, exportá una función tipada que reciba los datos y arme el texto en el catálogo de su responsabilidad. Para estados persistidos, reutilizá enums Prisma. Para metadatos de navegación, usá `navigation.constant.ts` y `routes.constant.ts`; no dupliques permisos ni rutas en páginas.

Antes de terminar cambios ejecutá `pnpm check:constants`. El verificador inspecciona JSX, atributos visibles, errores, metadatos y arrays de catálogos, evitando prohibir comillas que sean sintaxis de TypeScript, contratos de framework, códigos o fixtures de prueba.
