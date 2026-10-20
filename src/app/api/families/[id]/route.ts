import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AUTH } from "@/constants/auth.constant";
import { familyService } from "@/server/services/family.service";
import { requireFamilyAccess } from "@/server/services/family-access";
import { isSameOriginRequest } from "@/server/services/origin.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const updateFamilySchema = z.object({
  name: z.string().trim().min(2, "Ingresá el nombre del grupo familiar").max(120),
  neighborhood: z.string().trim().min(2, "Seleccioná un barrio").max(100),
  address: z.string().trim().min(2, "Ingresá el domicilio").max(180),
  contactPhone: z.string().trim().max(40).transform((phone) => phone || undefined).optional(),
  contactEmail: z.string().trim().toLowerCase().pipe(z.email("Ingresá un email válido")).optional(),
  baseUpdatedAt: z.iso.datetime(),
}).strict();
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

function handleError(error: unknown, request: NextRequest) {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError({ status: 500, message: "No se pudo completar la operación con familias", isOperational: false });
  const response = apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudo completar la operación con familias" });
  response.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
  return response;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireFamilyAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const { id } = await params;
    const family = await familyService.findById(id);
    return NextResponse.json({ family }, { headers: privateHeaders });
  } catch (error) {
    return handleError(error, request);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOriginRequest(request)) {
      throw new ApiError({ status: 403, message: "La solicitud no pertenece a este sitio" });
    }

    await requireFamilyAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: { message: "El cuerpo de la solicitud no es válido" } }, { status: 400, headers: privateHeaders });
    }

    const parsedInput = updateFamilySchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json({ error: { message: "Revisá los campos del formulario", details: parsedInput.error.flatten().fieldErrors } }, { status: 400, headers: privateHeaders });
    }

    const { id } = await params;
    const family = await familyService.update(id, parsedInput.data);
    return NextResponse.json({ family }, { headers: privateHeaders });
  } catch (error) {
    return handleError(error, request);
  }
}
