"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Logout01Icon, Menu01Icon } from "@hugeicons/core-free-icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PRIMARY_NAVIGATION } from "@/constants/navigation.constant";
import { BRAND } from "@/constants/brand.constant";
import { ROUTES } from "@/constants/routes";
import type { AuthenticatedUser } from "@/server/services/auth.service";
import { UserRole } from "@prisma/client";
import { USER_ROLE_LABELS } from "@/constants/user-role.constant";
import clientAxios from "@/utils/clientAxios.util";
import { API_ROUTES } from "@/constants/routes";
import { clientErrorHandler } from "@/utils/handlers/clientHandler";

interface AppShellProps {
  children: React.ReactNode;
  user: AuthenticatedUser;
}

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const currentPage = PRIMARY_NAVIGATION.find((item) => item.href === pathname);
  const navigation = PRIMARY_NAVIGATION.filter((item) => item.href !== ROUTES.USERS || user.role === UserRole.PRESIDENTE);

  async function signOut() {
    setIsSigningOut(true);

    try {
      await clientAxios.delete(API_ROUTES.AUTH.SESSION);
      router.replace(ROUTES.LOGIN);
      router.refresh();
    } catch (error) {
      clientErrorHandler(error);
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-6">
          <Image src={BRAND.wordmarkPath} alt={BRAND.name} width={180} height={82} className="h-12 w-auto" priority unoptimized />
        </div>
        <nav aria-label="Navegación principal" className="flex flex-1 flex-col gap-1 p-3">
          {navigation.map((item) => (
            <Button
              asChild
              key={item.href}
              variant={pathname === item.href ? "soft" : "ghost"}
              className="w-full justify-start"
            >
              <Link href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
                <HugeiconsIcon icon={item.icon} strokeWidth={1.8} data-icon="inline-start" />
                {item.label}
              </Link>
            </Button>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-5">
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarImage src="/images/profile.jpg" alt="María González" />
              <AvatarFallback>MG</AvatarFallback>
            </Avatar>
            <div>
              <p className="max-w-36 truncate font-semibold">{user.name}</p>
              <p className="text-xs text-muted-foreground">{USER_ROLE_LABELS[user.role]}</p>
            </div>
          </div>
          <Button variant="ghost" className="mt-4 w-full justify-start" onClick={signOut} disabled={isSigningOut}>
            <HugeiconsIcon icon={Logout01Icon} strokeWidth={1.8} data-icon="inline-start" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-3 px-4 lg:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <Sheet key={pathname}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Abrir menú" className="lg:hidden">
                    <HugeiconsIcon icon={Menu01Icon} strokeWidth={1.8} />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left">
                  <SheetHeader>
                    <SheetTitle>{BRAND.name}</SheetTitle>
                    <SheetDescription>Gestión comunitaria</SheetDescription>
                  </SheetHeader>
                  <nav aria-label="Menú principal" className="flex flex-col gap-1 px-4">
                    {navigation.map((item) => (
                      <Button
                        asChild
                        key={item.href}
                        variant={pathname === item.href ? "soft" : "ghost"}
                        className="w-full justify-start"
                      >
                        <Link href={item.href}>
                          <HugeiconsIcon icon={item.icon} strokeWidth={1.8} data-icon="inline-start" />
                          {item.label}
                        </Link>
                      </Button>
                    ))}
                    <Button variant="ghost" className="w-full justify-start" onClick={signOut} disabled={isSigningOut}>
                      <HugeiconsIcon icon={Logout01Icon} strokeWidth={1.8} data-icon="inline-start" />
                      Cerrar sesión
                    </Button>
                  </nav>
                </SheetContent>
              </Sheet>
              <Image src={BRAND.logoPath} alt="" width={40} height={40} className="lg:hidden" priority unoptimized />
              <div className="min-w-0">
                <p className="truncate font-display text-base font-semibold leading-tight">
                  {currentPage?.label ?? BRAND.shortName}
                </p>
                <p className="truncate text-xs font-medium text-primary">{BRAND.shortName}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary">{USER_ROLE_LABELS[user.role]}</Badge>
              <Avatar size="lg">
                <AvatarFallback>{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>

        <nav
          aria-label="Navegación inferior"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur lg:hidden"
        >
          {navigation.map((item) => (
            <Button
              asChild
              key={item.href}
              variant={pathname === item.href ? "nav-active" : "nav"}
              size="nav"
            >
              <Link href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
                <HugeiconsIcon icon={item.icon} strokeWidth={1.8} />
                <span>{item.label}</span>
              </Link>
            </Button>
          ))}
        </nav>
      </div>
    </div>
  );
}
