"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Calendar03Icon, Search01Icon, SignatureIcon } from "@hugeicons/core-free-icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RECENT_DELIVERIES } from "@/constants/delivery.constant";
import { ROUTES } from "@/constants/routes";

export function DeliveryHistory() {
  const [search, setSearch] = useState("");
  const visibleDeliveries = RECENT_DELIVERIES.filter((delivery) =>
    `${delivery.name} ${delivery.detail}`.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es")),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Historial de entregas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Registro visual de la jornada del 15 de septiembre de 2026</p>
        </div>
        <Badge variant="secondary" className="h-8 px-3"><HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.8} /> Jornada de ejemplo</Badge>
      </div>

      <Card variant="hero">
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div><p className="text-xs text-primary-foreground/75">Entregas realizadas</p><p className="font-display text-3xl font-bold">52</p></div>
          <div><p className="text-xs text-primary-foreground/75">Módulos previstos</p><p className="font-display text-3xl font-bold">80</p></div>
          <div><p className="text-xs text-primary-foreground/75">Punto de distribución</p><p className="mt-1 font-semibold">Merendero Sol Naciente</p></div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Últimas entregas</h2>
        <Button asChild variant="outline" size="sm"><Link href={ROUTES.DELIVERY}><HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} /> Volver a la jornada</Link></Button>
      </div>
      <div className="relative">
        <HugeiconsIcon icon={Search01Icon} strokeWidth={1.8} className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" aria-label="Buscar entregas" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por titular o DNI..." className="pl-11" />
      </div>
      <section aria-label="Entregas de ejemplo" className="grid gap-3 lg:grid-cols-2">
        {visibleDeliveries.map((delivery) => (
          <Card size="sm" key={delivery.name}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Avatar size="lg"><AvatarFallback>{delivery.initials}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1"><CardTitle><h3 className="font-display text-base font-semibold">{delivery.name}</h3></CardTitle><p className="text-xs text-muted-foreground">{delivery.detail}</p></div>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-2">
              <Badge variant="success"><HugeiconsIcon icon={SignatureIcon} strokeWidth={1.8} /> Firmado</Badge>
              <p className="text-xs text-muted-foreground">15/09/2026 · {delivery.time}</p>
            </CardContent>
          </Card>
        ))}
        {visibleDeliveries.length === 0 ? <Card className="lg:col-span-2"><CardContent className="py-8 text-center text-muted-foreground">No hay entregas de ejemplo para esa búsqueda.</CardContent></Card> : null}
      </section>
      <p className="text-xs text-muted-foreground">Esta maqueta muestra tres registros ilustrativos. No consulta datos reales.</p>
    </div>
  );
}
