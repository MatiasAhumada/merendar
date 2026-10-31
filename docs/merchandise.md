# Recepción de mercadería

El módulo `/mercaderia` persiste los ciclos de solicitudes de módulos alimentarios, cupos aprobados, remitos de recepción y rendiciones vinculadas a versiones emitidas de planillas de beneficiarios. La revisión de una rendición es manual; no deriva stock ni métricas de distribución ni declara una presentación oficial.

## Relaciones y reglas

- Un `MerchandisePeriod` agrupa solicitudes de un ciclo y organismo. La combinación de nombre y organismo es única.
- Cada `MerchandiseRequest` pertenece a un período, conserva su número, fecha y cantidad solicitada, y se registra como pendiente de cupo. El número de solicitud es único.
- Una solicitud puede tener un único `MerchandiseQuota`. El cupo conserva quién lo aprobó y su fecha; no puede exceder la cantidad solicitada.
- Un `MerchandiseRemittance` enlaza la solicitud con el cupo correspondiente. Su número es único y la suma de recepciones no puede exceder el cupo aprobado.
- El período declara su destino: módulos familiares (`FAMILIES`) o insumos de merendero (`MERENDERO`). Las solicitudes de módulos usan cantidades enteras y unidad módulo. Las de merendero registran producto, presentación, unidad y cantidad decimal; cupos y recepciones conservan esa unidad mediante sus renglones vinculados.
- `MerchandiseCycle` conserva referencias y datos de autorización del ciclo documental. `DistributionEvent`, `FamilyDelivery` y `DistributionParticipant` modelan una jornada, una entrega por familia y sus participantes sin multiplicar el módulo por persona. El vínculo opcional desde `DistributionRecord` solo se registra explícitamente; no se reconstruyen relaciones históricas por nombre o domicilio.
- `MerchandiseDocument` guarda bytes, nombre y tipo permitidos. El comprobante está relacionado con una solicitud o remito y no se sirve desde recursos públicos.
- Períodos, solicitudes, cupos y remitos admiten correcciones con control de versión optimista. Las anulaciones disponibles son lógicas: no borran períodos, solicitudes, remitos ni documentos. No se anula una solicitud con cupo o remitos, ni un período con movimientos o documentación vinculada; los cupos se corrigen y no se anulan mientras la solicitud conserva una relación única.
- La cola durable de Mercadería admite altas, correcciones y anulaciones. Cada cambio queda ligado a la cuenta activa y a las operaciones padre; el servidor vuelve a validar permisos, relaciones y límites al sincronizar. Un conflicto concurrente permite reaplicar el cambio sobre la versión actual o descartarlo.

Las operaciones de alta del flujo offline usan identificadores estables. La solicitud depende del período, el cupo depende de la solicitud y el remito depende de ambos. El recibo idempotente de sincronización y la escritura del recurso se confirman en la misma transacción serializable.

Los campos de destino y renglones son opcionales al leer cargas offline antiguas: los registros históricos se interpretan como módulos familiares y no se les atribuyen productos ni entregas que no hayan sido capturados.

## Acceso y comprobantes

Solo los roles `PRESIDENTE` y `SECRETARIA` pueden consultar o registrar estas entidades. El servidor repite la comprobación de sesión y rol en cada endpoint de lectura, sincronización y descarga.

Los comprobantes aceptados son archivos PDF aportados desde celular o PC, de hasta 512 KiB por archivo. La interfaz y el servidor validan extensión, MIME, firma `%PDF-` y marcador `%%EOF`; el rechazo mantiene el formulario abierto. La descarga usa `/api/merchandise/documents/[id]`, responde con `Cache-Control: private, no-store` y `X-Content-Type-Options: nosniff`.

Las planillas firmadas, remitos y respaldos de rendición son PDF privados. El flujo se documenta en `docs/delivery.md`; sus límites se centralizan en `src/constants/rendition.constant.ts` y las cargas offline usan operaciones idempotentes de `RENDITIONS`.

## Migración

La migración `20261020192617_merchandise_receiving` fue generada y aplicada sobre la base local `merendar_dev` con:

```bash
pnpm prisma migrate dev --name merchandise_receiving
```

No editar manualmente el SQL de migraciones; usar `pnpm prisma migrate dev --name nombre_descriptivo` para cambios de esquema locales.
