# Schemas Zod

Las validaciones estructurales compartidas viven en `src/schemas`, organizadas por entidad o responsabilidad. La UI, las rutas API, los servicios, los repositorios y el código offline importan el schema apropiado y llaman `parse` o `safeParse`; no declaran validaciones Zod propias.

## Mapa de módulos

| Módulo | Responsabilidad |
| --- | --- |
| `auth.schema.ts` | Login, sesión y rol de usuario |
| `user.schema.ts` | Alta, estado y respuesta de administración de usuarios |
| `access-policy.schema.ts` | Entrada y respuesta de la política de acceso |
| `family.schema.ts` | Familia, integrantes, contactos, DNI, búsqueda, DTO y baja |
| `dashboard.schema.ts` | Resumen de métricas y respuesta autorizada |
| `merchandise.schema.ts` | Períodos, solicitudes, cupos, remitos, conflictos y respuesta de mercadería |
| `record.schema.ts` | Registros de entrega, selección, planillas y snapshots |
| `rendition.schema.ts` | Documentos y revisiones de rendiciones |
| `offline.schema.ts` | Preparación, snapshots versionados, documentos y cola IndexedDB |
| `synchronization.schema.ts` | Solicitudes de sincronización y estructuras de persistencia compartidas |
| `common.schema.ts` | Contratos estructurales transversales pequeños |

Los DTOs y tipos inferidos reutilizables viven en `src/types`; los contratos de interfaces y snapshots persistidos viven en `src/interfaces`. Los valores de dominio se importan desde `src/constants` o desde enums de Prisma. Los schemas son puros y no importan infraestructura, base de datos ni APIs del navegador salvo la comprobación tipada de `Blob` en el schema documental de preparación offline.

Los schemas bajo `tests/schemas` son oráculos independientes usados para comprobar contratos persistidos y respuestas. No deben importar los schemas de producción que esas pruebas verifican. Los tests que comprueban directamente las reglas de validación de producción pueden importar el schema de producción como objeto de prueba.

## Para agregar o cambiar una validación

1. Buscar primero si el schema ya existe en el módulo de la entidad.
2. Extenderlo o componerlo sin fusionar contratos distintos de alta, actualización, lectura u offline.
3. Conservar optional/nullable, strictness, transformaciones, defaults y rutas de error.
4. Mantener reglas con I/O, autorización y persistencia en sus servicios.
5. Agregar contratos de prueba independientes cuando se verifiquen respuestas o datos históricos.
6. Ejecutar `pnpm check:schema-location`, `pnpm lint`, `pnpm build` y las pruebas focalizadas.
