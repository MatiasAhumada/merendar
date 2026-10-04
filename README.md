# Merendar · Solidaridad Activa

Maqueta navegable de gestión comunitaria construida con Next.js 16, TypeScript, Tailwind CSS 4 y shadcn/ui. Traslada las cuatro vistas de Stitch del directorio `../diseño/` a una aplicación con navegación común y diseño adaptable a móvil y escritorio.

## Iniciar

```bash
pnpm install
pnpm dev
```

Abrir [http://localhost:3000](http://localhost:3000). La ruta `/` es la puerta de entrada al dashboard.

## Recorrido

| Ruta | Vista |
| --- | --- |
| `/` | Dashboard operativo, métricas y accesos rápidos |
| `/familias` | Padrón con búsqueda, filtros, ficha y formulario de alta |
| `/entrega` | Jornada en vivo, validación visual, checklist y firma |
| `/mercaderia` | Cupos, remito, comprobante y rendiciones |
| `/historial` | Historial visual de entregas |

## Alcance actual

Los datos son ilustrativos y las acciones de guardado, sincronización, registro de entregas, generación de planillas y carga de archivos no persisten información. La interfaz indica esta condición en los flujos correspondientes. La configuración de Prisma permanece en el repositorio para la implementación funcional posterior; estas pantallas no requieren conexión a la base de datos.

## Validación

```bash
pnpm lint
pnpm build
```
