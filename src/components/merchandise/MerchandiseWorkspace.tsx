"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AddCircleIcon,
  Calendar03Icon,
  Camera02Icon,
  CheckmarkCircle01Icon,
  File01Icon,
  FileSpreadsheetIcon,
  PackageIcon,
  ReceiptTextIcon,
  TruckIcon,
  Upload02Icon,
} from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const SECTIONS = [
  { href: "#remitos", label: "Remitos", icon: ReceiptTextIcon },
  { href: "#cupos", label: "Cupos", icon: PackageIcon },
  { href: "#rendiciones", label: "Rendiciones", icon: FileSpreadsheetIcon },
] as const;

const RENDITION_CHECKS = [
  { label: "52 firmas y acreditaciones digitales", status: "Listo" },
  { label: "52 DNI verificados en padrón", status: "Listo" },
  { label: "Planilla de remito original digitalizada", status: "Adjunto" },
  { label: "28 firmas restantes para cierre mensual", status: "En cola" },
] as const;

export function MerchandiseWorkspace() {
  const [activeSection, setActiveSection] = useState<(typeof SECTIONS)[number]["href"]>("#remitos");
  const [fileName, setFileName] = useState("");
  const [notice, setNotice] = useState("");
  const [receiptNotice, setReceiptNotice] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Mercadería y rendiciones</h1>
        <p className="mt-1 text-sm text-muted-foreground">Seguimiento del lote y la documentación de ejemplo</p>
      </div>

      <nav aria-label="Secciones de mercadería" className="grid grid-cols-3 gap-1 rounded-2xl bg-secondary p-1">
        {SECTIONS.map((section) => (
          <Button
            key={section.href}
            asChild
            variant={activeSection === section.href ? "inverse" : "ghost"}
            size="sm"
            className="min-w-0 px-1 text-xs sm:text-sm"
          >
            <a href={section.href} onClick={() => setActiveSection(section.href)}>
              <HugeiconsIcon icon={section.icon} strokeWidth={1.8} className="hidden sm:block" />
              {section.label}
            </a>
          </Button>
        ))}
      </nav>

      <section id="cupos" aria-labelledby="stock-title" className="scroll-mt-28">
        <Card variant="hero">
          <CardHeader>
            <Badge variant="success"><HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.8} /> Período vigente</Badge>
            <CardTitle><h2 id="stock-title" className="font-display text-xl font-bold">Módulos Septiembre 2026</h2></CardTitle>
            <p className="text-xs text-primary-foreground/80">Remito #00489 · Min. Desarrollo Social</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Recibidos", value: "80", foot: "Total carga" },
                { label: "Entregados", value: "52", foot: "65% ejec." },
                { label: "En depósito", value: "28", foot: "Disponibles" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-primary-foreground/15 p-3 text-center">
                  <p className="text-[11px] font-medium text-primary-foreground/85">{item.label}</p>
                  <p className="font-display text-2xl font-bold">{item.value}</p>
                  <p className="text-[10px] uppercase text-primary-foreground/75">{item.foot}</p>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold"><span>Progreso de distribución barrial</span><span>52 / 80 un.</span></div>
              <Progress variant="inverse" value={65} aria-label="65 por ciento de módulos distribuidos" />
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="remitos" aria-labelledby="receipt-title" className="flex scroll-mt-28 flex-col gap-4">
        <Sheet onOpenChange={() => setReceiptNotice(false)}>
          <SheetTrigger asChild><Button className="w-full"><HugeiconsIcon icon={AddCircleIcon} strokeWidth={1.8} /> Registrar recepción / remito</Button></SheetTrigger>
          <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-xl overflow-y-auto rounded-t-3xl">
            <SheetHeader className="pr-12"><SheetTitle>Registrar recepción / remito</SheetTitle><SheetDescription>Formulario de demostración</SheetDescription></SheetHeader>
            <form className="px-6 pb-8" onSubmit={(event) => { event.preventDefault(); setReceiptNotice(true); }}>
              <FieldGroup className="gap-4">
                <Field><FieldLabel htmlFor="receipt-number">Número de remito *</FieldLabel><Input id="receipt-number" placeholder="Ej. 00490" required /></Field>
                <Field><FieldLabel htmlFor="receipt-date">Fecha de descarga *</FieldLabel><Input id="receipt-date" type="date" required /></Field>
                <Field><FieldLabel htmlFor="receipt-quantity">Cantidad de módulos *</FieldLabel><Input id="receipt-quantity" type="number" min="1" required /></Field>
                <Field><FieldLabel htmlFor="receipt-manager">Responsable en base</FieldLabel><Input id="receipt-manager" placeholder="Nombre y apellido" /></Field>
              </FieldGroup>
              {receiptNotice ? <Alert variant="info" className="mt-5"><AlertTitle>Vista de demostración</AlertTitle><AlertDescription>El remito no se guardó.</AlertDescription></Alert> : null}
              <div className="mt-6 flex justify-end gap-2"><SheetClose asChild><Button type="button" variant="outline">Cancelar</Button></SheetClose><Button type="submit">Guardar remito</Button></div>
            </form>
          </SheetContent>
        </Sheet>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><HugeiconsIcon icon={TruckIcon} strokeWidth={1.8} className="size-6" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><CardTitle><h2 id="receipt-title" className="font-display text-lg font-semibold">Remito N° 00489</h2></CardTitle><Badge variant="secondary">Activo</Badge></div>
                <p className="text-xs text-muted-foreground">SOL-2026-09-A (80 cupos aprobados)</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-3 text-xs">
              <div><p className="text-muted-foreground">Fecha de descarga</p><strong>14 sep 2026, 09:30</strong></div>
              <div><p className="text-muted-foreground">Responsable en base</p><strong>Lucía Méndez</strong></div>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs"><strong>Comprobante digital remitente</strong><span className="text-primary">1 archivo adjunto</span></div>
            <Dialog>
              <div className="relative overflow-hidden rounded-xl">
                <Image src="/images/remito.jpg" alt="Fotografía del remito de ejemplo en un depósito" width={960} height={640} className="aspect-[1.8] w-full object-cover" />
                <Badge variant="success" className="absolute right-3 top-3">Firma y sello legibles</Badge>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/60 px-3 py-2 text-xs text-white">
                  <span className="truncate">IMG_REMITO_00489.jpg</span>
                  <DialogTrigger asChild><Button variant="outline" size="xs">Ampliar</Button></DialogTrigger>
                </div>
              </div>
              <DialogContent className="max-w-3xl">
                <DialogHeader><DialogTitle>Comprobante digital</DialogTitle><DialogDescription>Imagen de ejemplo del remito N° 00489</DialogDescription></DialogHeader>
                <Image src="/images/remito.jpg" alt="Remito ampliado de ejemplo" width={1280} height={900} className="max-h-[70dvh] w-full rounded-xl object-contain" />
              </DialogContent>
            </Dialog>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={() => cameraInput.current?.click()}><HugeiconsIcon icon={Camera02Icon} strokeWidth={1.8} /> Tomar otra foto</Button>
              <Button variant="secondary" size="sm" onClick={() => uploadInput.current?.click()}><HugeiconsIcon icon={Upload02Icon} strokeWidth={1.8} /> Subir imagen</Button>
              <Input ref={cameraInput} id="receipt-camera" type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")} />
              <Input ref={uploadInput} id="receipt-upload" type="file" accept="image/*" className="hidden" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")} />
            </div>
            {fileName ? <Alert variant="info"><AlertTitle>Archivo seleccionado: {fileName}</AlertTitle><AlertDescription>La imagen no se sube en esta maqueta.</AlertDescription></Alert> : null}
            <div className="flex gap-3 rounded-xl bg-secondary p-3">
              <HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={1.8} className="mt-0.5 shrink-0 text-primary" />
              <div><p className="text-sm font-semibold">Verificado y asignado a jornada</p><p className="text-xs text-muted-foreground">Lote habilitado para entregas con comprobación biométrica</p></div>
            </div>
          </CardContent>
        </Card>

        <Card variant="muted" size="sm"><CardContent className="flex items-center gap-3"><Image src="/images/warehouse-reception.jpg" alt="Recepción comunitaria de mercadería" width={60} height={60} className="size-14 rounded-xl object-cover" /><div><p className="font-semibold">Operativo Comunitario Centro</p><p className="text-xs text-muted-foreground">Recepción física contrastada contra el cupo ministerial con custodia de remito original.</p></div></CardContent></Card>
      </section>

      <section id="rendiciones" aria-labelledby="renditions-title" className="flex scroll-mt-28 flex-col gap-3">
        <div className="flex items-center justify-between gap-2"><h2 id="renditions-title" className="font-display text-lg font-semibold">Rendiciones oficiales</h2><span className="text-xs text-muted-foreground">2 períodos</span></div>
        <Card>
          <CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle><h3 className="font-display text-base font-semibold">Jornada Septiembre 2026</h3></CardTitle><p className="text-xs text-muted-foreground">Organismo: Ministerio de Desarrollo Social</p></div><Badge variant="warning">En preparación</Badge></div></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div><div className="mb-2 flex items-center justify-between gap-2 text-xs"><span>Carga de constancias</span><strong>52 de 80 listas</strong></div><Progress value={65} aria-label="52 de 80 constancias listas" /></div>
            <ul className="flex flex-col gap-3 rounded-xl bg-muted p-3">
              {RENDITION_CHECKS.map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2"><HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={1.8} className="shrink-0 text-primary" />{item.label}</span><strong className="shrink-0 text-primary">{item.status}</strong></li>
              ))}
            </ul>
            <Button variant="secondary" className="w-full whitespace-normal" onClick={() => setNotice("La planilla oficial todavía no se genera en esta maqueta.")}><HugeiconsIcon icon={FileSpreadsheetIcon} strokeWidth={1.8} /> Generar planilla oficial de rendición (PDF / Excel)</Button>
          </CardContent>
        </Card>
        <Card size="sm"><CardContent className="flex flex-col gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-display text-base font-semibold">Jornada Agosto 2026</p><p className="text-xs text-muted-foreground">Expte #9921-MDS-2026</p></div><Badge variant="success">Presentada</Badge></div><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>75/75 entregas homologadas</span><Dialog><DialogTrigger asChild><Button variant="secondary" size="sm">Ver constancia</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Constancia de agosto 2026</DialogTitle><DialogDescription>Referencia visual del expediente #9921-MDS-2026. El archivo no está disponible en esta maqueta.</DialogDescription></DialogHeader><div className="flex items-center gap-2 rounded-xl bg-muted p-4"><HugeiconsIcon icon={File01Icon} strokeWidth={1.8} className="text-primary" />75 entregas homologadas</div></DialogContent></Dialog></div></CardContent></Card>
      </section>
      {notice ? <Alert variant="info"><AlertTitle>{notice}</AlertTitle><AlertDescription>Vista de demostración, sin generación de archivos.</AlertDescription></Alert> : null}
    </div>
  );
}
