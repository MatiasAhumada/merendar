# QA COD-1602 — Bloqueo de rendición por cotejos pendientes

## Reproducción

En la implementación anterior, los servicios de emisión definitiva y presentación no validaban los cotejos de participantes. La revisión solo exigía una `PLANILLA_FIRMADA` vigente. Por eso una rendición podía avanzar aunque faltara confirmar la firma manuscrita o el DNI físico de una persona. El registro permitía guardar pendientes, pero no completar luego esos cotejos sobre participantes ya guardados.

## Resultado implementado

- El retiro grupal se puede guardar con cotejos pendientes y la planilla operativa imprimible conserva las filas para completar a mano.
- Presidencia y secretaría pueden completar ambos cotejos por participante desde Registro, con autorización `delivery.write`.
- Emisión definitiva, presentación y revisión bloquean con HTTP 409 e indican el participante y el cotejo pendiente. La revisión exige además una planilla firmada vigente.
- La vista de rendición replica el bloqueo con su snapshot offline; cuando el estado autorizado no está disponible, requiere conexión. El servidor vuelve a comprobar el estado actual al sincronizar emisión, presentación y revisión.

## Validación

- `tests/participant-verification.integration.test.ts`: emisión/presentación/revisión bloqueadas, motivo específico, actualización autorizada, revisión habilitada tras cotejos y revalidación de emisión offline; 1/1 pasó.
- `tests/e2e/distribution-family-delivery.spec.ts`, test de cotejos autorizados: móvil y escritorio pasaron en Chromium con base URL `http://localhost:3022`.
- La descarga de documentos remotos se interceptó durante E2E para no depender de R2 compartido.
- La suite preexistente `tests/distribution-preparation.integration.test.ts` ya fallaba antes del cambio: la prueba de baja de integrante esperaba 409 y recibe 200. No pertenece a la regla de cotejos; dejar constancia para corregir su expectativa o contrato por separado.

## Esquema

No se requiere modificar el esquema de Prisma; los campos de cotejo ya existen. Por lo tanto no se generó migración.
