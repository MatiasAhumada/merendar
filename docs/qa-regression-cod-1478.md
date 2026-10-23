# Regresión online/offline de COD-1478

Esta matriz separa los contratos del servidor, la regresión automatizada de navegador y el smoke del despliegue. Un test de integración de API no se considera prueba de navegador. Los casos sin evidencia ejecutada permanecen pendientes.

## Cobertura por ruta, acción y rol

| Ruta / acción | Presidencia | Secretaría | Tesorería | Vocalía | Revisión de cuentas | Evidencia automatizada |
|---|---|---|---|---|---|---|
| `/login`, sesión, expiración y cierre | Iniciar sesión | Iniciar sesión | Iniciar sesión | Iniciar sesión | Iniciar sesión | `auth.integration.test.ts` cubre sesión válida, persistencia, expiración, CSRF y revocación. `offline-regression.spec.ts` crea sesión válida de 12 h aislada por rol; no escribe credenciales en el navegador. Login interactivo, cierre de sesión y TTL visual se cubren solo parcialmente. |
| `/`, métricas y acciones | Métricas y acciones autorizadas | Métricas y acciones autorizadas | Sin métricas ni acciones operativas | Sin métricas ni acciones operativas | Sin métricas ni acciones operativas | `dashboard.integration.test.ts` verifica datos y permisos; la regresión de navegador confirma encabezado, resumen/acciones autorizadas y ausencia de accesos para los cinco roles. |
| `/familias`, lectura, búsqueda, alta, cambios e integrantes | Leer y modificar | Leer y modificar | Denegado | Denegado | Denegado | `families.integration.test.ts` valida API y roles; `offline-regression.spec.ts` verifica familia e integrante creados sin red, cola durable tras recarga, dependencia padre/hijo y sincronización idempotente. Cambios a familias ya sincronizadas y búsqueda siguen cubiertos solo en línea/API. |
| `/entrega`, beneficiarios y planillas PDF | Leer y registrar | Leer y registrar | Denegado | Denegado | Denegado | `records.integration.test.ts` verifica sincronización, duplicados, instantánea imprimible, descarga e integridad PDF. La regresión de navegador comprueba rol y carga de ruta; alta/emisión offline y descarga del PDF en navegador quedan pendientes. |
| `/mercaderia`, períodos, solicitudes, cupos, remitos y comprobantes | Leer y modificar | Leer y modificar | Denegado | Denegado | Denegado | `merchandise.integration.test.ts` cubre persistencia, relaciones, documentos y sincronización; la regresión de navegador comprueba rol y carga de ruta, no CRUD offline de extremo a extremo. |
| `/mercaderia`, rendiciones y documentos privados | Leer, cargar y revisar | Leer, cargar y revisar | Denegado | Denegado | Denegado | `renditions.integration.test.ts` cubre PDF, versionado, revisión, sincronización y denegación de descarga. La regresión de navegador no abre ni carga documentos privados offline. |
| `/usuarios`, lectura y administración de cuentas | Leer y administrar | Denegado | Denegado | Denegado | Denegado | La regresión de navegador valida que los accesos de administración solo aparecen para Presidencia; la matriz de política verifica denegaciones y `access-policy.integration.test.ts` prueba persistencia/auditoría. CRUD de `/api/users` no tiene suite de integración dedicada ni recorrido browser. |
| `/permisos`, lectura y configuración de capacidades | Leer y administrar | Denegado | Denegado | Denegado | Denegado | `access-policy.integration.test.ts` prueba autorización, persistencia, efecto inmediato y auditoría. La regresión de navegador valida el acceso por rol y que la ruta publicada cargue; cambio de permisos offline no está habilitado ni probado. |
| Shell offline, snapshots y Cache Storage | Snapshot solo para capacidades vigentes | Snapshot solo para capacidades vigentes | Solo `/` sin métricas | Solo `/` sin métricas | Solo `/` sin métricas | `offline-contract.integration.test.ts` y `service-worker-offline.integration.test.ts` validan contrato y exclusión de caché. `offline-regression.spec.ts` corta la red del navegador, recarga `/familias`, comprueba Cache Storage y cambia a una segunda cuenta sin exponer el snapshot anterior. |

La matriz de negocio y las capacidades exactas están en [offline-parity-matrix.md](offline-parity-matrix.md) y [role-access-matrix.md](role-access-matrix.md). Las capacidades administrativas de Usuarios y Permisos son exclusivas de Presidencia incluso si una política editable cambia.

## Casos de navegador cubiertos

`ALLOW_BROWSER_TESTS=true pnpm test:e2e` corre contra `pnpm start` con Chrome, en 390×844 y 1440×900. Requiere Chrome instalado o `CHROME_EXECUTABLE_PATH` y una base local de desarrollo configurada en `DATABASE_URL`. Crea usuarios y sesiones aleatorios únicamente si la base es local y su nombre contiene `dev`, `test` o `local`, elimina las cuentas creadas al finalizar y no cambia políticas ni esquema.

Los tres casos preparan vistas y revisan la matriz visible de los cinco roles; verifican que rutas/API privadas no aparezcan en Cache Storage; bloquean la conexión del contexto de navegador; navegan directamente a Familias; recargan la vista y cambian la sesión a Tesorería en el mismo almacenamiento local para comprobar aislamiento; crean una familia y agregan integrante sin conexión; comprueban la cola tras recargar, el orden de dependencia, la sincronización y que repetir el ciclo no duplique registros. Cada ejecución adjunta proyecto, versión del navegador, viewport, commit informado y, para aislamiento, una captura local sintética; Playwright conserva traza/captura en fallos.

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
- Evidencia local: `pnpm lint`, `pnpm build`, `pnpm test:integration` (20/20) y Playwright (6/6: móvil/escritorio, tres casos por viewport). Los adjuntos de Playwright identifican versión local, viewport y SHA de ejecución.

### Pendientes para declarar completa toda la matriz

- La base de prueba publicada contiene información que no se debe modificar sin datos sintéticos aislados; por ello CRUD offline, conflictos, expiración y permisos de otros roles quedan sin probar allí.
- La matriz de capacidades de `delivery`, `merchandise`, `renditions` y `/usuarios` está cubierta por pruebas de integración pero no por recorridos browser completos de todos los CRUD.
- Los seguimientos COD-1480 (reglas de DNI/contacto), COD-1483 (modelo/logo oficial) y COD-1484 (baja de personas y relaciones) requieren definición de dominio explícita; no se inventaron decisiones.
- COD-1479, COD-1481, COD-1482 y COD-1485 deben seguir con sus propios criterios y evidencia; este cambio no los cierra.
