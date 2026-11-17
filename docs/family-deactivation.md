# Baja lógica de familias e integrantes

COD-1484 y su ajuste COD-1598 definen las bajas como lógicas. La confirmación no borra filas: marca la familia o la pertenencia como inactiva, conserva las personas y sus relaciones históricas y registra fecha, actor e identificador de operación. La ficha deja de aparecer en el padrón activo cuando el servidor confirma la operación. Las entregas y planillas históricas siguen consultables.

## Integridad e historial

- Las referencias históricas de `DistributionRecord`, `FamilyDelivery`, `DistributionParticipant`, `BeneficiarySheet`, `Rendition` y sus documentos se conservan al desactivar familias e integrantes; no se reescriben ni eliminan.
- Una persona `Person` nunca se elimina como consecuencia de una baja, incluso si queda sin pertenencias activas. Así se conservan las referencias y se evita reutilizar su identidad por accidente.
- No se puede dar de baja al último integrante activo. El referente tampoco se puede dar de baja hasta que se elija otro referente en una edición separada.
- Dar de baja una familia marca también sus pertenencias activas como inactivas. El referente y las relaciones permanecen guardados para el historial.

## Autorización y concurrencia

Las rutas online y la sincronización offline requieren `families.write` en el servidor. La baja lleva la versión base y un UUID idempotente. Una transacción serializable bloquea la fila de familia, actualiza la versión y guarda la auditoría en la misma transacción. La creación de asignaciones, retiros y planillas bloquea las filas de familia correspondientes y vuelve a validar que familia e integrante sigan activos.

## Offline

IndexedDB guarda la intención por cuenta, pero la interfaz mantiene la ficha visible hasta que la sincronización responda. Si el servidor confirma, la vista activa se actualiza y conserva los documentos e historial. La sincronización rechaza nuevas asignaciones, retiros y planillas que referencien personas o familias inactivas, incluso cuando esas operaciones quedaron en cola antes de la baja. Si cambia la versión o se revoca el permiso, la operación conserva su estado y mensaje.
