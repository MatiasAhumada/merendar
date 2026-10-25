# Regresión online/offline de COD-1478

Esta matriz separa los contratos del servidor, la regresión automatizada de navegador y el smoke del despliegue. Un test de integración de API no se considera prueba de navegador. Los casos sin evidencia ejecutada permanecen pendientes.

## Cobertura por ruta, acción y rol

| Ruta / acción | Presidencia | Secretaría | Tesorería | Vocalía | Revisión de cuentas | Evidencia automatizada |
|---|---|---|---|---|---|---|
| `/login`, sesión, expiración y cierre | Iniciar sesión | Iniciar sesión | Iniciar sesión | Iniciar sesión | Iniciar sesión | `auth.integration.test.ts` cubre sesión válida, persistencia, expiración, CSRF y revocación. `offline-regression.spec.ts` crea sesión válida de 12 h aislada por rol; no escribe credenciales en el navegador. Login interactivo, cierre de sesión y TTL visual se cubren solo parcialmente. |
| `/`, métricas y acciones | Métricas y acciones autorizadas | Métricas y acciones autorizadas | Sin métricas ni acciones operativas | Sin métricas ni acciones operativas | Sin métricas ni acciones operativas | `dashboard.integration.test.ts` verifica datos y permisos; la regresión de navegador confirma encabezado, resumen/acciones autorizadas y ausencia de accesos para los cinco roles. |
| `/familias`, lectura, búsqueda, alta, cambios e integrantes | Leer y modificar | Leer y modificar | Denegado | Denegado | Denegado | `families.integration.test.ts` valida API y roles; `offline-regression.spec.ts` verifica alta online visible sin recarga, ficha inicial y unicidad tras refresh; también alta/edición de integrante y baja lógica de familia confirmada, con cola durable y sincronización idempotente desde el shell offline. Cambios de encabezado de familia y búsqueda tras pérdida de red siguen cubiertos solo en línea/API. |
| `/entrega`, beneficiarios y planillas PDF | Leer y registrar | Leer y registrar | Denegado | Denegado | Denegado | `records.integration.test.ts` verifica sincronización, duplicados, instantánea imprimible, descarga e integridad PDF. `offline-regression.spec.ts` crea un registro sin conexión, emite un PDF local, reconecta, valida el PDF oficial y ambos recibos idempotentes en móvil y escritorio. |
| `/mercaderia`, períodos, solicitudes, cupos, remitos y comprobantes | Leer y modificar | Leer y modificar | Denegado | Denegado | Denegado | `merchandise.integration.test.ts` cubre persistencia, relaciones, documentos y sincronización; `offline-regression.spec.ts` crea la cadena período/solicitud/cupo/remito en navegador offline y valida recibos e idempotencia en móvil y escritorio. |
| `/mercaderia`, rendiciones y documentos privados | Leer, cargar y revisar | Leer, cargar y revisar | Denegado | Denegado | Denegado | `renditions.integration.test.ts` cubre PDF, versionado, revisión, sincronización y denegación de descarga. `offline-regression.spec.ts` carga un PDF sintético offline y valida bytes, persistencia y recibo al reconectar, en móvil y escritorio. |
| `/usuarios`, lectura y administración de cuentas | Leer y administrar | Denegado | Denegado | Denegado | Denegado | La regresión de navegador valida que los accesos de administración solo aparecen para Presidencia; la matriz de política verifica denegaciones y `access-policy.integration.test.ts` prueba persistencia/auditoría. CRUD de `/api/users` no tiene suite de integración dedicada ni recorrido browser. |
| `/permisos`, lectura y configuración de capacidades | Leer y administrar | Denegado | Denegado | Denegado | Denegado | `access-policy.integration.test.ts` prueba autorización, persistencia, efecto inmediato y auditoría. La regresión de navegador valida el acceso por rol y que la ruta publicada cargue; cambio de permisos offline no está habilitado ni probado. |
| Shell offline, snapshots y Cache Storage | Snapshot solo para capacidades vigentes | Snapshot solo para capacidades vigentes | Solo `/` sin métricas | Solo `/` sin métricas | Solo `/` sin métricas | `offline-contract.integration.test.ts` y `service-worker-offline.integration.test.ts` validan contrato y exclusión de caché. `offline-regression.spec.ts` corta la red del navegador, recarga `/familias`, comprueba Cache Storage y cambia a una segunda cuenta sin exponer el snapshot anterior. |

La matriz de negocio y las capacidades exactas están en [offline-parity-matrix.md](offline-parity-matrix.md) y [role-access-matrix.md](role-access-matrix.md). Las capacidades administrativas de Usuarios y Permisos son exclusivas de Presidencia incluso si una política editable cambia.

## Casos de navegador cubiertos

`ALLOW_BROWSER_TESTS=true pnpm test:e2e` corre contra `pnpm start` con Chrome, en 390×844 y 1440×900. Requiere Chrome instalado o `CHROME_EXECUTABLE_PATH` y una base local de desarrollo configurada en `DATABASE_URL`. Crea usuarios y sesiones aleatorios únicamente si la base es local y su nombre contiene `dev`, `test` o `local`, elimina las cuentas creadas al finalizar y no cambia políticas ni esquema.

Los cuatro casos revisan la matriz visible de los cinco roles; verifican que rutas/API privadas no aparezcan en Cache Storage; bloquean la conexión del contexto de navegador; navegan directamente a Familias; recargan la vista y cambian la sesión a Tesorería en el mismo almacenamiento local para comprobar aislamiento; crean una familia online y confirman que aparece sin F5, que su ficha refleja el integrante y que el refresh no duplica; crean una familia y agregan integrante sin conexión; comprueban la cola tras recargar, el orden de dependencia, la sincronización y que repetir el ciclo no duplique registros. Cada ejecución adjunta proyecto, versión del navegador, viewport, commit informado y, para aislamiento, una captura local sintética; Playwright conserva traza/captura en fallos.

Las pruebas existentes de integración cubren sesión, expiración/revocación, autorización por rol, sincronización idempotente, dependencias, conflictos, rechazo por permisos, versión de PDFs, preparación y separación de datos. La red real de navegador se corta para lectura y CRUD de Familias, no para cada formulario. Siguen pendientes pruebas browser específicas de pérdida a mitad de cada guardado, reintentos ante respuesta incierta por formulario, instalación PWA en dispositivo, caducidad visual/logout en modo offline, cuota de almacenamiento, conflicto concurrente en interfaz y CRUD offline de Registro, Mercadería y Rendiciones. No se usaron datos reales para forzar fallos ni escribir en el despliegue.

## Registro del smoke publicado

Registrar en el informe de ejecución antes de cerrar el ticket:

- URL y fecha/hora del despliegue;
- navegador y versión;
- SHA del commit desplegado;
- rol/cuenta de prueba, sin incluir credenciales;
- rutas y acciones ejecutadas;
- resultados y evidencia clasificados como **confirmados**, **reportados** o **no probados**.

La navegación local con fixtures no verifica el despliegue. El smoke publicado debe realizarse con una cuenta autorizada que contenga únicamente datos de prueba; no generar cambios CRUD en el despliegue sin coordinar antes esos datos.

### Ejecución observada el 2026-10-23

- URL: `https://merendar.matiasahumada.online`; cuenta de prueba con rol Presidencia, sin guardar credenciales.
- Confirmado: sesión de Presidencia ya autenticada; navegación directa y carga asentada de `/`, `/familias`, `/entrega`, `/mercaderia`, `/usuarios` y `/permisos`; Preparar offline deja visible una preparación vigente. No quedaron rótulos “Cargando” ni errores/advertencias de consola. Solo lectura, sin alterar datos del despliegue.
- No probado en el despliegue: cortar la red, modificar CRUD, PWA instalada, sesión de otros roles, PDF y expiración/logout. La pestaña integrada no expone control de red por pestaña. No se capturó ni guardó contenido del padrón.
- Navegador de la pestaña integrada y SHA de la versión desplegada: la interfaz no los expone; no se infieren. En local, Playwright usó Google Chrome 156.0.8078.47.
- Evidencia local: `pnpm lint`, `pnpm build`, `pnpm test:integration` (20/20) y Playwright (8/8: móvil/escritorio, cuatro casos por viewport). Los adjuntos de Playwright identifican versión local, viewport y SHA de ejecución.

### Ejecución observada el 2026-10-25

- Entorno local: `merendar_dev` en `localhost`; no se modificó el despliegue publicado. `pnpm start --port 3026` permaneció activo y `/login` respondió HTTP 200.
- Confirmado en el navegador integrado del chat: la pantalla pública de acceso carga, presenta el formulario y comunica que validar la sesión requiere conexión. No se inició sesión porque esta ejecución no usó una cuenta sintética en ese navegador.
- Confirmado localmente: `pnpm lint` y `pnpm build` terminaron sin errores ni warnings. La integración terminó 20/20. Playwright Chromium terminó 14 pasadas y 2 omitidas en 48.9 s; las dos omisiones corresponden a escenarios de navegación de escritorio configurados solo para desktop, no a fallos.
- La regresión de navegador repitió la matriz visible de cinco roles, preparación automática desde `/familias`, pérdida de red/recarga, exclusión de datos privados de Cache Storage, aislamiento por cuenta, altas y bajas de familias, y sincronización offline de familia + integrante con ambos recibos idempotentes. Se ejecutó en viewports de 390×844 y 1440×900.
- La primera pasada reveló que el fixture de la prueba de baja lógica guardaba un snapshot de planilla inválido y provocaba respuestas HTTP 500 al preparar su PDF. Se completó el fixture con el contrato vigente y el test ahora espera la preparación y falla si la descarga devuelve un error. La repetición completa pasó y no registró respuestas fallidas de `/api/records/sheets/`.
- No probado en esta ejecución: conflicto concurrente visual, cuota de almacenamiento, expiración/logout offline, instalación PWA, pérdida de red a mitad de guardados, respuesta incierta por formulario y smoke autenticado del despliegue publicado. Esos criterios continúan abiertos.

### Revalidación de flujos offline el 2026-10-25

- Confirmado en el navegador integrado del chat, contra `localhost`: autenticación con la cuenta de prueba autorizada, preparación automática de vistas, carga de datos sintéticos de familia, período, solicitud, cupo, remito, registro y emisión de planilla. Los datos creados manualmente se eliminaron al finalizar.
- La preparación automática ya no interpreta los IDs de solicitud, cupo o remito como identificadores de planillas PDF. La vista offline sincroniza operaciones pendientes elegibles al volver la conexión; errores y conflictos quedan fuera del reintento automático.
- `pnpm lint` terminó sin errores ni warnings; `pnpm test:integration` pasó 20/20. `ALLOW_BROWSER_TESTS=true pnpm test:e2e` pasó 22 pruebas y omitió 2 en Chromium: 390×844 y 1440×900. Las omisiones son los dos casos de navegación desktop que solo aplican a ese viewport.
- En la repetición completa más reciente, `ALLOW_BROWSER_TESTS=true pnpm test:e2e` pasó 28 pruebas y omitió 2 en Chromium (30 casos considerados), en 390×844 y 1440×900. Las omisiones son los dos casos de navegación configurados solo para escritorio; no son fallos.
- La regresión browser validó preparación de mercadería con datos relacionados, CRUD offline de período/solicitud/cupo/remito, carga offline de PDF de rendición, alta offline de beneficiario, generación de borrador PDF local, sincronización automática y recibos idempotentes. También agregó y editó integrantes de familias previamente confirmadas y dio de baja una familia sintética tras navegar a la ruta offline desde el Service Worker; verificó persistencia e idempotencia. Cada caso creó y limpió datos sintéticos.
- Con las seis variables de seguridad de integración configuradas para su suite correspondiente (`ALLOW_ACCESS_POLICY_INTEGRATION_TESTS`, `ALLOW_AUTH_INTEGRATION_TESTS`, `ALLOW_DASHBOARD_INTEGRATION_TESTS`, `ALLOW_FAMILY_INTEGRATION_TESTS`, `ALLOW_SYNC_INTEGRATION_TESTS`, `ALLOW_RENDITION_INTEGRATION_TESTS`), `pnpm test:integration` pasó 20/20. Los logs 401/403, conflictos y deadlocks corresponden a escenarios negativos/de concurrencia que los tests esperan.
- `pnpm build` terminó correctamente para los cambios de producción; después se reinició `pnpm start --port 3026` y `/login` respondió HTTP 200. El navegador integrado del chat quedó autenticado localmente con la cuenta de prueba autorizada y, tras recargar, mostró el estado vacío esperado (0 períodos), sin dejar datos sintéticos.
- Smoke inicial de staging previo a este commit: el login autorizado `test/test` funciona y `/` carga, pero todavía muestra el botón manual «Preparar offline», por lo que no contiene la versión local con preparación automática. Se observaron 4 familias en el resumen y no se modificó ninguna.
- Sin cambios de esquema ni migraciones. El despliegue publicado no se modificó; la regresión CRUD se ejecutó contra la base local de desarrollo.

### Revalidación posterior y smoke de staging el 2026-10-25

- `pnpm lint` y `pnpm build` terminaron sin errores ni warnings. `ALLOW_BROWSER_TESTS=true pnpm exec playwright test` pasó 30 casos y omitió 2 pruebas restringidas a desktop, en Chromium 390×844 y 1440×900. Incluye preparación desde ruta profunda, corte de conexión y recarga, aislamiento entre cuentas, recuperación de caché offline desactualizada, familias, mercadería, rendiciones y PDFs sintéticos.
- Las seis suites de integración pasaron 22/22 con las variables de seguridad correspondientes y la concurrencia serial. La ejecución paralela inicial provocó un deadlock local entre pruebas que comparten base; `test:integration` ahora fuerza concurrencia 1 para que el comando normal sea estable.
- Un test desktop de rendición aceptaba el nombre del archivo todavía seleccionado antes de que terminara el guardado asíncrono. Ahora espera la fila específica bajo “Documentación recibida”; la matriz completa volvió a pasar.
- En el navegador integrado, staging permanece autenticado como Presidencia en `/mercaderia`. La pantalla muestra “No se completó la preparación automática” y `Request failed with status code 404`. No se hicieron escrituras ni cambios en sus datos. El navegador no expone versión ni SHA desplegado; ambos quedan sin confirmar.
- Se probó el flujo de conflicto concurrente en navegador local; el endpoint respondió 409 pero no se pudo observar el panel de resolución completo. La revisión de conflictos visual y la elección entre versión local/servidor siguen pendientes, junto con cuota, expiración/logout offline, instalación PWA, interrupción durante cada guardado y respuesta incierta.
- El usuario autorizó usar y limpiar datos sintéticos en staging con la cuenta de Presidencia `test/test`. No se cargaron datos allí porque la preparación automática aún devuelve 404. Repetir smoke online/offline y CRUD sintético después de desplegar el commit que actualiza el Service Worker.
- No se cambiaron `schema.prisma` ni migraciones.

### Pendientes para declarar completa toda la matriz

- COD-1479: el alta online sintética sí aparece inmediatamente y conserva una sola familia tras refresh; no se reprodujo esa parte del reporte. El alta de familia e integrante offline sí se probó tras reload y reconexión. Fallos de refresh forzados y DTO de respuestas de edición quedan pendientes.
- El test de staging con escrituras sintéticas está autorizado, pero espera a que `/mercaderia` complete la preparación automática en vez de devolver 404.
- Siguen pendientes el conflicto concurrente visual y resolución, cuota de almacenamiento, expiración/logout offline, instalación PWA, pérdida de red en mitad de cada guardado, reintento visual por respuesta incierta y CRUD browser offline de edición y baja de registros previamente sincronizados. También falta el smoke de la versión actual en staging y registrar el SHA desplegado.
- Los seguimientos COD-1480 (reglas de DNI/contacto), COD-1483 (modelo/logo oficial) y COD-1484 (baja de personas y relaciones) requieren definición de dominio explícita; no se inventaron decisiones.
- COD-1481, COD-1482 y COD-1485 deben seguir con sus propios criterios y evidencia; este cambio no los cierra.
