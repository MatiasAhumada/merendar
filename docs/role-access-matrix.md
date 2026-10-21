# Matriz provisional de responsabilidades y acceso

> Estado: borrador de trabajo, no aprobado por la organización. Se revisó la entrevista compartida por un integrante del grupo (archivo adjunto “Texto pegado.txt”). COD-1454 informa que las fotos del cliente todavía no están adjuntas. La entrevista aclara algunas tareas y roles, pero sus notas incluyen inferencias y no reemplazan la revisión de las fuentes originales. No habilitar permisos nuevos por suposición.

## Cómo leer la evidencia

- **Relatado en la entrevista compartida:** la transcripción de notas atribuye el dato a la entrevistada. Las interpretaciones del autor (“probablemente”, “sugiere”, “no queda claro”) no se consideran confirmación.
- **Confirmado en COD-1454:** requisito o restricción expresamente descrito en el ticket.
- **Comportamiento actual de la app:** capacidad comprobable en el código y documentación. No prueba por sí sola una aprobación de la organización.
- **Pendiente / propuesta:** decisión que requiere verificar fotos, fuentes originales o consultar a la organización. Una propuesta no concede permiso.

La entrevista indica que Presidencia y Secretaría hacen juntas el registro y la rendición. El proceso hoy es físico. La organización aún no registra donaciones de dinero. No se encontró una regla que segmente datos por persona, cargo o período. La matriz no amplía el acceso a datos personales, DNI, domicilios, firmas ni documentos privados por encima de las tareas confirmadas.

## Matriz por rol

| Rol | Responsabilidades respaldadas | Acceso actual en la app | Qué podría evaluarse | Estado / fuente |
|---|---|---|---|---|
| Presidencia | Preside la comisión. Hace junto con Secretaría el registro de donantes/entregas y completa planillas manuales. Participa del ciclo mensual: solicitar módulos, registrar entregas y rendir documentación a Desarrollo Social. | Inicio, Familias, Registro, Módulos y Usuarios. Puede consultar/mantener el padrón, registrar beneficiarios, emitir planillas, gestionar solicitudes/cupos/remitos/documentos y rendiciones. Solo Presidencia administra usuarios. | Mantener sus capacidades operativas actuales; confirmar con las fotos cuáles documentos prepara o revisa. Evaluar resúmenes de ciclos y búsqueda por fecha, porque hoy las planillas están separadas por fecha y cuesta reconstruir el historial. Cuidar el acceso a DNI, domicilio, firma y copias de documentos. | Responsabilidades y proceso: entrevista compartida, preguntas “¿Tienen roles definidos…?”, “Pasos administrativos…”, “¿Quién registra…?”, “¿Con qué frecuencia…?”. Administración exclusiva y flujo de planilla manual: COD-1454, alcance/aceptación 5. Acceso técnico: `src/constants/navigation.constant.ts`, `src/constants/dashboard.constant.ts`, `docs/delivery.md`, `docs/merchandise.md`. |
| Secretaría | Es secretaria de la asociación. Hace junto con Presidencia el registro de donantes/entregas y completa las planillas físicas. Participa del proceso mensual y de la rendición al día siguiente de cada entrega. | Inicio, Familias, Registro y Módulos. Comparte las capacidades operativas actuales de Presidencia; no puede administrar usuarios. | Mantener el acceso operativo compartido y validar las acciones contra las fotos. Evaluar búsqueda/historial por fecha y el caso de la planilla separada del merendero. Definir quién prepara cada documento y quién realiza la revisión interna. | Entrevista compartida, mismas preguntas citadas para Presidencia. La entrevista no atribuye administración de usuarios a Secretaría; COD-1454 conserva la exclusividad en Presidencia. Comportamiento técnico: `src/constants/navigation.constant.ts`, `docs/delivery.md`, `docs/merchandise.md`. |
| Tesorería | La entrevista confirma que hay un tesorero. A la fecha de la entrevista no han recibido donaciones de dinero ni emitido recibos electrónicos. Un eventual proceso con AFIP, contador y Banco Nación es futuro e hipotético. | Puede iniciar sesión y llegar a Inicio, sin métricas ni accesos operativos. No existe módulo financiero o de recibos. | Mantener sin acceso financiero mientras no exista una tarea vigente. Si comienzan a recibir dinero, primero definir proceso, responsabilidad, datos, contador/Banco Nación y obligaciones aplicables; después evaluar un módulo específico y de mínimo acceso. No dar acceso a datos de beneficiarios o a rendiciones de mercadería por el cargo. | Existencia del rol y ausencia actual de flujo financiero: entrevista compartida, “¿Tienen roles definidos…?”, “¿Qué tipos de donaciones reciben?” y “Pasos administrativos…”. La entrevistada declara que nunca recibieron dinero y que el trámite futuro no se hizo. Acceso técnico actual: `prisma/schema.prisma`, `src/constants/navigation.constant.ts`, `src/server/services/dashboard-access.ts`. |
| Vocalía | La entrevista confirma que hay vocales, pero no describe sus responsabilidades, tareas ni datos necesarios. | Puede iniciar sesión y llegar a Inicio, sin métricas ni accesos operativos. | Consultar a la organización qué tareas concretas realiza Vocalía y si requieren lectura o escritura. Habilitar solo la vista y los datos necesarios después de documentar una tarea. No heredar permisos por jerarquía. | Entrevista compartida, “¿Tienen roles definidos, o todos hacen un poco de todo?”: menciona vocales sin detallar funciones. COD-1454 prohíbe asumir herencia de permisos. Acceso técnico: `src/constants/navigation.constant.ts`, `src/constants/dashboard.constant.ts`. |
| Revisión de cuentas | La entrevista dice que la persona/función de Revisión de cuentas “las controla”. No identifica con precisión qué controla, qué documentos revisa, cuándo interviene ni qué resultado produce. Se llevan libro de actas y balance en papel; la posible relación con una revisión interna/IGJ aparece en las notas como “probablemente”, así que no se toma como hecho confirmado. | Puede iniciar sesión y llegar a Inicio, sin métricas ni accesos operativos. No existe vista dedicada de auditoría. La revisión de rendiciones de la app está habilitada actualmente para Presidencia y Secretaría. | Confirmar qué significa “las controla” y qué evidencia requiere. Podría evaluarse una consulta de solo lectura, limitada a la rendición mensual y documentos que la organización autorice, con datos personales minimizados. Definir si deja observaciones, quién las resuelve y si existe alguna aprobación separada. No habilitar modificación ni aprobación general por el nombre del cargo. | Entrevista compartida, preguntas “¿Tienen roles definidos…?”, “¿Con qué frecuencia revisan…?” y “¿Qué deben rendir…?”. La frecuencia de revisión interna y el alcance no están definidos. COD-1454 prohíbe equiparar revisión de cuentas con aprobación de todo el sistema. Acceso técnico: `docs/delivery.md`, `src/constants/navigation.constant.ts`. |

## Flujo operativo común a Presidencia y Secretaría

La entrevista describe un ciclo mensual de mercadería y una planilla por fecha, además de otra planilla para el merendero:

1. Solicitan módulos a Desarrollo Social mediante una nota.
2. Avisan a las personas anotadas el día de entrega; hoy el aviso se hace manualmente en un grupo (la plataforma no queda identificada en la transcripción).
3. La persona retira mercadería con fotocopia de su documento.
4. Presidencia y Secretaría completan una planilla física con nombre, apellido, dirección y firma por persona.
5. Al día siguiente presentan la planilla y las fotocopias como rendición.
6. Desarrollo Social las contacta para retirar el remito y la mercadería; luego vuelve a comenzar el ciclo.

La app ya permite registrar beneficiarios por período, evita duplicar el mismo beneficiario dentro del período, emite planillas PDF versionadas y conserva rendiciones/documentos privados. La planilla que genera la app es propia de Merendar, no el formulario oficial ministerial. Antes de reemplazar el papel que exige Desarrollo Social, verificar formato, campos y aceptación del organismo con las fotos/documentos. No hay una solicitud explícita de estadísticas o notificaciones automáticas.

## Modalidad de uso, datos y operación sin conexión

- La entrevistada usa teléfono y está abierta a computadora. La experiencia debería seguir siendo usable en ambos tamaños; esta necesidad no aprueba permisos nuevos.
- La entrevista reporta que no hay Wi-Fi estable y usan conexión celular. El proyecto admite borradores offline en algunas vistas ya abiertas con sesión vigente; no permite iniciar sesión offline ni recuperar vistas privadas después de recargar. La sincronización exige servidor.
- Las planillas contienen nombre, apellido, domicilio, firma y fotocopia del DNI. Son datos personales sensibles para el flujo: limitar cada permiso a la tarea confirmada, proteger los PDF y evitar conceder acceso general por cargo.
- La organización lleva libro de actas y balance físicos. No hay función implementada para administrarlos. No presentarlos como cubiertos por los módulos actuales.
- No se mencionan donaciones habituales de empresas o personas. La ayuda humanitaria internacional aparece como gestión todavía no conseguida; no derivar permisos actuales de esas iniciativas.

## Inicio de sesión, navegación y estado sin acceso

- Los cinco roles existen en el modelo. Las cuentas activas inician sesión y llegan a Inicio (`/`).
- Presidencia y Secretaría ven métricas y accesos implementados a Familias, Registro y Módulos. Solo Presidencia ve Usuarios. Las operaciones privadas vuelven a validar sesión y rol en servidor; un enlace visible no concede autorización.
- Tesorería, Vocalía y Revisión de cuentas llegan a Inicio, que muestra que el resumen operativo y las acciones no están habilitados para su rol. No tienen datos de otros roles.
- Sin sesión, las rutas privadas redirigen a Login. Sin conexión no se abre una sesión nueva ni se recuperan vistas privadas tras recargar.
- Las fuentes no definen un destino inicial distinto para cada rol. Mantener Inicio hasta que la organización indique otro recorrido.

Fuentes técnicas: `src/app/login/page.tsx`, `src/app/(app)/page.tsx`, `src/constants/navigation.constant.ts`, `src/constants/dashboard.constant.ts`, `src/server/services/dashboard-access.ts`, `docs/authentication.md`, `docs/offline.md`.

## Decisiones aún necesarias

1. Revisar las fotos del cliente anunciadas en COD-1454; registrar archivo y página/foto de cada atribución y anotar las partes ilegibles. La entrevista compartida no reemplaza este criterio de aceptación.
2. Confirmar si las notas de entrevista reflejan literalmente las respuestas; identificar qué observaciones son del entrevistador y cuáles de la entrevistada.
3. Preguntar a Revisión de cuentas qué controles realiza, sobre qué documentos, con qué periodicidad y si solo observa o también aprueba algo específico.
4. Preguntar a Vocalía por sus tareas concretas. No deducirlas de la pertenencia a la comisión.
5. Mantener Tesorería sin flujo financiero hasta que la asociación efectivamente incorpore donaciones monetarias y defina su proceso con asesoramiento correspondiente.
6. Confirmar que el PDF de Merendar cumple el formato exigido por Desarrollo Social; aclarar la planilla separada del merendero y las copias de DNI.
7. Definir lectura, escritura, descarga/carga de PDF, datos mínimos y límites por período para cada rol antes de modificar controles de acceso.

## Estado de aceptación

La entrevista compartida permite atribuir a Presidencia y Secretaría el trabajo conjunto de registro y rendición; confirma la existencia de Tesorería, Vocalía y Revisión de cuentas, y aporta contexto operativo. La matriz todavía es provisional: falta revisar las fotos del cliente y resolver el alcance del control de Revisión de cuentas y las funciones de Vocalía. Las funciones financieras futuras no se habilitan por anticipado. COD-1454 no debe considerarse completo hasta atender sus criterios pendientes y documentar las decisiones resultantes.
