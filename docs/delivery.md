# Registro de beneficiarios y planillas

`/entrega` registra una entrega por persona y período de mercadería. Presidencia y secretaría pueden registrar la fecha, tipo y cantidad del módulo, observaciones y comprobaciones del DNI y otros documentos. El servidor comprueba el rol, el período, la pertenencia de la persona al grupo familiar y que esa persona todavía no figure registrada en el período.

El formulario guarda cada alta en la cola offline por UUID. En línea, el adaptador guarda el registro y el recibo de sincronización en una transacción; repetir la misma operación devuelve el resultado idempotente. Registrar nuevamente a la misma persona en el mismo período produce un conflicto, incluso si se envía con otro UUID.

La planilla se genera con un conjunto seleccionado del padrón, sin requerir una entrega confirmada ni una rendición. Cada emisión conserva una versión y una instantánea de los datos identificatorios en `BeneficiarySheet`; emitir una versión nueva no modifica las anteriores. El endpoint de descarga vuelve a generar el PDF desde esa instantánea, usa fuentes DejaVu con licencia incluida, conserva acentos, no se cachea y exige autorización del servidor. El documento se identifica como planilla propia de Merendar, no como formulario oficial ministerial.

Las firmas son manuscritas en el papel. La app no captura, valida ni guarda trazos biométricos. COD-1429 puede asociar la evidencia escaneada a la referencia de la planilla emitida.

Los cambios de esquema se generan y aplican únicamente con `pnpm prisma migrate dev --name nombre_descriptivo`; no se edita manualmente el SQL de migración.
