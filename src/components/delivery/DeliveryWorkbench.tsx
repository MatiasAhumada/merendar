"use client";

import { useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  File01Icon,
  Location01Icon,
  PackageIcon,
  QrCodeIcon,
  Search01Icon,
  SecurityCheckIcon,
  SignatureIcon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { DEMO_HOLDER, RECENT_DELIVERIES } from "@/constants/delivery.constant";
import { ROUTES } from "@/constants/routes";

const SAMPLE_SIGNATURE = "M 42 72 C 70 24, 100 35, 125 76 S 188 74, 232 56 S 300 63, 349 53";

function pointerPosition(event: PointerEvent<SVGSVGElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * 400;
  const y = ((event.clientY - bounds.top) / bounds.height) * 120;
  return { x: Math.max(0, Math.min(x, 400)), y: Math.max(0, Math.min(y, 120)) };
}

export function DeliveryWorkbench() {
  const [dni, setDni] = useState("33456789");
  const [showHolder, setShowHolder] = useState(true);
  const [physicalDni, setPhysicalDni] = useState(true);
  const [attachment, setAttachment] = useState(false);
  const [signaturePaths, setSignaturePaths] = useState([SAMPLE_SIGNATURE]);
  const [notice, setNotice] = useState("");
  const [quickNotice, setQuickNotice] = useState(false);
  const drawing = useRef(false);
  const [notes, setNotes] = useState("Retira con changuito. Acompañado de su hijo.");

  function searchHolder() {
    const normalizedDni = dni.replaceAll(/\D/g, "");
    if (normalizedDni === "33456789") {
      setShowHolder(true);
      setNotice("");
      return;
    }
    setShowHolder(false);
    setNotice("No hay personas de ejemplo para ese DNI.");
  }

  function startSignature(event: PointerEvent<SVGSVGElement>) {
    const point = pointerPosition(event);
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSignaturePaths((paths) => [...paths, `M ${point.x} ${point.y}`]);
  }

  function moveSignature(event: PointerEvent<SVGSVGElement>) {
    if (!drawing.current) return;
    const point = pointerPosition(event);
    setSignaturePaths((paths) => {
      const nextPaths = [...paths];
      const lastIndex = nextPaths.length - 1;
      nextPaths[lastIndex] = `${nextPaths[lastIndex]} L ${point.x} ${point.y}`;
      return nextPaths;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Entrega Activa</h1>
          <p className="text-sm text-muted-foreground">Jornada comunitaria · datos de ejemplo</p>
        </div>
        <Badge variant="success" className="h-7 px-3">Modo campo</Badge>
      </div>

      <Alert variant="info">
        <HugeiconsIcon icon={SecurityCheckIcon} strokeWidth={1.8} />
        <AlertTitle>Vista de demostración</AlertTitle>
        <AlertDescription>La información de esta jornada es ilustrativa. No se registran entregas.</AlertDescription>
      </Alert>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-2 font-semibold">
                  <HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.8} className="text-primary" />
                  Jornada: 15 de septiembre de 2026
                </p>
                <Badge variant="destructive">EN VIVO</Badge>
              </div>
              <div className="flex gap-2 text-sm">
                <HugeiconsIcon icon={Location01Icon} strokeWidth={1.8} className="mt-0.5 shrink-0 text-primary" />
                <div><p className="font-semibold">Barrio Villa Nueva</p><p className="text-xs text-muted-foreground">Punto de distribución: Merendero Sol Naciente</p></div>
              </div>
              <p className="text-xs text-muted-foreground">Responsable: <strong className="text-foreground">María González</strong> (Coordinadora)</p>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-end justify-between gap-2">
                <div><p className="text-[11px] font-semibold uppercase tracking-wide">Progreso de entregas</p><p><strong className="font-display text-2xl text-primary">52</strong> / 80 módulos</p></div>
                <div className="text-right"><p className="text-[11px] font-semibold uppercase tracking-wide">Disponibles</p><Badge variant="warning" className="h-7 px-2 text-base">28 cupos</Badge></div>
              </div>
              <Progress value={65} aria-label="65 por ciento de la jornada completada" />
              <p className="text-xs text-muted-foreground">65% de la jornada completada · Ritmo: 18 seg/persona</p>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); searchHolder(); }}>
              <Input aria-label="Buscar por DNI" inputMode="numeric" value={dni} onChange={(event) => setDni(event.target.value)} placeholder="Ingresar DNI" />
              <Button type="submit" size="icon" aria-label="Buscar DNI"><HugeiconsIcon icon={Search01Icon} strokeWidth={1.8} /></Button>
            </form>
            <Button variant="secondary" size="icon" aria-label="Escanear código" onClick={() => setNotice("El lector de códigos no está conectado en esta maqueta.")}><HugeiconsIcon icon={QrCodeIcon} strokeWidth={1.8} /></Button>
          </div>

          <Sheet onOpenChange={() => setQuickNotice(false)}>
            <SheetTrigger asChild><Button variant="soft" className="w-full"><HugeiconsIcon icon={UserAdd01Icon} strokeWidth={1.8} /> Nueva persona en fila (alta rápida)</Button></SheetTrigger>
            <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-xl overflow-y-auto rounded-t-3xl">
              <SheetHeader className="pr-12"><SheetTitle>Alta rápida de persona</SheetTitle><SheetDescription>Datos de demostración para la fila de entrega</SheetDescription></SheetHeader>
              <form className="px-6 pb-8" onSubmit={(event) => { event.preventDefault(); setQuickNotice(true); }}>
                <FieldGroup className="gap-4">
                  <Field><FieldLabel htmlFor="quick-name">Nombre y apellido *</FieldLabel><Input id="quick-name" required /></Field>
                  <Field><FieldLabel htmlFor="quick-dni">DNI *</FieldLabel><Input id="quick-dni" inputMode="numeric" required /></Field>
                  <Field><FieldLabel htmlFor="quick-family">Grupo familiar</FieldLabel><Input id="quick-family" placeholder="Familia registrada" /></Field>
                </FieldGroup>
                {quickNotice ? <Alert variant="info" className="mt-5"><AlertTitle>Vista de demostración</AlertTitle><AlertDescription>No se guardaron los datos de esta persona.</AlertDescription></Alert> : null}
                <div className="mt-6 flex justify-end gap-2"><SheetClose asChild><Button type="button" variant="outline">Cancelar</Button></SheetClose><Button type="submit">Agregar a la fila</Button></div>
              </form>
            </SheetContent>
          </Sheet>

          {notice ? <Alert variant="info"><AlertTitle>{notice}</AlertTitle></Alert> : null}

          {showHolder ? (
            <>
              <Alert>
                <HugeiconsIcon icon={SecurityCheckIcon} strokeWidth={1.8} className="text-primary" />
                <AlertTitle>Validación antifraude · ejemplo</AlertTitle>
                <AlertDescription>El DNI {DEMO_HOLDER.dni} no registra entregas hoy en esta maqueta.</AlertDescription>
              </Alert>

              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">Titular habilitado</Badge><Badge variant="outline">4 miembros</Badge></div>
                  <CardTitle><h2 className="font-display text-xl font-bold">{DEMO_HOLDER.name}</h2></CardTitle>
                  <p className="text-sm text-muted-foreground">DNI {DEMO_HOLDER.dni} · {DEMO_HOLDER.family}</p>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted p-3 text-xs">
                    <div><p>Última entrega recibida:</p><strong>{DEMO_HOLDER.lastDelivery}</strong></div>
                    <Badge variant="success">Habilitado</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary p-3 text-sm">
                    <div className="flex items-center gap-3"><HugeiconsIcon icon={PackageIcon} strokeWidth={1.8} className="shrink-0 text-primary" /><div><p className="font-semibold">Módulo Familiar Seco N° 2</p><p className="text-xs text-muted-foreground">Incluye kit de higiene y leche maternizada</p></div></div>
                    <Badge variant="outline">1 unidad</Badge>
                  </div>

                  <section aria-labelledby="checklist-title" className="flex flex-col gap-2">
                    <h3 id="checklist-title" className="font-semibold">Checklist de validación en campo</h3>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-muted p-3">
                      <span><strong className="block text-sm">DNI físico presentado</strong><span className="text-xs text-muted-foreground">Cotejado con rostro del titular</span></span>
                      <Checkbox checked={physicalDni} onCheckedChange={(value) => setPhysicalDni(value === true)} aria-label="DNI físico presentado" />
                    </label>
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted p-3">
                      <span><strong className="block text-sm">Firma táctil capturada</strong><span className="text-xs text-muted-foreground">Trazo en pantalla listo</span></span>
                      <HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={1.8} className={signaturePaths.length > 0 ? "text-primary" : "text-muted-foreground"} />
                    </div>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-muted p-3">
                      <span><strong className="block text-sm">Fotocopia DNI / declaración</strong><span className="text-xs text-muted-foreground">Adjunto físico o constancia digital</span></span>
                      <Checkbox checked={attachment} onCheckedChange={(value) => setAttachment(value === true)} aria-label="Fotocopia DNI o declaración" />
                    </label>
                  </section>

                  <section aria-labelledby="signature-title">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 id="signature-title" className="text-xs font-semibold uppercase tracking-wide">Firma de conformidad del titular</h3>
                      <Button variant="link" size="sm" onClick={() => setSignaturePaths([])}><HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} /> Limpiar trazo</Button>
                    </div>
                    <div className="rounded-xl bg-secondary p-3">
                      <svg
                        role="img"
                        aria-label="Área para dibujar la firma"
                        viewBox="0 0 400 120"
                        className="h-32 w-full touch-none rounded-lg bg-secondary"
                        onPointerDown={startSignature}
                        onPointerMove={moveSignature}
                        onPointerUp={() => { drawing.current = false; }}
                        onPointerCancel={() => { drawing.current = false; }}
                      >
                        <line x1="12" y1="97" x2="388" y2="97" stroke="currentColor" strokeOpacity="0.18" />
                        {signaturePaths.map((path, index) => <path key={`${index}-${path.slice(0, 8)}`} d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />)}
                      </svg>
                      <p className="text-xs text-muted-foreground">Firme con el dedo dentro del recuadro</p>
                    </div>
                  </section>

                  <Field><FieldLabel htmlFor="delivery-notes">Observaciones de entrega en terreno</FieldLabel><Textarea id="delivery-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
                  <Button className="w-full" onClick={() => setNotice("Esta es una vista de demostración: la entrega no fue registrada.")}>
                    <HugeiconsIcon icon={SignatureIcon} strokeWidth={1.8} /> Confirmar entrega de módulo
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        <section aria-labelledby="recent-title" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="recent-title" className="font-display text-lg font-semibold">Últimas entregas realizadas</h2>
            <Button variant="link" size="sm" asChild><Link href={ROUTES.HISTORY}>Ver historial</Link></Button>
          </div>
          {RECENT_DELIVERIES.map((delivery) => (
            <Card size="sm" key={delivery.name}>
              <CardContent className="flex items-center gap-3">
                <Avatar size="lg"><AvatarFallback>{delivery.initials}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1"><p className="font-semibold">{delivery.name}</p><p className="truncate text-xs text-muted-foreground">{delivery.detail}</p></div>
                <div className="text-right"><Badge variant="success"><HugeiconsIcon icon={File01Icon} strokeWidth={1.8} /> Firmado</Badge><p className="mt-1 text-xs text-muted-foreground">{delivery.time}</p></div>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </div>
  );
}
