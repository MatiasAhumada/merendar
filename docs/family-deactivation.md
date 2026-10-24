# Baja lógica de familias e integrantes

COD-1484 define las bajas como lógicas. La confirmación del usuario no borra filas: marca la familia o la pertenencia como inactiva, conserva la persona y sus relaciones y registra fecha, actor e identificador de operación. La ficha deja de aparecer en el padrón activo cuando el servidor confirma la operación.

## Integridad e historial

- Una familia o integrante con entregas asociadas no se puede dar de baja.
- Una persona incluida en el snapshot JSON de una planilla tampoco se puede dar de baja. La rendición conserva su planilla; no se reescribe ni elimina el snapshot.
- Las referencias de entregas se bloquean por relación Prisma. Las planillas se verifican por `personId` dentro de `BeneficiarySheet.snapshot.beneficiaries`.
- Una persona `Person` nunca se elimina como consecuencia de una baja, incluso si queda sin pertenencias activas. Así se conservan las referencias y se evita reutilizar su identidad por accidente.
- No se puede dar de baja al último integrante activo. El referente tampoco se puede dar de baja hasta que se elija otro referente en una edición separada.
- Dar de baja una familia marca también sus pertenencias activas como inactivas. El referente y las relaciones permanecen guardados para el historial.

## Autorización y concurrencia

Las rutas online y la sincronización offline requieren `families.write` en el servidor. La baja lleva la versión base y un UUID idempotente. Una transacción serializable bloquea la fila de familia, verifica entregas y snapshots, actualiza la versión y guarda la auditoría en la misma transacción. La creación de entregas y planillas bloquea las filas de familia correspondientes y vuelve a validar que familia e integrante sigan activos.

## Offline

IndexedDB guarda la intención por cuenta, pero la interfaz mantiene la ficha visible hasta que la sincronización responda. Si el servidor confirma, la vista activa se actualiza. Si encuentra una referencia, cambio de versión o permiso revocado, la operación conserva su estado y mensaje; la ficha y los datos restantes no se pierden.
