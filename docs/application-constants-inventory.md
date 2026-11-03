# Inventario de mensajes, catálogos y valores de aplicación

Inventario del refactor COD-1516 sobre el código versionado del proyecto. El relevamiento estático recorrió todos los archivos propios de `src`, `public`, `scripts` y `tests` (sin dependencias, salida de build ni código de terceros): 30 archivos de `src/app`, 39 de `src/components`, 18 de `src/constants`, 1 de `src/config`, 1 de `src/hooks`, 4 de `src/interfaces`, 3 de `src/lib`, 27 de `src/server`, 11 de `src/services`, 6 de `src/types`, 5 de `src/utils`, 8 de `src/validations`, 25 de `public`, 2 de `scripts` y 14 de `tests`.

## Destino por responsabilidad

| Responsabilidad | Fuente de verdad | Consumidores revisados |
| --- | --- | --- |
| Autenticación y acceso | `auth.constant.ts`, `user-role.constant.ts`, `access-policy.constant.ts`, `user.constant.ts` | UI de acceso, sesiones, servicios, handlers y schemas de usuarios/permisos |
| Padrón familiar | `family.constant.ts` | UI, rutas de familias, validaciones, servicios y sincronización familiar |
| Entregas y planillas | `delivery.constant.ts` | UI de Registro, API, validaciones, PDFs online/offline y sincronización |
| Mercadería y rendiciones | `merchandise.constant.ts`, `rendition.constant.ts` | espacios de trabajo, APIs, validaciones, servicios y sincronización |
| Inicio | `dashboard.constant.ts` | dashboard, API y preparación offline |
| Sin conexión | `offline.constant.ts`, `offline-contract.constant.ts` | cola, preparación, snapshots, mensajes de sincronización y Service Worker |
| Rutas y navegación | `routes.constant.ts`, `navigation.constant.ts` | enlaces, handlers, proxy, rutas autorizadas offline y capacidades de navegación |
| HTTP | `http.constant.ts` | políticas de cache, cabeceras privadas, MIME PDF/HTML y solicitudes HTTP; la configuración compatible se genera para el Service Worker |
| Marca y metadatos | `brand.constant.ts`, catálogos UI de autenticación | layout, login y manifiesto PWA |
| Interfaz transversal | `application-ui.constant.ts`, `common-ui.constant.ts` | aplicación autenticada, componentes UI compartidos, navegación y separadores comunes |
| Errores genéricos | `error-messages.constant.ts` | fallbacks de cliente y errores de infraestructura no asociados a una entidad |
| Configuración de entorno | `src/config/application.config.ts` | cliente Axios y diagnóstico de errores; las credenciales permanecen en variables de entorno |

## Duplicaciones encontradas y resueltas

- Mensajes de validación, API y dominio familiar se repetían entre las rutas de familias, validaciones y servicios: quedaron en `family.constant.ts` y sus consumidores migraron.
- Mensajes lanzados con `Error`/`ApiError` o enviados como respuesta estaban dispersos entre UI, servicios, repositorios y handlers. Se migraron 92 literales de error en 33 archivos a catálogos por dominio.
- Textos de interfaz estaban escritos directamente en JSX, atributos accesibles y ramas condicionales. Se migraron a los catálogos por dominio; las etiquetas de cerrar de Dialog y Sheet ahora comparten `COMMON_UI_TEXT`.
- La plantilla, columnas y geometría de las planillas de entrega se repetían entre el generador local y el del servidor; ahora ambos consumen `BENEFICIARY_SHEET_PDF` y `BENEFICIARY_SHEET_COLUMN_HEADERS` desde `delivery.constant.ts`.
- La política `private, no-store` se repetía en handlers API. Ahora se deriva de `PRIVATE_RESPONSE_HEADERS`; los documentos usan `PRIVATE_DOCUMENT_RESPONSE_HEADERS`.
- Los permisos de navegación se escribían como strings sueltos y repetían claves administrativas. La navegación usa `ACCESS_CAPABILITY_KEYS` y `RESERVED_ACCESS_CAPABILITIES` desde el catálogo de permisos.
- Rutas de aplicación y endpoints tenían consumidores con literales locales. Se concentran en `routes.constant.ts`; el mapa de etiquetas sin consumidores fue eliminado.
- `config.constant.ts` exportaba variables de entorno innecesarias, incluida la URL de base de datos. Se eliminó; `application.config.ts` solo expone configuración no secreta.

## Clasificación de valores preservados

- Las fixtures y expectativas de `tests/` conservan valores independientes para que los contratos no se verifiquen comparando una constante consigo misma. Se revisaron como datos de prueba, no se incorporan a bundles de producción.
- Los literales requeridos por TypeScript/Next, nombres de campos de objetos, códigos de protocolo y contratos de enums permanecen en su capa técnica. No representan mensajes/catálogos de producto y no se envuelven en constantes artificiales.
- Valores de entorno sensibles, datos de usuario y resultados de consulta no se mueven a catálogos. Los arrays calculados a partir de estado/API permanecen en el servicio o componente que realiza el cálculo.

## Control para cambios futuros

`pnpm check:constants` escanea fuentes propias en `src`, `public` y `scripts`. Reporta textos JSX, atributos visibles, mensajes literales de errores, textos de metadatos y arrays candidatos a catálogos fuera de `src/constants`. No aplica una regla global a toda cadena entre comillas. Las pruebas mantienen sus fixtures fuera del scanner de producción y se revisan junto con sus contratos.

No quedan mensajes de error literales ni textos JSX sueltos detectados por el scanner. El alcance de auditoría restante queda sujeto al mismo comando y a revisión de nuevos valores estáticos en el diff.
