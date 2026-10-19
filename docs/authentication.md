# Acceso y sesiones

## Configuración

Definí las variables del archivo `.env.example` en el entorno local. `DATABASE_URL` debe apuntar a PostgreSQL de desarrollo. El bootstrap requiere un correo o nombre de usuario, el nombre de presidencia y una contraseña no vacía de hasta 128 caracteres. La contraseña no requiere composición especial y debe permanecer fuera del repositorio.

## Primera instalación y cambios de esquema

Desde `merendar/`, generá cada migración con Prisma y un nombre explícito:

```bash
pnpm prisma migrate dev --name nombre_descriptivo
```

No escribas ni edites SQL de migraciones manualmente. Luego generá el cliente y ejecutá el bootstrap idempotente:

```bash
pnpm prisma generate
pnpm prisma db seed
```

El seed crea la cuenta con rol `PRESIDENTE` solo cuando el correo y el nombre de usuario configurados no existen. Si el valor antiguo `PRESIDENT_BOOTSTRAP_EMAIL` no parece un correo y no se definió `PRESIDENT_BOOTSTRAP_USERNAME`, se interpreta como nombre de usuario. Las ejecuciones posteriores conservan cuentas existentes sin modificarlas. Para despliegues con migraciones ya generadas, usá `pnpm migrate:deploy`.

## Sesiones

`POST /api/session` valida el nombre de usuario o correo y la contraseña con Zod, registra fallos por identificador normalizado y aplica un límite de cinco intentos en quince minutos. Las contraseñas se verifican con scrypt y sal aleatoria. La API solo responde con errores genéricos de credenciales.

Una autenticación válida genera un token aleatorio de 256 bits. El navegador recibe el token en una cookie HttpOnly, SameSite=Lax, con vencimiento de 12 horas y Secure bajo HTTPS. PostgreSQL conserva únicamente el SHA-256 del token junto con usuario, vencimiento y revocación. `GET /api/session` valida la cookie contra la base de datos; `DELETE /api/session` revoca la sesión y la elimina del navegador. Las operaciones de escritura rechazan solicitudes sin Origin del mismo origen.

`src/proxy.ts` usa la cookie solo para una redirección preliminar. Las páginas protegidas consultan el estado de la sesión en el servidor, y cada handler o servicio privado debe volver a verificarla cerca de los datos. Los handlers de sesión envían `Cache-Control: private, no-store`.

## Roles

El modelo contiene `PRESIDENTE`, `SECRETARIA`, `TESORERIA`, `VOCALIA` y `REVISION_CUENTAS`. Este ticket crea únicamente la cuenta inicial de presidencia; la administración de otras cuentas pertenece a COD-1421.
