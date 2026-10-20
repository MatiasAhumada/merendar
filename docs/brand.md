# Identidad Merendar

Merendar es la marca del software. Orgullo y Solidaridad conserva su nombre en contextos institucionales y de negocio.

## Recursos

| Recurso | Ruta | Uso |
| --- | --- | --- |
| Logo principal transparente | `public/merendar-logo.png` | Fondos claros, 2291 px de ancho |
| Logo para fondos oscuros | `public/merendar-logo-dark.png` | Fondos oscuros, 2291 px de ancho |
| Logo monocromático | `public/merendar-logo-monochrome.png`, `public/merendar-logo-monochrome-inverse.png` | Una tinta en fondos claros u oscuros |
| Isotipo transparente | `public/brand/merendar-isotipo.png` | Navegación y espacios compactos |
| Isotipo para fondos oscuros | `public/brand/merendar-isotipo-dark.png` | Fondo oscuro, tonos claros con damasco |
| Isotipo monocromático | `public/brand/merendar-isotipo-monochrome.png` | Impresión a una tinta |
| Fuente raster del isotipo | `public/brand/merendar-mark-master.png` | Máster generado de 1254 × 1254 px con transparencia |
| Favicon | `src/app/favicon.ico` | ICO con tamaños 16, 32 y 48 px |
| Icono de aplicación | `public/icon-192.png`, `public/icon-512.png` | PNG de 192 y 512 px |
| Icono maskable | `public/icon-maskable-512.png` | PNG de 512 px; símbolo centrado dentro de la zona segura |
| Icono Apple | `public/apple-icon.png` | PNG de 180 px |

El logo principal y el isotipo tienen transparencia alfa real. Los iconos de instalación usan un fondo verde bosque y conservan margen alrededor del símbolo para evitar recortes.

## Dirección visual

La composición representa dos personas compartiendo un cuenco. La paleta combina verde bosque `#143931`, verde hoja `#246B5D`, damasco `#F28B52` y crema `#FBF5E9`. La interfaz usa la fuente Geist local del proyecto. Mantener contraste de texto y foco mediante los tokens Tailwind/shadcn definidos en `src/app/globals.css`.

Usar el wordmark completo en superficies de marca y el isotipo solo cuando el espacio sea reducido. Mantener espacio libre alrededor del logo equivalente al ancho de uno de los motivos circulares del símbolo. No estirar ni reconstruirlo con filtros CSS.

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
