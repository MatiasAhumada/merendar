# Revisión visual de Merendar

Revisión realizada el 19 de octubre de 2026 sobre el build de producción local.

## Login con gstack

gstack Chromium recorrió `/login` y generó capturas en estos viewports:

| Viewport | Evidencia |
| --- | --- |
| 375 × 812 | `docs/brand-evidence/merendar-login-mobile.png` |
| 768 × 1024 | `docs/brand-evidence/merendar-login-tablet.png` |
| 1280 × 720 | `docs/brand-evidence/merendar-login-desktop.png` |

El nombre, wordmark, formulario y botón de acceso se muestran en los tres tamaños. Los campos conservan sus etiquetas, el orden de tabulación inicia en usuario o correo, el contenido entra en el ancho móvil y la consola no registró errores. No se envió el formulario.

## Navegación autenticada

En el navegador integrado se recorrió el dashboard y se comprobó la barra lateral en escritorio. Al estrechar el viewport con el zoom del navegador, apareció el menú superior compacto y la navegación inferior de cinco destinos. Las etiquetas y las tarjetas permanecieron dentro del ancho visible. El zoom se restableció al finalizar.

## Recursos

El logo transparente se abrió sobre fondos claros y oscuros. La fuente `public/brand/merendar-mark-master.png` y los wordmarks tienen canal alfa con valores de 0 a 255. Los PNG de instalación miden 192, 512 y 180 px según su uso; el ICO contiene 16, 32 y 48 px. Los recursos locales respondieron HTTP 200.
