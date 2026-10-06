"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  EyeIcon,
  LockIcon,
  UserGroupIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DEMO_CREDENTIALS } from "@/constants/demo-auth.constant";
import { PRIMARY_NAVIGATION } from "@/constants/navigation.constant";
import { ROUTES } from "@/constants/routes";
import { startDemoSession } from "@/lib/demo-session";

function getDestination() {
  const requestedPath = new URLSearchParams(window.location.search).get("next");
  const requestedPage = PRIMARY_NAVIGATION.find((page) => page.href === requestedPath);
  return requestedPage?.href ?? ROUTES.HOME;
}

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [hasError, setHasError] = useState(false);

  function fillDemoCredentials() {
    setEmail(DEMO_CREDENTIALS.email);
    setPassword(DEMO_CREDENTIALS.password);
    setHasError(false);
  }

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (email.trim().toLowerCase() !== DEMO_CREDENTIALS.email || password !== DEMO_CREDENTIALS.password) {
      setHasError(true);
      return;
    }

    startDemoSession();
    router.replace(getDestination());
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <aside className="relative hidden min-h-screen flex-col overflow-hidden bg-primary p-10 text-primary-foreground lg:flex xl:p-14">
        <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-24 size-96 rounded-full border border-primary-foreground/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 top-8 size-64 rounded-full border border-primary-foreground/10" />
        <div className="relative z-10 flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-white shadow-lg">
            <Image src="/logo.svg" alt="" width={34} height={34} priority />
          </span>
          <div><p className="font-display text-lg font-semibold">Solidaridad Activa</p><p className="text-xs text-primary-foreground/75">Gestión comunitaria</p></div>
        </div>

        <div className="relative z-10 mt-20 max-w-lg xl:mt-28">
          <Badge variant="inverse" className="h-7 px-3">OPERATIVO COMUNITARIO</Badge>
          <p className="mt-7 font-display text-5xl font-bold leading-[1.08] tracking-tight xl:text-6xl">
            Cada familia cuenta. <span className="text-primary-container-foreground">Cada jornada también.</span>
          </p>
          <p className="mt-6 max-w-md text-base leading-relaxed text-primary-foreground/80">
            Un mismo lugar para acompañar a las familias, organizar jornadas y reunir la documentación del operativo.
          </p>
        </div>

        <div className="relative z-10 mt-auto grid grid-cols-2 gap-3 pt-12">
          <div className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 p-5 backdrop-blur-sm">
            <HugeiconsIcon icon={UserGroupIcon} strokeWidth={1.7} className="size-6 text-primary-container-foreground" />
            <p className="mt-5 font-display text-3xl font-bold">128</p>
            <p className="text-xs text-primary-foreground/75">familias en el padrón</p>
          </div>
          <div className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 p-5 backdrop-blur-sm">
            <HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={1.7} className="size-6 text-primary-container-foreground" />
            <p className="mt-5 font-display text-3xl font-bold">80</p>
            <p className="text-xs text-primary-foreground/75">cupos aprobados</p>
          </div>
        </div>
        <p className="relative z-10 mt-6 text-xs text-primary-foreground/60">Indicadores ilustrativos para esta demostración</p>
      </aside>

      <main className="flex min-w-0 flex-col bg-background px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
        <div className="flex items-center gap-3 lg:hidden">
          <Image src="/logo.svg" alt="" width={42} height={42} priority />
          <div><p className="font-display font-semibold">Solidaridad Activa</p><p className="text-xs text-muted-foreground">Gestión comunitaria</p></div>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 lg:py-0">
          <Badge variant="secondary" className="mb-5 h-7 px-3"><HugeiconsIcon icon={LockIcon} strokeWidth={1.8} /> Acceso de demostración</Badge>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Bienvenido al operativo</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Ingresá para explorar familias, registro de entregas y mercadería.
          </p>

          <Card className="mt-7">
            <CardHeader>
              <CardTitle><h3 className="font-display text-lg font-semibold">Ingresar</h3></CardTitle>
              <CardDescription>Usá las credenciales de prueba que figuran debajo.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitLogin} noValidate>
                <FieldGroup className="gap-4">
                  <Field data-invalid={hasError}>
                    <FieldLabel htmlFor="demo-email">Correo electrónico</FieldLabel>
                    <Input
                      id="demo-email"
                      name="email"
                      type="email"
                      autoComplete="username"
                      placeholder="tu.correo@organizacion.org"
                      value={email}
                      onChange={(event) => { setEmail(event.target.value); setHasError(false); }}
                      aria-invalid={hasError}
                      required
                    />
                  </Field>
                  <Field data-invalid={hasError}>
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel htmlFor="demo-password">Contraseña</FieldLabel>
                      <Button type="button" variant="link" size="sm" aria-pressed={passwordVisible} onClick={() => setPasswordVisible(!passwordVisible)}>
                        <HugeiconsIcon icon={passwordVisible ? ViewOffIcon : EyeIcon} strokeWidth={1.8} data-icon="inline-start" />
                        {passwordVisible ? "Ocultar" : "Mostrar"}
                      </Button>
                    </div>
                    <Input
                      id="demo-password"
                      name="password"
                      type={passwordVisible ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Ingresá la contraseña"
                      value={password}
                      onChange={(event) => { setPassword(event.target.value); setHasError(false); }}
                      aria-invalid={hasError}
                      required
                    />
                  </Field>
                </FieldGroup>
                {hasError ? (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTitle>Credenciales incorrectas</AlertTitle>
                    <AlertDescription>Usá el correo y la contraseña de prueba indicados abajo.</AlertDescription>
                  </Alert>
                ) : null}
                <Button type="submit" className="mt-6 w-full">
                  Entrar al panel
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} data-icon="inline-end" />
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card variant="muted" size="sm" className="mt-4">
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2"><p className="font-semibold">Credenciales para probar</p><Badge variant="outline">Demo</Badge></div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">Usuario</p><p className="font-medium break-all">{DEMO_CREDENTIALS.email}</p></div>
                <div><p className="text-xs text-muted-foreground">Contraseña</p><p className="font-medium">{DEMO_CREDENTIALS.password}</p></div>
              </div>
              <Button type="button" variant="soft" size="sm" className="w-full" onClick={fillDemoCredentials}>Usar credenciales de prueba</Button>
            </CardContent>
          </Card>
          <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
            Este acceso es solo visual. La sesión vive en esta pestaña y no usa servidor ni base de datos.
          </p>
        </div>
      </main>
    </div>
  );
}
