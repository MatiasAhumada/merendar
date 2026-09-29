# Generic Next

> Plantilla profesional Next.js para acelerar el desarrollo de aplicaciones full-stack

Una base sólida y reutilizable para proyectos Next.js, diseñada con los más altos estándares de la industria. Integra las mejores prácticas, patrones arquitectónicos escalables y componentes listos para producción.

## 🚀 Stack Tecnológico

| Categoría | Tecnologías |
|-----------|-------------|
| **Framework** | Next.js 16 (App Router) |
| **Lenguaje** | TypeScript 5 |
| **Base de Datos** | PostgreSQL + Prisma 7 |
| **Estilos** | Tailwind CSS 4 |
| **Componentes** | shadcn/ui + Radix UI |
| **Iconos** | Hugeicons React |
| **Animaciones** | Framer Motion |
| **HTTP Client** | Axios |
| **Validación** | Zod |
| **Notificaciones** | Sonner |
| **Package Manager** | pnpm |

## ✨ Características Principales

### 🏗️ Arquitectura Escalable

```
src/
├── components/          # Componentes React
│   ├── common/         # Componentes genéricos reutilizables
│   └── ui/             # Componentes de UI (shadcn)
├── constants/          # Constantes y configuraciones
├── lib/                # Utilidades y configuración de librerías
├── server/             # Backend (dentro de Next.js)
│   ├── repository/     # Acceso a datos
│   └── services/       # Lógica de negocio
├── services/           # Servicios frontend (API client)
└── utils/              # Utilidades y helpers
    └── handlers/       # Manejadores de errores
```

### 🎯 Componentes Genéricos

**DataTable** - Tabla de datos con:
- Búsqueda integrada
- Animaciones con Framer Motion
- Contenido expandible
- Loading states
- Total de registros

**GenericModal** - Modal reutilizable con:
- Múltiples tamaños (sm, md, lg, xl, 2xl, 4xl)
- Variantes de tema (default, dark)
- Animaciones de entrada/salida
- ConfirmModal incluido para diálogos de confirmación

### 🔐 Manejo de Errores

**Backend (`apiError.handler`)**
```typescript
throw new ApiError({
  status: httpStatus.NOT_FOUND,
  message: "Usuario no encontrado",
});
```

**Frontend (`clientError.handler`)**
```typescript
clientErrorHandler(error, callback, {
  showToast: true,
  messagePrefix: "Error al guardar: ",
});
```

### 📦 Patrones Implementados

- **Repository Pattern** - Abstracción del acceso a datos
- **Service Layer** - Lógica de negocio separada
- **API Client** - Axios con interceptores centralizados
- **Constantes Centralizadas** - Sin valores hardcodeados

## 🛠️ Comandos Disponibles

```bash
# Desarrollo
pnpm dev              # Inicia servidor en puerto 3000

# Base de datos
pnpm migrate          # Crea y aplica migración
pnpm migrate:deploy   # Aplica migraciones en producción
pnpm reset            # Resetea la base de datos
pnpm studio           # Abre Prisma Studio

# Código
pnpm format           # Formatea con Prettier
pnpm lint             # Ejecuta ESLint
pnpm build            # Build de producción
```

## 📋 Primeros Pasos

### 1. Configurar Variables de Entorno

```bash
copy .env.example .env
```

Edita `.env` con tus credenciales:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/generic-next"
NODE_ENV="development"
NEXT_PUBLIC_API_URL=""
```

### 2. Instalar Dependencias

```bash
pnpm install
```

### 3. Configurar Base de Datos

```bash
pnpm prisma generate
pnpm migrate dev --name init
```

### 4. Iniciar Desarrollo

```bash
pnpm dev
```

Visita `http://localhost:3000`

## 🎨 Ejemplos de Uso

### DataTable Genérica

```tsx
import { DataTable } from "@/components/common";

<DataTable
  title="Usuarios"
  subtitle="Gestión de usuarios del sistema"
  columns={[
    { key: "name", label: "Nombre" },
    { key: "email", label: "Email" },
  ]}
  data={users}
  keyExtractor={(item) => item.id}
  onSearch={handleSearch}
  actions={
    <Button onClick={handleCreate}>Nuevo Usuario</Button>
  }
  onRowClick={(user) => handleEdit(user)}
/>
```

### Modal Genérico

```tsx
import { GenericModal, ConfirmModal } from "@/components/common";

<GenericModal
  open={isOpen}
  onOpenChange={setIsOpen}
  title="Editar Usuario"
  description="Modifica los datos del usuario"
  size="lg"
>
  {/* Contenido del modal */}
</GenericModal>

<ConfirmModal
  open={showConfirm}
  onOpenChange={setShowConfirm}
  title="Eliminar Usuario"
  description="¿Estás seguro de eliminar este usuario?"
  onConfirm={handleDelete}
  variant="destructive"
/>
```

### Servicio Frontend

```tsx
import { userService } from "@/services/user.service";
import { clientErrorHandler } from "@/utils/handlers/clientError.handler";

const handleCreate = async (data: CreateUserDto) => {
  try {
    await userService.create(data);
    clientSuccessHandler("Usuario creado exitosamente");
  } catch (error) {
    clientErrorHandler(error);
  }
};
```

### Servicio Backend (Repository + Service)

```tsx
// Repository
export const userRepository = {
  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },
};

// Service
export const userService = {
  async findById(id: string) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new ApiError({
        status: httpStatus.NOT_FOUND,
        message: "Usuario no encontrado",
      });
    }
    return user;
  },
};
```

## 🔒 Reglas de Desarrollo

Este proyecto sigue estándares estrictos de calidad:

- ✅ TypeScript estricto (sin `any`)
- ✅ Sin comparaciones explícitas (`=== null`, `=== undefined`)
- ✅ Sin valores hardcodeados (todo en constantes)
- ✅ Nombres descriptivos y semánticos
- ✅ Funciones pequeñas con una sola responsabilidad
- ✅ Principios SOLID
- ✅ Endpoints REST compliant
- ✅ Manejo centralizado de errores

## 📁 Estructura de Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `src/constants/routes.ts` | Rutas de la app y API |
| `src/constants/config.constant.ts` | Configuración global |
| `src/constants/error-messages.constant.ts` | Mensajes de error |
| `src/lib/prisma.ts` | Cliente Prisma singleton |
| `src/utils/clientAxios.util.ts` | Instancia Axios configurada |
| `src/components/common/` | Componentes reutilizables |

## 🎯 Cuándo Usar Esta Plantilla

Ideal para:

- ✅ Sistemas de gestión administrativa
- ✅ Dashboards y paneles de control
- ✅ APIs REST con Next.js App Router
- ✅ Aplicaciones CRUD complejas
- ✅ Proyectos que requieren escalabilidad

No recomendado para:

- ❌ Landing pages simples
- ❌ Blogs estáticos
- ❌ Prototipos rápidos sin necesidad de arquitectura

## 🤝 Contribución

Esta plantilla está diseñada para ser extendida. Para agregar nuevas funcionalidades:

1. **Repositorios**: Crea en `src/server/repository/`
2. **Servicios Backend**: Crea en `src/server/services/`
3. **Servicios Frontend**: Crea en `src/services/`
4. **Componentes**: Agrega en `src/components/common/` si son reutilizables
5. **Constantes**: Centraliza en `src/constants/`

## 📄 Licencia

MIT - Libre uso para proyectos personales y comerciales.

---

**Desarrollado con ❤️ usando Next.js, TypeScript y las mejores prácticas de la industria.**
