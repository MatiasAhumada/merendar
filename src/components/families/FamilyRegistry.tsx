"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Call02Icon,
  CheckmarkCircle01Icon,
  CloudUploadIcon,
  Location01Icon,
  Search01Icon,
  UserAdd01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FAMILY_FILTERS, FAMILY_RECORDS } from "@/constants/families.constant";
import { type FamilyRecord } from "@/interfaces/family.interface";

type FamilyFilter = "all" | "Villa Nueva" | "Los Aromos" | "San Cayetano" | "alerts";

export function FamilyRegistry() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FamilyFilter>("all");
  const [selectedFamily, setSelectedFamily] = useState<FamilyRecord | null>(null);
  const [formNotice, setFormNotice] = useState(false);
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const visibleFamilies = FAMILY_RECORDS.filter((family) => {
    const matchesSearch = [family.name, family.neighborhood, family.address]
      .join(" ")
      .toLocaleLowerCase("es")
      .includes(normalizedSearch);
    const matchesNeighborhood = filter === "all" || family.neighborhood === filter;
    const matchesAlert = filter === "alerts" && family.alert;
    return matchesSearch && (matchesNeighborhood || matchesAlert);
  });

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Familias Registradas</h1>
          <p className="mt-1 text-sm text-muted-foreground">128 grupos familiares activos en el programa social</p>
        </div>
        <Badge variant="success" className="h-8 px-3">
          <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={1.8} data-icon="inline-start" />
          Territorio Activo
        </Badge>
      </section>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <HugeiconsIcon icon={Search01Icon} strokeWidth={1.8} className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar familias"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por apellido, barrio o calle..."
            className="pl-11"
          />
        </div>
        <Sheet onOpenChange={() => setFormNotice(false)}>
          <SheetTrigger asChild>
            <Button aria-label="Nueva familia">
              <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={1.8} />
              <span className="hidden sm:inline">Nueva familia</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-2xl overflow-y-auto rounded-t-3xl">
            <SheetHeader className="pr-14">
              <SheetTitle className="font-display text-xl font-semibold">Alta Rápida de Familia</SheetTitle>
              <SheetDescription>Registro territorial · vista de demostración</SheetDescription>
            </SheetHeader>
            <form className="px-6 pb-8" onSubmit={(event) => { event.preventDefault(); setFormNotice(true); }}>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="family-name">Apellido o grupo familiar *</FieldLabel>
                  <Input id="family-name" name="name" placeholder="Ej. Familia López" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="family-address">Dirección, calle y altura *</FieldLabel>
                  <Input id="family-address" name="address" placeholder="Ej. Calle 4 N° 842" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="family-neighborhood">Barrio comunitario</FieldLabel>
                  <Select name="neighborhood">
                    <SelectTrigger id="family-neighborhood" className="w-full"><SelectValue placeholder="Seleccionar barrio" /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {[
                          "Villa Nueva",
                          "Los Aromos",
                          "San Cayetano",
                          "Barrio Parque",
                          "Otro / Asentamiento",
                        ].map((neighborhood) => <SelectItem key={neighborhood} value={neighborhood}>{neighborhood}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="family-phone">Teléfono de contacto</FieldLabel>
                  <Input id="family-phone" name="phone" type="tel" placeholder="Ej. 11-4521-8890" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="family-notes">Observaciones de vulnerabilidad o acceso</FieldLabel>
                  <Textarea id="family-notes" name="notes" placeholder="Observaciones adicionales" />
                </Field>
                <Field orientation="horizontal">
                  <Checkbox id="family-head" />
                  <div>
                    <FieldLabel htmlFor="family-head">Crear titular de forma inmediata</FieldLabel>
                    <FieldDescription>Asigna los datos de contacto como primer responsable</FieldDescription>
                  </div>
                </Field>
              </FieldGroup>
              {formNotice ? (
                <Alert variant="info" className="mt-5">
                  <AlertTitle>Vista de demostración</AlertTitle>
                  <AlertDescription>El formulario se puede recorrer, pero aún no guarda datos.</AlertDescription>
                </Alert>
              ) : null}
              <div className="mt-6 flex justify-end gap-2">
                <SheetClose asChild><Button variant="outline" type="button">Cancelar</Button></SheetClose>
                <Button type="submit">Guardar familia</Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(value) => {
            const selectedFilter = FAMILY_FILTERS.find((item) => item.value === value);
            if (selectedFilter) setFilter(selectedFilter.value);
          }}
          variant="filter"
          size="filter"
          className="gap-2"
          aria-label="Filtrar familias"
        >
          {FAMILY_FILTERS.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label} <span className="text-xs opacity-75">{item.count}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <section aria-label="Listado de familias" className="grid gap-3 xl:grid-cols-2">
        {visibleFamilies.map((family) => (
          <Card key={family.id} size="sm">
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={1.8} className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-semibold">{family.name}</h2>
                    <Badge variant={family.alert ? "warning" : "success"}>
                      {family.alert ? "Pendiente Doc." : "Activa"}
                    </Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <HugeiconsIcon icon={Location01Icon} strokeWidth={1.8} />
                    Barrio {family.neighborhood} · {family.address}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Beneficiarios</p>
                  <p className="mt-1 flex items-start gap-1 text-xs font-medium">
                    <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={1.8} className="shrink-0 text-primary" />
                    {family.members}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{family.detailLabel}</p>
                  <p className="mt-1 flex items-start gap-1 text-xs font-medium">
                    <HugeiconsIcon icon={family.alert ? CloudUploadIcon : CheckmarkCircle01Icon} strokeWidth={1.8} className="shrink-0 text-primary" />
                    {family.detail}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="soft" size="sm" asChild>
                  <a href={`tel:${family.phone.replaceAll("-", "")}`}>
                    <HugeiconsIcon icon={Call02Icon} strokeWidth={1.8} data-icon="inline-start" />
                    {family.phone}
                  </a>
                </Button>
                <Button size="sm" onClick={() => setSelectedFamily(family)}>
                  Ver ficha familiar
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} data-icon="inline-end" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {visibleFamilies.length === 0 ? (
          <Card className="xl:col-span-2">
            <CardContent className="py-8 text-center text-muted-foreground">No hay familias de ejemplo para esta búsqueda.</CardContent>
          </Card>
        ) : null}
      </section>

      <Card variant="muted" size="sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-warning/15 text-warning">
              <HugeiconsIcon icon={CloudUploadIcon} strokeWidth={1.8} />
            </span>
            <div>
              <p className="font-semibold">3 fichas de ejemplo</p>
              <p className="text-xs text-muted-foreground">Sin sincronización en esta maqueta</p>
            </div>
          </div>
          <Badge variant="secondary">Vista demo</Badge>
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedFamily)} onOpenChange={(open) => { if (!open) setSelectedFamily(null); }}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader className="pr-12">
            <SheetTitle className="font-display text-xl font-semibold">{selectedFamily?.name}</SheetTitle>
            <SheetDescription>Ficha familiar · datos de ejemplo</SheetDescription>
          </SheetHeader>
          {selectedFamily ? (
            <div className="flex flex-col gap-5 px-6">
              <Badge variant={selectedFamily.alert ? "warning" : "success"}>
                {selectedFamily.alert ? "Documentación pendiente" : "Familia activa"}
              </Badge>
              <div className="space-y-4 rounded-xl bg-muted p-4 text-sm">
                <div><p className="text-xs text-muted-foreground">Domicilio</p><p className="font-medium">Barrio {selectedFamily.neighborhood} · {selectedFamily.address}</p></div>
                <div><p className="text-xs text-muted-foreground">Beneficiarios</p><p className="font-medium">{selectedFamily.members}</p></div>
                <div><p className="text-xs text-muted-foreground">{selectedFamily.detailLabel}</p><p className="font-medium">{selectedFamily.detail}</p></div>
                <div><p className="text-xs text-muted-foreground">Contacto</p><p className="font-medium">{selectedFamily.phone}</p></div>
              </div>
              <Button asChild><a href={`tel:${selectedFamily.phone.replaceAll("-", "")}`}>Llamar al contacto</a></Button>
            </div>
          ) : null}
          <SheetFooter><SheetClose asChild><Button variant="outline">Cerrar ficha</Button></SheetClose></SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
