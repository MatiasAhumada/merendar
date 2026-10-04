"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon } from "@hugeicons/core-free-icons";
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

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const currentPage = PRIMARY_NAVIGATION.find((item) => item.href === pathname);

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-6">
          <Image src="/logo.svg" alt="" width={40} height={40} priority />
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold">Solidaridad Activa</p>
            <p className="text-xs text-muted-foreground">Gestión comunitaria</p>
          </div>
        </div>
        <nav aria-label="Navegación principal" className="flex flex-1 flex-col gap-1 p-3">
          {PRIMARY_NAVIGATION.map((item) => (
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
              <p className="font-semibold">María G.</p>
              <p className="text-xs text-muted-foreground">Coordinadora territorial</p>
            </div>
          </div>
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
                    <SheetTitle>Solidaridad Activa</SheetTitle>
                    <SheetDescription>Gestión comunitaria</SheetDescription>
                  </SheetHeader>
                  <nav aria-label="Menú principal" className="flex flex-col gap-1 px-4">
                    {PRIMARY_NAVIGATION.map((item) => (
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
                  </nav>
                </SheetContent>
              </Sheet>
              <Image src="/logo.svg" alt="" width={34} height={34} className="lg:hidden" priority />
              <div className="min-w-0">
                <p className="truncate font-display text-base font-semibold leading-tight">
                  {currentPage?.label ?? "Solidaridad Activa"}
                </p>
                <p className="truncate text-xs font-medium text-primary">Solidaridad Activa</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary">Vista demo</Badge>
              <Avatar size="lg">
                <AvatarImage src="/images/profile.jpg" alt="María González" />
                <AvatarFallback>MG</AvatarFallback>
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
          {PRIMARY_NAVIGATION.map((item) => (
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
