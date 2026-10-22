# Identidad Merendar

Merendar es la marca del software. Orgullo y Solidaridad conserva su nombre en contextos institucionales y de negocio. El emblema de Merendar toma como referencia la casa, el sol, las manos y la comunidad unida por un corazón. Conserva una silueta propia y no incorpora el nombre institucional ni fechas del logo de referencia.

## Recursos

| Recurso | Ruta | Uso |
| --- | --- | --- |
| Logo principal transparente | `public/merendar-logo.png` | Fondos claros |
| Logo para fondos oscuros | `public/merendar-logo-dark.png` | Fondos oscuros |
| Logo monocromático | `public/merendar-logo-monochrome.png`, `public/merendar-logo-monochrome-inverse.png` | Una tinta en fondos claros u oscuros |
| Isotipo transparente | `public/brand/merendar-isotipo.png` | Navegación y espacios compactos |
| Isotipo para fondos oscuros | `public/brand/merendar-isotipo-dark.png` | Fondo oscuro |
| Isotipo monocromático | `public/brand/merendar-isotipo-monochrome.png` | Impresión a una tinta |
| Máster raster del isotipo | `public/brand/merendar-mark-master.png` | Emblema de 1200 × 1200 px con transparencia |
| Favicon | `src/app/favicon.ico` | ICO con tamaños 16, 32 y 48 px |
| Icono de aplicación | `public/icon-192.png`, `public/icon-512.png` | PNG de 192 y 512 px |
| Icono maskable | `public/icon-maskable-512.png` | PNG de 512 px; símbolo dentro de la zona segura |
| Icono Apple | `public/apple-icon.png` | PNG de 180 px |

Los wordmarks e isotipos tienen canal alfa. Los iconos de instalación usan un fondo marrón cálido y dejan margen alrededor del símbolo.

## Dirección visual

El sol amarillo y la casa naranja sostienen a tres personas de colores distintos que comparten un corazón rojo; unas manos color durazno las acompañan. La paleta de interfaz usa naranja `#C9630B`, dorado `#F4A900`, rojo, azul, fucsia y verde, con fondos crema cálidos y marrón para texto y superficies oscuras. La interfaz usa la fuente Geist local. Mantener contraste de texto y foco mediante los tokens Tailwind/shadcn definidos en `src/app/globals.css`.

Usar el wordmark completo en superficies de marca y el isotipo cuando el espacio sea reducido. Mantener espacio libre alrededor del logo; no estirarlo ni reconstruirlo con filtros CSS.

## Integración PWA para COD-1423

El proyecto todavía no contiene manifest. COD-1423 puede consumir los archivos locales con esta configuración:

```json
{
  "name": "Merendar",
  "short_name": "Merendar",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
