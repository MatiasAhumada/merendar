"use client";

import { AUTH_UI_TEXT, AUTH_MESSAGES, AUTH } from "@/constants/auth.constant";
import { APPLICATION_UI_TEXT } from "@/constants/application-ui.constant";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BRAND } from "@/constants/brand.constant";
import { API_ROUTES, ROUTES } from "@/constants/routes.constant";
import { PRIMARY_NAVIGATION } from "@/constants/navigation.constant";
import { clientErrorHandler } from "@/utils/handlers/clientHandler";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { loginResponseSchema } from "@/schemas/auth.schema";
import axios from "axios";
import Image from "next/image";

import {
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  EyeIcon,
  LockIcon,
  UserGroupIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";

import clientAxios from "@/utils/clientAxios.util";

function getDestination(capabilities: string[]) {
  const requestedPath = new URLSearchParams(window.location.search).get("next");
  const requestedPage = PRIMARY_NAVIGATION.find((page) => page.href === requestedPath);

  if (requestedPage && (!requestedPage.capabilities || requestedPage.capabilities.some((capability) => capabilities.includes(capability)))) {
    return requestedPage.href;
  }

  const firstAvailablePage = PRIMARY_NAVIGATION.find((page) =>
    page.href !== ROUTES.HOME && page.capabilities?.some((capability) => capabilities.includes(capability)),
  );

  if (firstAvailablePage) {
    return firstAvailablePage.href;
  }

  return ROUTES.HOME;
}

export function LoginScreen() {
  const router = useRouter();
  const isOnline = useNetworkStatus();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!isOnline) {
      setErrorMessage(AUTH_MESSAGES.NECESITAS_CONEXION_A_INTERNET_PARA_VALIDAR_TU_CUENTA);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await clientAxios.post(API_ROUTES.AUTH.SESSION, { identifier, password });
      const parsedResponse = loginResponseSchema.safeParse(response.data);

      if (!parsedResponse.success) {
        setErrorMessage(AUTH_MESSAGES.LOGIN_UNAVAILABLE);
        return;
      }

      router.replace(getDestination(parsedResponse.data.capabilities));
      router.refresh();
    } catch (error) {
      clientErrorHandler(error, () => setErrorMessage(AUTH_MESSAGES.LOGIN_UNAVAILABLE), { logToConsole: false, showToast: false });

      if (axios.isAxiosError(error) && error.response?.status === 401) {
        setErrorMessage(AUTH_MESSAGES.INVALID_CREDENTIALS);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <aside className="relative hidden min-h-screen flex-col overflow-hidden bg-primary p-10 text-primary-foreground lg:flex xl:p-14">
        <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-24 size-96 rounded-full border border-primary-foreground/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 top-8 size-64 rounded-full border border-primary-foreground/10" />
        <div className="relative z-10 flex items-center gap-3">
          <Image src={BRAND.darkWordmarkPath} alt={BRAND.name} width={250} height={115} className="h-16 w-auto" priority unoptimized />
        </div>

        <div className="relative z-10 mt-20 max-w-lg xl:mt-28">
          <Badge variant="inverse" className="h-7 px-3">{AUTH_UI_TEXT.OPERATIVO_COMUNITARIO}</Badge>
          <p className="mt-7 font-display text-5xl font-bold leading-[1.08] tracking-tight xl:text-6xl">
            {AUTH_UI_TEXT.ORGANIZACION_DE}<span className="text-primary-container-foreground">{AUTH_UI_TEXT.JORNADAS_COMUNITARIAS}</span>
          </p>
          <p className="mt-6 max-w-md text-base leading-relaxed text-primary-foreground/80">
            {AUTH_UI_TEXT.UN_MISMO_LUGAR_PARA_ACOMPANAR_A_LAS_FAMILIAS_ORGANIZAR_JORNADAS_Y_REUNIR}</p>
        </div>

        <div className="relative z-10 mt-auto grid grid-cols-2 gap-3 pt-12">
          <div className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 p-5 backdrop-blur-sm">
            <HugeiconsIcon icon={UserGroupIcon} strokeWidth={1.7} className="size-6 text-primary-container-foreground" />
            <p className="mt-5 font-display text-3xl font-bold">{AUTH_UI_TEXT.TEXT_128}</p>
            <p className="text-xs text-primary-foreground/75">{AUTH_UI_TEXT.FAMILIAS_EN_EL_PADRON}</p>
          </div>
          <div className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 p-5 backdrop-blur-sm">
            <HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={1.7} className="size-6 text-primary-container-foreground" />
            <p className="mt-5 font-display text-3xl font-bold">{AUTH_UI_TEXT.TEXT_80}</p>
            <p className="text-xs text-primary-foreground/75">{AUTH_UI_TEXT.CUPOS_APROBADOS}</p>
          </div>
        </div>
        <p className="relative z-10 mt-6 text-xs text-primary-foreground/60">{AUTH_UI_TEXT.INDICADORES_ILUSTRATIVOS_PARA_ESTA_DEMOSTRACION}</p>
      </aside>

      <main className="flex min-w-0 flex-col bg-background px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
        <div className="flex items-center gap-3 lg:hidden">
          <Image src={BRAND.wordmarkPath} alt={BRAND.name} width={220} height={100} className="h-14 w-auto" priority unoptimized />
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 lg:py-0">
          <Badge variant="secondary" className="mb-5 h-7 px-3"><HugeiconsIcon icon={LockIcon} strokeWidth={1.8} /> {AUTH_UI_TEXT.ACCESO_SEGURO}</Badge>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{AUTH_UI_TEXT.BIENVENIDO_AL_OPERATIVO}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {AUTH_UI_TEXT.INGRESA_PARA_EXPLORAR_FAMILIAS_REGISTRO_DE_ENTREGAS_Y_MERCADERIA}</p>

          <Card className="mt-7">
            <CardHeader>
              <CardTitle><h3 className="font-display text-lg font-semibold">{AUTH_UI_TEXT.INGRESAR}</h3></CardTitle>
              <CardDescription>{AUTH_UI_TEXT.INGRESA_CON_LA_CUENTA_ASIGNADA_POR_PRESIDENCIA}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitLogin} noValidate>
                <FieldGroup className="gap-4">
                  <Field data-invalid={Boolean(errorMessage)}>
                    <FieldLabel htmlFor="identifier">{AUTH_UI_TEXT.USUARIO_O_CORREO_ELECTRONICO}</FieldLabel>
                    <Input
                      id="identifier"
                      name="identifier"
                      type="text"
                      maxLength={AUTH.IDENTIFIER_MAX_LENGTH}
                      autoComplete="username"
                      placeholder={AUTH_UI_TEXT.TU_USUARIO_O_CORREO}
                      value={identifier}
                      onChange={(event) => { setIdentifier(event.target.value); setErrorMessage(""); }}
                      aria-invalid={Boolean(errorMessage)}
                      required
                    />
                  </Field>
                  <Field data-invalid={Boolean(errorMessage)}>
                    <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor="password">{AUTH_UI_TEXT.CONTRASENA}</FieldLabel>
                      <Button type="button" variant="link" size="sm" aria-pressed={passwordVisible} onClick={() => setPasswordVisible(!passwordVisible)}>
                        <HugeiconsIcon icon={passwordVisible ? ViewOffIcon : EyeIcon} strokeWidth={1.8} data-icon="inline-start" />
                        {passwordVisible ? AUTH_UI_TEXT.OCULTAR_CONTRASENA : AUTH_UI_TEXT.MOSTRAR_CONTRASENA}
                      </Button>
                    </div>
                    <Input
                      id="password"
                      name="password"
                      type={passwordVisible ? "text" : "password"}
                      maxLength={AUTH.PASSWORD_MAX_LENGTH}
                      autoComplete="current-password"
                      placeholder={AUTH_UI_TEXT.INGRESA_LA_CONTRASENA}
                      value={password}
                      onChange={(event) => { setPassword(event.target.value); setErrorMessage(""); }}
                      aria-invalid={Boolean(errorMessage)}
                      required
                    />
                  </Field>
                </FieldGroup>
                {errorMessage ? (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTitle>{AUTH_UI_TEXT.NO_SE_PUDO_INICIAR_SESION}</AlertTitle>
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                ) : null}
                {!isOnline ? (
                  <Alert variant="info" className="mt-4">
                    <AlertTitle>{APPLICATION_UI_TEXT.SIN_CONEXION}</AlertTitle>
                    <AlertDescription>{AUTH_UI_TEXT.EL_INICIO_DE_SESION_REQUIERE_CONEXION_A_INTERNET}</AlertDescription>
                  </Alert>
                ) : null}
                <Button type="submit" className="mt-6 w-full" disabled={isSubmitting || !isOnline}>
                  {isSubmitting ? AUTH_UI_TEXT.INGRESANDO : AUTH_UI_TEXT.ENTRAR_AL_PANEL}
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} data-icon="inline-end" />
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
            {AUTH_UI_TEXT.EL_ACCESO_NECESITA_CONEXION_A_INTERNET_PARA_VALIDAR_TU_CUENTA_Y_SESION}</p>
        </div>
      </main>
    </div>
  );
}
