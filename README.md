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
| `/entrega` | Registro de beneficiarios, cola offline y planillas PDF para firma manuscrita |
| `/mercaderia` | Períodos, solicitudes, cupos aprobados, remitos y comprobantes privados |
| `/permisos` | Matriz de capacidades por rol, exclusiva de Presidencia |

## Alcance actual

El padrón, la recepción de mercadería y los registros de beneficiarios persisten en PostgreSQL y admiten captura offline con sincronización idempotente. Las planillas imprimibles guardan una instantánea versionada del padrón; la firma se realiza en papel y la carga del PDF escaneado corresponde a COD-1429. El dashboard consulta métricas confirmadas del servidor; al preparar offline, guarda una lectura con fecha que puede quedar desactualizada y no incorpora los cambios pendientes. El acceso valida cuentas contra PostgreSQL. Las sesiones se almacenan en la base de datos, vencen a las 12 horas y se revocan al cerrar sesión. Las contraseñas se guardan con scrypt; las cookies de sesión son HttpOnly y SameSite=Lax, y usan Secure bajo HTTPS. El proxy realiza una redirección preliminar; páginas y endpoints verifican la sesión y las capacidades actuales en la base de datos. Presidencia administra la matriz cerrada de capacidades por rol desde `/permisos`; la administración de usuarios y de la política permanece reservada a Presidencia. Sin conexión, esas dos vistas son de consulta sobre una preparación vigente y no permiten cambiar cuentas ni permisos.

## Validación

```bash
pnpm lint
pnpm build
ALLOW_AUTH_INTEGRATION_TESTS=true ALLOW_FAMILY_INTEGRATION_TESTS=true ALLOW_SYNC_INTEGRATION_TESTS=true ALLOW_DASHBOARD_INTEGRATION_TESTS=true ALLOW_RENDITION_INTEGRATION_TESTS=true ALLOW_ACCESS_POLICY_INTEGRATION_TESTS=true pnpm test:integration
```

La estrategia de instalación, caché pública y acceso sin conexión está documentada en [docs/offline.md](docs/offline.md).

El ciclo de baja lógica, sus bloqueos de integridad y el referente familiar están documentados en [docs/family-deactivation.md](docs/family-deactivation.md).

El modelo, los permisos y el flujo de recepción de mercadería están documentados en [docs/merchandise.md](docs/merchandise.md).

Los registros de beneficiarios, planillas versionadas y permisos están documentados en [docs/delivery.md](docs/delivery.md).

La matriz de responsabilidades y accesos, con referencias a la entrevista y al estatuto, está en [docs/role-access-matrix.md](docs/role-access-matrix.md).

La decisión técnica aceptada y la matriz de permisos están en [docs/authorization-model-decision.md](docs/authorization-model-decision.md).

La guía en PDF por rol está en [docs/matriz-roles-accesos-cod-1454.pdf](docs/matriz-roles-accesos-cod-1454.pdf).

Las pruebas de integración requieren PostgreSQL local de desarrollo (`DATABASE_URL` con nombre de base que incluya `dev`, `test` o `local`).
