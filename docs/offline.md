# Acceso sin conexión

## Estrategia PWA

Next.js App Router genera el manifest desde `src/app/manifest.ts`. El service worker de `public/sw.js` usa APIs nativas del navegador, sin agregar una dependencia. Se registra desde el layout raíz y solicita actualización del script sin reutilizar su caché HTTP.

La navegación usa red primero. Si no hay conexión, el worker sirve únicamente `/offline`, una pantalla pública precargada. No almacena documentos HTML de la aplicación, resultados RSC, formularios ni respuestas de API. Esto impide reutilizar accidentalmente páginas privadas, sesiones o permisos.

El caché persistente contiene los iconos y el wordmark públicos de Merendar, la pantalla offline y recursos de `/_next/static/` que responden como públicos. Excluye `/api/`, login, administración, datos de usuario y cualquier respuesta marcada `private` o `no-store`. Los recursos de Next tienen nombres con hash; el worker elimina cachés públicos de versiones anteriores al activarse. Si cambia la política o el contenido precargado, se incrementa la versión `CACHE_NAME` en `public/sw.js`.

El manifest usa el nombre Merendar, `start_url` y `scope` en `/`, modo standalone, los iconos 192/512 y el icono maskable de COD-1440. Android y Chromium pueden ofrecer instalación desde su interfaz. iOS permite agregar el sitio a la pantalla de inicio desde Compartir en Safari; la aplicación no muestra un prompt que Safari no ofrece.

## Contrato offline por cuenta

Esta entrega permite abrir la pantalla pública de estado offline, pero no habilita una sesión autenticada sin conexión ni presenta como disponibles las vistas operativas. El indicador de red informa el estado del navegador; login y administración permanecen bloqueados sin conexión. Ninguna contraseña, cookie, token, respuesta privada ni dato de cuenta se escribe en Cache Storage.

COD-1428 y las vistas que incorporen captura offline deben usar un espacio de almacenamiento separado por el identificador inmutable del usuario autenticado. La vigencia offline no puede superar la expiración de la sesión emitida por el servidor (12 horas); al recuperar conexión se debe validar nuevamente la sesión antes de sincronizar. Cerrar sesión o cambiar de cuenta debe borrar únicamente el almacenamiento del usuario anterior antes de habilitar al siguiente. Las operaciones de login y administración requieren red; los cambios de vistas solo podrán anunciarse como guardados offline cuando sus tickets implementen persistencia e idempotencia.

Actualmente no se crea almacenamiento persistente por usuario, por lo que logout y cambio de cuenta no dejan datos de cuenta que limpiar. Las cachés compartidas contienen exclusivamente recursos públicos de la misma versión de la aplicación.
