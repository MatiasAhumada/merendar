import { FamilyDocumentType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AUTH } from "@/constants/auth.constant";
import { familyService } from "@/server/services/family.service";
import { requireFamilyAccess } from "@/server/services/family-access";
import { isSameOriginRequest } from "@/server/services/origin.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const personSchema = z.object({
  firstName: z.string().trim().min(1, "Ingresá el nombre").max(80),
  lastName: z.string().trim().min(1, "Ingresá el apellido").max(80),
  dni: z.string().trim().regex(/^\d{7,8}$/, "Ingresá un DNI de 7 u 8 números").optional(),
  email: z.string().trim().toLowerCase().pipe(z.email("Ingresá un email válido")).optional(),
  phone: z.string().trim().max(40).transform((phone) => phone || undefined).optional(),
  relationship: z.string().trim().min(1).max(40),
  missingDocuments: z.array(z.enum(FamilyDocumentType)).max(5),
}).strict();
const createFamilySchema = z.object({
  operationId: z.uuid(),
  name: z.string().trim().min(2, "Ingresá el nombre del grupo familiar").max(120),
  neighborhood: z.string().trim().min(2, "Seleccioná un barrio").max(100),
  address: z.string().trim().min(2, "Ingresá el domicilio").max(180),
  contactPhone: z.string().trim().max(40).transform((phone) => phone || undefined).optional(),
  contactEmail: z.string().trim().toLowerCase().pipe(z.email("Ingresá un email válido")).optional(),
  referenceMemberIndex: z.number().int().min(0),
  members: z.array(personSchema).min(1, "Agregá al menos una persona").max(20),
}).strict().refine((family) => family.referenceMemberIndex < family.members.length, {
  message: "Elegí una persona referente del grupo",
  path: ["referenceMemberIndex"],
});
const searchSchema = z.object({
  search: z.string().trim().max(100).optional(),
  neighborhood: z.string().trim().max(100).optional(),
  alerts: z.enum(["true", "false"]).optional(),
});
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

function handleError(error: unknown, request: NextRequest) {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError({ status: 500, message: "No se pudo completar la operación con familias", isOperational: false });

  const response = apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudo completar la operación con familias" });
  response.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
  return response;
}

export async function GET(request: NextRequest) {
  try {
    await requireFamilyAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const params = searchSchema.safeParse({
      search: request.nextUrl.searchParams.get("search") ?? undefined,
      neighborhood: request.nextUrl.searchParams.get("neighborhood") ?? undefined,
      alerts: request.nextUrl.searchParams.get("alerts") ?? undefined,
    });

    if (!params.success) {
      return NextResponse.json({ error: { message: "Revisá los filtros de búsqueda", details: params.error.flatten().fieldErrors } }, { status: 400, headers: privateHeaders });
    }

    const families = await familyService.findAll({
      search: params.data.search,
      neighborhood: params.data.neighborhood,
      alertsOnly: params.data.alerts === "true",
    });

    return NextResponse.json({ families }, { headers: privateHeaders });
  } catch (error) {
    return handleError(error, request);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      throw new ApiError({ status: 403, message: "La solicitud no pertenece a este sitio" });
    }

    const user = await requireFamilyAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: { message: "El cuerpo de la solicitud no es válido" } }, { status: 400, headers: privateHeaders });
    }

    const parsedInput = createFamilySchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json({ error: { message: "Revisá los campos del formulario", details: parsedInput.error.flatten().fieldErrors } }, { status: 400, headers: privateHeaders });
    }

    const { operationId, ...familyInput } = parsedInput.data;
    const family = await familyService.create(familyInput, user.id, operationId);
    return NextResponse.json({ family }, { status: 201, headers: privateHeaders });
  } catch (error) {
    return handleError(error, request);
  }
}
