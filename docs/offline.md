# Acceso sin conexión

## Estrategia PWA

Next.js App Router genera el manifest desde `src/app/manifest.ts`. El service worker de `public/sw.js` usa APIs nativas del navegador, sin agregar una dependencia. Se registra desde el layout raíz y solicita actualización del script sin reutilizar su caché HTTP.

La navegación usa red primero. Si no hay conexión, el worker sirve únicamente `/offline`, una pantalla pública precargada. No almacena documentos HTML de la aplicación, resultados RSC, formularios ni respuestas de API. Esto impide reutilizar accidentalmente páginas privadas, sesiones o permisos.

El caché persistente contiene los iconos y el wordmark públicos de Merendar, la pantalla offline y recursos de `/_next/static/` que responden como públicos. Excluye `/api/`, login, administración, datos de usuario y cualquier respuesta marcada `private` o `no-store`. Los recursos de Next tienen nombres con hash; el worker elimina cachés públicos de versiones anteriores al activarse. Si cambia la política o el contenido precargado, se incrementa la versión `CACHE_NAME` en `public/sw.js`.

El manifest usa el nombre Merendar, `start_url` y `scope` en `/`, modo standalone, los iconos 192/512 y el icono maskable de COD-1440. Android y Chromium pueden ofrecer instalación desde su interfaz. iOS permite agregar el sitio a la pantalla de inicio desde Compartir en Safari; la aplicación no muestra un prompt que Safari no ofrece.

## Contrato offline por cuenta

Esta entrega permite abrir la pantalla pública de estado offline, pero no habilita una sesión autenticada sin conexión ni presenta como disponibles las vistas operativas. El indicador de red informa el estado del navegador; login y administración permanecen bloqueados sin conexión. Ninguna contraseña, cookie, token, respuesta privada ni dato de cuenta se escribe en Cache Storage.

COD-1428 y las vistas que incorporen captura offline usan una base IndexedDB separada por el identificador inmutable del usuario y por versión del esquema. Cada operación conserva su UUID, recurso, identificador local del registro, versión base, dependencias, fecha local y estado. Las operaciones nuevas vencen junto con la sesión que las habilitó, como máximo a las 12 horas; no se puede iniciar sesión offline. Si el almacenamiento disponible no alcanza, la captura se rechaza sin anunciar que quedó guardada.

La cola procesa operaciones en orden de dependencia y mantiene independientes los cambios sin relación. El navegador sincroniza al recuperar conexión y permite un reintento manual; no depende de Background Sync. Cada envío usa la sesión actual y exige que siga activa la misma cuenta y el permiso vigente. El servidor aplica el cambio y guarda su recibo idempotente en una misma transacción serializable. Repetir el UUID con la misma cuenta y contenido devuelve el mismo resultado; usarlo desde otra cuenta o con contenido distinto se rechaza. Los adaptadores de cada recurso comparan su versión actual con la versión base y devuelven un conflicto explícito con la copia remota para que el usuario elija qué conservar. El historial local conserva hasta 1.000 operaciones sincronizadas por 30 días y mantiene los recibos que aún necesitan operaciones hijas. Cada vista registra su adaptador junto con su captura y persistencia; hasta entonces la API conserva los cambios locales y responde que ese recurso todavía no está habilitado.

El padrón registra altas como operaciones `families` con un identificador local estable. Con sesión vigente y la vista ya abierta, el formulario sigue disponible sin conexión; muestra los borradores pendientes y los sincroniza al recuperar red. El servidor verifica nuevamente el rol, rechaza DNI ya registrado y expone el conflicto con la persona existente. Desde el padrón se puede corregir el borrador antes de volver a sincronizarlo. La pantalla familiar no se sirve desde caché privada ni se abre sin conexión después de recargar la aplicación.

Los cambios pendientes se conservan tras cerrar o recargar la aplicación. Cerrar sesión muestra cuántos borradores se eliminarán y requiere confirmación; luego se limpia únicamente la base local de esa cuenta. Un cambio con sesión vencida o permiso revocado no se envía ni se reasigna a otra cuenta. Si la sesión fue revocada, el borrador permanece aislado por su usuario; la misma persona puede recuperarlo al volver a autenticarse con una cuenta activa. Los recursos privados, formularios y respuestas de API siguen excluidos de Cache Storage.
