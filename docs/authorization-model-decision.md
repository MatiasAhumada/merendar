# ADR-001: Gobierno de roles y permisos

- Estado: recomendación técnica para COD-1455; pendiente de aceptación explícita de la organización.
- Alcance: preparar COD-1456 y COD-1457. No cambia accesos, cuentas, pantallas ni el esquema vigente.
- Contexto: COD-1420 y COD-1421 están finalizados; COD-1454 documenta las responsabilidades y los límites operativos.

## Contexto actual

Merendar tiene cinco roles persistidos como `UserRole`: `PRESIDENTE`, `SECRETARIA`, `TESORERIA`, `VOCALIA` y `REVISION_CUENTAS`. Cada usuario tiene un solo rol nullable; la autenticación rechaza cuentas sin rol. La tabla de sesiones no guarda el rol: cada consulta de sesión carga el usuario actual desde PostgreSQL. La creación y administración de cuentas, incluido el cambio de estado, está reservada a Presidencia y la desactivación revoca sus sesiones.

Los accesos operativos están definidos como listas de roles en servicios distintos, el dashboard, la navegación y los adaptadores de sincronización. Presidencia y Secretaría comparten el padrón, registro, mercadería y rendiciones; ambas ven las métricas operativas. Solo Presidencia administra usuarios. Tesorería, Vocalía y Revisión de cuentas pueden iniciar sesión, pero no reciben esos accesos ni métricas. Las rutas sensibles validan la sesión y el rol en servidor; las respuestas privadas usan `private, no-store`.

La aplicación no segmenta datos por persona, familia o período para estos permisos. Dar acceso operativo habilita los datos del módulo a escala de la organización. La matriz de [responsabilidades y accesos](role-access-matrix.md) distingue las funciones estatutarias de las tareas actualmente implementadas; no habilita por inferencia funciones financieras, firmas digitales ni aprobación general.

## Alternativas

| Alternativa | Implementación y mantenimiento | Simplicidad para Presidencia | Pruebas y trazabilidad | Usuarios, sesiones y offline |
|---|---|---|---|---|
| Roles y permisos estáticos en código | Menor costo inicial. Cada cambio de acceso requiere modificar, revisar, desplegar y probar código; la matriz se puede desincronizar de las rutas. | No requiere una pantalla de permisos, pero cada ajuste depende de Desarrollo. | Fácil de probar por rol si la política está centralizada; cambios y autoría quedan en Git, no como historial operativo. | Conserva `User.role`; sin migración de permisos. Un despliegue aplica los cambios al consultar de nuevo el rol. Una copia de app abierta offline no puede enterarse de una revocación. |
| Roles estables y capacidades configurables por rol | Costo inicial y de operación mayores: catálogo tipado, persistencia, administración, auditoría, validaciones y migración controlada. Mantiene el código como catálogo de acciones posibles. | Permite activar o quitar capacidades existentes para todo un rol; requiere una pantalla clara, límites protegidos y confirmación del impacto a sus integrantes. | Requiere probar la matriz completa, denegación por defecto, administración concurrente, revocación y límites de Presidencia. Un registro append-only puede identificar quién cambió cada rol y cuándo. | Se mantiene un rol único y se agregan asignaciones por rol. El siguiente acceso a servidor lee la política vigente; una sesión abierta no conserva permisos. Offline no permite comprobar revocaciones remotas y las sincronizaciones pendientes deben revalidarse. |
| Excepciones individuales o roles personalizados | Mayor costo y mantenimiento: combinaciones por usuario, precedencia, conflictos, más casos de prueba y soporte a medida. La política puede divergir de las responsabilidades documentadas. | Más flexible para casos puntuales, pero difícil de entender y auditar en equipos pequeños. | Exige definir precedencia entre rol y excepción, justificar cada excepción y revisar combinaciones por cuenta. | Requiere nueva asignación y migración de usuarios. Cambios por persona multiplican los casos de sesión y sincronización offline. |

## Recomendación para la siguiente implementación

Proponer roles estables con capacidades configurables por rol desde una fuente central en servidor. La propuesta responde al pedido de poder ampliar responsabilidades futuras con control de acceso; mantener el catálogo en código limita las opciones a acciones que el producto realmente implementa. La pantalla permitiría asignar capacidades existentes, no crear módulos, acciones ni permisos nuevos. Las excepciones por usuario, roles personalizados, herencia entre roles y múltiples roles quedan fuera de alcance mientras no exista una necesidad comprobada.

La organización todavía no aprobó que Presidencia edite capacidades. Pregunta pendiente: **¿La organización acepta que Presidencia pueda habilitar o quitar capacidades operativas existentes para cada uno de los cinco roles, con efecto para todas las personas que tengan ese rol, bajo las protecciones indelegables de esta ADR?** COD-1456 debe mantener la política estática vigente hasta que esta respuesta se registre; no interpretar esta recomendación como autorización.

### Matriz inicial propuesta

Las capacidades siguientes describen comportamiento ya implementado. Los nombres son contratos conceptuales para el ticket de implementación, no identificadores ya disponibles en código.

| Capacidad conceptual | Presidencia | Secretaría | Tesorería | Vocalía | Revisión de cuentas | Alcance actual |
|---|---:|---:|---:|---:|---:|---|
| `dashboard.metrics.read` | Sí | Sí | No | No | No | Métricas globales de padrón y cupos. |
| `families.read` / `families.write` | Sí | Sí | No | No | No | Padrón completo y datos identificatorios, sin segmentación por usuario. |
| `delivery.read` / `delivery.write` | Sí | Sí | No | No | No | Registro global de beneficiarios y planillas. |
| `merchandise.read` / `merchandise.write` | Sí | Sí | No | No | No | Solicitudes, cupos, remitos y comprobantes globales. |
| `renditions.read` / `renditions.write` / `renditions.review` | Sí | Sí | No | No | No | Rendiciones y archivos privados; revisión manual por Presidencia o Secretaría. |
| `users.manage` | Sí, indelegable | No | No | No | No | Alta, listado y estado de cuentas; reserva vigente de COD-1454. |
| `access-policy.manage` | Sí, indelegable | No | No | No | No | Cambiar capacidades por rol, si se acepta esta propuesta. |

Esta matriz refleja los permisos comprobables y la matriz COD-1454. Los permisos de Tesorería, Vocalía y Revisión de cuentas continúan denegados hasta que exista una tarea digital respaldada y una definición operativa explícita. El Estatuto no convierte los permisos operativos en facultades de firma, aprobación o pago; tampoco existe un módulo contable o de asociados en Merendar.

## Contrato de autorización recomendado

- Mantener `User.role` como asignación única y los cinco roles estables. Cambiar el rol de una persona cambia su pertenencia; cambiar la política de un rol afecta a todos sus integrantes. No admitir acumulación de permisos entre varios roles.
- Definir en código un catálogo cerrado y tipado de capacidades con acciones y alcance de datos explícitos. La base de datos puede conceder o retirar solo entradas de ese catálogo. No guardar nombres de permisos arbitrarios ni usar permisos como sustituto de validaciones de propiedad o relaciones de dominio.
- Resolver los permisos efectivos en un servicio central del servidor a partir de la identidad consultada y la política vigente. Páginas, handlers, servicios, descargas y sincronizaciones llaman esa política. La navegación solo refleja el resultado; ocultar un enlace o pasar por `proxy.ts` no autoriza una operación.
- Denegar por defecto roles, capacidades o asignaciones ausentes, desconocidos, incompatibles o retirados. Una capacidad nueva nace sin otorgamientos hasta que se evalúe y habilite expresamente. La retirada de una capacidad requiere una migración generada que retire su asignación; nunca reinterpretarla como otra capacidad.
- Mantener `users.manage` y `access-policy.manage` reservadas a Presidencia en una regla de servidor fuera de la tabla editable de capacidades. Rechazar cambios que dejen sin al menos una cuenta activa de Presidencia con ambas capacidades. Validar el conjunto completo antes de guardar una actualización atómica; no permitir que una solicitud del cliente indique su rol efectivo.
- Registrar las modificaciones de política en un historial append-only con actor, fecha y valores previos/nuevos por rol. No incluir contraseñas, tokens, documentos ni datos personales ajenos al cambio. La política y su historial deben guardarse en una misma transacción.
- Mantener sesiones de autenticación separadas de permisos. Toda operación protegida vuelve a consultar la sesión y la política desde la base de datos; respuestas y cargas privadas no se almacenan en cachés compartidas. Un cambio se aplica en la siguiente solicitud al servidor, sin requerir que el usuario vuelva a iniciar sesión.
- No habilitar acceso operativo autenticado offline. La interfaz solo puede conservar borradores capturados desde una vista abierta y sesión vigente. Al sincronizar, el servidor comprueba la misma cuenta activa, el rol y la capacidad vigentes. Si fueron revocados, rechaza la operación, mantiene el borrador aislado por cuenta y permite corregirlo luego de autenticarse; nunca lo reasigna a otra persona. Una revocación no puede propagarse mientras el dispositivo está desconectado.

## Migración conceptual

La implementación futura agregaría asignaciones persistidas de capacidad por rol, idealmente con clave compuesta rol-capacidad y una referencia al catálogo tipado. La política inicial debe reproducir exactamente la matriz de arriba; las tres cuentas operativas sin acceso no reciben nuevas capacidades. `User.role` permanece como está, las cuentas sin rol continúan sin autenticar y ninguna migración debe convertirlas automáticamente en Presidencia.

COD-1455 no modifica Prisma ni ejecuta migraciones. Si COD-1456 implementa la propuesta tras aceptación, debe generar y aplicar el esquema mediante `pnpm prisma migrate dev --name role_access_policies`, revisar el SQL generado y probar la matriz de datos iniciales en una base de desarrollo. No crear ni editar SQL de migración manualmente.

## Contrato de pruebas para COD-1456

1. Cada rol obtiene exactamente la matriz aprobada; capacidades desconocidas, faltantes y recién introducidas se deniegan.
2. La API y los servicios deniegan solicitudes directas sin permiso aunque la navegación o el cliente manipulen el rol. Anónimos reciben 401 y usuarios autenticados sin permiso reciben 403.
3. Solo Presidencia puede administrar usuarios y políticas. Ninguna capacidad editable concede esas acciones; rechazar autoelevación y cambios que dejen sin Presidencia administrable.
4. Un cambio de rol afecta únicamente a esa cuenta; un cambio de capacidades afecta a todos los usuarios del rol. Verificar persistencia, escritura atómica e historial con actor/fecha/antes/después.
5. Cambiar la política se refleja en la siguiente solicitud con sesión existente. Probar lectura de datos privados, descargas y todas las rutas de sincronización, incluido el rechazo de borradores cuando el permiso se revocó.
6. La migración conserva roles y sesiones vigentes, instala solo capacidades aprobadas y no produce acceso para roles sin asignación. Probar repetición de sincronización y recuperación del borrador con la misma cuenta.

## Fuentes del análisis

- Jira: COD-1420 (autenticación y sesión persistente), COD-1421 (cinco roles y administración exclusiva de Presidencia), COD-1454 (matriz de responsabilidades) y COD-1455 (alcance de esta decisión).
- Código: `prisma/schema.prisma`, `src/server/services/auth.service.ts`, `src/server/services/auth-session.ts`, `src/server/services/user.service.ts`, `src/server/services/dashboard-access.ts`, `src/server/services/family-access.ts`, `src/server/services/record-access.ts`, `src/server/services/merchandise-access.ts`, `src/server/services/*synchronization.service.ts`, `src/constants/navigation.constant.ts` y las rutas bajo `src/app/api/`.
- Documentación: [autenticación](authentication.md), [operación offline](offline.md), [registro y rendición](delivery.md), [mercadería](merchandise.md) y [matriz de roles](role-access-matrix.md).
