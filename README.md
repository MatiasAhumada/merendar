# Merendar · Solidaridad Activa

Maqueta navegable de gestión comunitaria construida con Next.js 16, TypeScript, Tailwind CSS 4 y shadcn/ui. Traslada las cuatro vistas de Stitch del directorio `../diseño/` a una aplicación con navegación común y diseño adaptable a móvil y escritorio.

## Iniciar

```bash
pnpm install
pnpm dev
```

Abrir [http://localhost:3000](http://localhost:3000). La aplicación redirige al acceso de prueba y, después de ingresar, abre el dashboard en `/`.

**Credenciales de demostración**

| Usuario | Contraseña |
| --- | --- |
| `demo@merendar.local` | `Demo2026!` |

El botón «Usar credenciales de prueba» completa ambos campos. La sesión se conserva solo durante la pestaña actual y se elimina al cerrar sesión.

## Recorrido

| Ruta | Vista |
| --- | --- |
| `/login` | Acceso de demostración |
| `/` | Dashboard operativo, métricas y accesos rápidos |
| `/familias` | Padrón con búsqueda, filtros, ficha y formulario de alta |
| `/entrega` | Jornada en vivo, validación visual, checklist y firma |
| `/mercaderia` | Cupos, remito, comprobante y rendiciones |
| `/historial` | Historial visual de entregas |

## Alcance actual

Los datos son ilustrativos y las acciones de guardado, sincronización, registro de entregas, generación de planillas y carga de archivos no persisten información. El login también es de prueba: las credenciales están en el código del cliente y la sesión se guarda en `sessionStorage`, sin autenticar contra un servidor. La interfaz indica esta condición en los flujos correspondientes. La configuración de Prisma permanece en el repositorio para la implementación funcional posterior; estas pantallas no requieren conexión a la base de datos.

## Validación

```bash
pnpm lint
pnpm build
```
