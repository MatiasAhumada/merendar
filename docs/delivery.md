# Registro de beneficiarios y planillas

`/entrega` registra una entrega por persona y período de mercadería. Presidencia y secretaría pueden registrar la fecha, tipo y cantidad del módulo, observaciones y comprobaciones del DNI y otros documentos. El servidor comprueba el rol, el período, la pertenencia de la persona al grupo familiar y que esa persona todavía no figure registrada en el período.

El formulario guarda cada alta en la cola offline por UUID. En línea, el adaptador guarda el registro y el recibo de sincronización en una transacción; repetir la misma operación devuelve el resultado idempotente. Registrar nuevamente a la misma persona en el mismo período produce un conflicto, incluso si se envía con otro UUID.

La vista Registro preparada mantiene períodos, padrón, entregas y referencias de planillas en IndexedDB por cuenta. Puede guardar una entrega para sincronizarla después y generar un PDF local de beneficiarios para imprimir. El documento local se identifica como borrador sin versión oficial y conserva el UUID y los beneficiarios usados para imprimir; la sincronización valida permisos, período, pertenencia y DNI antes de crear la versión oficial, sin sustituir el archivo local. Las planillas oficiales ya preparadas también se descargan sin conexión. Un DNI faltante bloquea solo la generación de la planilla y dirige a corregir el padrón; no impide leer o registrar a la persona.

La planilla se genera con un conjunto seleccionado del padrón, sin requerir una entrega confirmada ni una rendición. Cada emisión conserva una versión y una instantánea de los datos identificatorios en `BeneficiarySheet`; emitir una versión nueva no modifica las anteriores. Las nuevas instantáneas usan la plantilla aprobada de entrega de módulos: logo del Ministerio de Desarrollo Social y Gobierno de Tucumán, título y columnas para apellido y nombre, DNI, dirección, barrio, fecha de entrega y firma. La fecha queda en blanco para completarse a mano, de acuerdo con el modelo; este flujo no registra ni confirma la entrega. El PDF repite el encabezado en cada página y conserva filas manuscritas libres. El logo público se prepara también en el caché del service worker para la generación local sin conexión. El endpoint de descarga vuelve a generar el PDF desde la instantánea, usa fuentes DejaVu con licencia incluida, conserva acentos, no se cachea y exige autorización del servidor. Las instantáneas anteriores a la plantilla aprobada mantienen su diseño anterior al volver a descargarse.

Las firmas son manuscritas en el papel. La app no captura, valida ni guarda trazos biométricos. COD-1429 puede asociar la evidencia escaneada a la referencia de la planilla emitida.

## Rendición documental

Cada planilla emitida puede tener una rendición asociada por su versión inmutable. Los PDF de planillas firmadas, remitos y respaldos se guardan en `RenditionDocument`, fuera de recursos públicos. La carga admite hasta cinco archivos PDF por envío, 512 KiB por archivo, 700 KiB por envío y veinte documentos por rendición; estos límites están centralizados en `src/constants/rendition.constant.ts`. La API verifica extensión, MIME declarado, firma `%PDF-` y marcador final `%%EOF` antes de persistir.

Una corrección selecciona el documento anterior explícitamente; ambas versiones permanecen disponibles y la nueva carga vuelve la rendición al estado pendiente de revisión. La previsualización y descarga requieren una sesión autorizada y respuestas `private, no-store`. Solo presidencia y secretaría conservan las funciones confirmadas para registrar y revisar documentación mientras COD-1454/COD-1456 no definan una matriz aprobada.

Las cargas offline se guardan en IndexedDB separado por usuario y versión, junto con el PDF y la referencia de planilla. No se anuncian como guardadas en el servidor hasta que la sincronización responda correctamente. No existe acción de cierre o presentación oficial: la revisión es manual y no confirma firmas ni validez ante el organismo.

La vista offline de Módulos y rendiciones lee períodos, planillas y PDF preparados desde IndexedDB, sin pedir esos documentos al servidor al abrirlos. Una revisión iniciada sin red queda pendiente en la cola de la cuenta y se confirma únicamente después de validar la sesión, el permiso actual y la planilla firmada vigente en el servidor.

El esquema de rendiciones se genera con `pnpm prisma migrate dev --name rendition_documents`; no editar el SQL de migración manualmente.

Los cambios de esquema se generan y aplican únicamente con `pnpm prisma migrate dev --name nombre_descriptivo`; no se edita manualmente el SQL de migración.
