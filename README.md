# Merendar

La identidad de marca y las dimensiones de los recursos para instalación están documentadas en [docs/brand.md](docs/brand.md).

Maqueta navegable de gestión comunitaria construida con Next.js 16, TypeScript, Tailwind CSS 4 y shadcn/ui. Traslada las cuatro vistas de Stitch del directorio `../diseño/` a una aplicación con navegación común y diseño adaptable a móvil y escritorio.

## Configuración local

```bash
pnpm install
cp .env.example .env
```

Configurá `DATABASE_URL` con una base PostgreSQL de desarrollo y definí al menos uno de `PRESIDENT_BOOTSTRAP_EMAIL` o `PRESIDENT_BOOTSTRAP_USERNAME`, junto con `PRESIDENT_BOOTSTRAP_NAME` y una contraseña no vacía en `.env`. El usuario puede iniciar sesión con su nombre de usuario o su correo. La contraseña no exige mayúsculas, símbolos ni una longitud mínima; admite hasta 128 caracteres. No compartas ese archivo ni uses credenciales de producción.

Creá y aplicá una migración desde el directorio del proyecto. Usá un nombre descriptivo para cada cambio de esquema:

```bash
pnpm prisma migrate dev --name auth_sessions_roles_attempts
```

Generá Prisma Client y ejecutá el bootstrap idempotente de presidencia:

```bash
pnpm prisma generate
pnpm prisma db seed
```

La cuenta solo se crea si el correo y el usuario todavía no existen. Volver a ejecutar el seed conserva las cuentas existentes sin modificarlas.

## Iniciar

```bash
pnpm dev
```

Abrí [http://localhost:3000](http://localhost:3000) e ingresá con la cuenta configurada para presidencia.

## Recorrido

| Ruta | Vista |
| --- | --- |
| `/login` | Acceso de usuarios |
| `/` | Dashboard operativo, métricas y accesos rápidos |
| `/familias` | Padrón con búsqueda, filtros, ficha y formulario de alta |
| `/entrega` | Registro de entrega de prueba con ficha, checklist y firma |
| `/mercaderia` | Cupos, remito, comprobante y rendiciones |

## Alcance actual

Las vistas operativas todavía muestran información ilustrativa y sus acciones no persisten datos. El acceso valida cuentas contra PostgreSQL. Las sesiones se almacenan en la base de datos, vencen a las 12 horas y se revocan al cerrar sesión. Las contraseñas se guardan con scrypt; las cookies de sesión son HttpOnly y SameSite=Lax, y usan Secure bajo HTTPS. El proxy realiza una redirección preliminar; páginas y endpoints verifican la sesión en la base de datos.

## Validación

```bash
pnpm lint
pnpm build
ALLOW_AUTH_INTEGRATION_TESTS=true pnpm test:integration
```

Las pruebas de integración requieren PostgreSQL local de desarrollo (`DATABASE_URL` con nombre de base que incluya `dev`, `test` o `local`).
