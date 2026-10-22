# Recepción de mercadería

El módulo `/mercaderia` persiste los ciclos de solicitudes de módulos alimentarios, cupos aprobados, remitos de recepción y rendiciones vinculadas a versiones emitidas de planillas de beneficiarios. La revisión de una rendición es manual; no deriva stock ni métricas de distribución ni declara una presentación oficial.

## Relaciones y reglas

- Un `MerchandisePeriod` agrupa solicitudes de un ciclo y organismo. La combinación de nombre y organismo es única.
- Cada `MerchandiseRequest` pertenece a un período, conserva su número, fecha y cantidad solicitada, y se registra como pendiente de cupo. El número de solicitud es único.
- Una solicitud puede tener un único `MerchandiseQuota`. El cupo conserva quién lo aprobó y su fecha; no puede exceder la cantidad solicitada.
- Un `MerchandiseRemittance` enlaza la solicitud con el cupo correspondiente. Su número es único y la suma de recepciones no puede exceder el cupo aprobado.
- `MerchandiseDocument` guarda bytes, nombre y tipo permitidos. El comprobante está relacionado con una solicitud o remito y no se sirve desde recursos públicos.

Las operaciones de alta del flujo offline usan identificadores estables. La solicitud depende del período, el cupo depende de la solicitud y el remito depende de ambos. El recibo idempotente de sincronización y la escritura del recurso se confirman en la misma transacción serializable.

## Acceso y comprobantes

Solo los roles `PRESIDENTE` y `SECRETARIA` pueden consultar o registrar estas entidades. El servidor repite la comprobación de sesión y rol en cada endpoint de lectura, sincronización y descarga.

Los comprobantes aceptados son PDF, JPEG o PNG, con un límite de 512 KiB. El servidor valida el tamaño y la firma de los bytes antes de persistirlos. La descarga usa `/api/merchandise/documents/[id]`, responde con `Cache-Control: private, no-store` y `X-Content-Type-Options: nosniff`.

Las planillas firmadas, remitos y respaldos de rendición son PDF privados. El flujo se documenta en `docs/delivery.md`; sus límites se centralizan en `src/constants/rendition.constant.ts` y las cargas offline usan operaciones idempotentes de `RENDITIONS`.

## Migración

La migración `20261020192617_merchandise_receiving` fue generada y aplicada sobre la base local `merendar_dev` con:

```bash
pnpm prisma migrate dev --name merchandise_receiving
```

No editar manualmente el SQL de migraciones; usar `pnpm prisma migrate dev --name nombre_descriptivo` para cambios de esquema locales.
