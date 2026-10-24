import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { familyService } from "@/server/services/family.service";
import { requireFamilyWriteAccess } from "@/server/services/family-access";
import { isSameOriginRequest } from "@/server/services/origin.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";
import { familyDeactivationRequestSchema, updateFamilyMemberRequestSchema } from "@/validations/family.validation";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

function handleError(error: unknown, request: NextRequest) {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError({ status: 500, message: "No se pudo actualizar la ficha del integrante", isOperational: false });
  const response = apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudo actualizar la ficha del integrante" });
  response.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
  return response;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  try {
    if (!isSameOriginRequest(request)) {
      throw new ApiError({ status: 403, message: "La solicitud no pertenece a este sitio" });
    }

    const user = await requireFamilyWriteAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: { message: "El cuerpo de la solicitud no es válido" } }, { status: 400, headers: privateHeaders });
    }

    const parsedInput = updateFamilyMemberRequestSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json({ error: { message: "Revisá los datos del integrante", details: parsedInput.error.flatten().fieldErrors } }, { status: 400, headers: privateHeaders });
    }

    const { id, memberId } = await params;
    const { operationId, baseVersion, member, referencePersonId } = parsedInput.data;
    const family = await familyService.changeMember(id, { action: "update-member", member, memberId, referencePersonId }, user.id, operationId, baseVersion);
    return NextResponse.json({ family }, { headers: privateHeaders });
  } catch (error) {
    return handleError(error, request);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  try {
    if (!isSameOriginRequest(request)) {
      throw new ApiError({ status: 403, message: "La solicitud no pertenece a este sitio" });
    }

    const user = await requireFamilyWriteAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: { message: "El cuerpo de la solicitud no es válido" } }, { status: 400, headers: privateHeaders });
    }

    const parsedInput = familyDeactivationRequestSchema.safeParse(body);

    if (!parsedInput.success || parsedInput.data.target.kind !== "member") {
      return NextResponse.json({ error: { message: "Revisá los datos para dar de baja al integrante" } }, { status: 400, headers: privateHeaders });
    }

    const { id, memberId } = await params;
    if (parsedInput.data.target.memberId !== memberId) {
      return NextResponse.json({ error: { message: "El integrante no coincide con la solicitud" } }, { status: 400, headers: privateHeaders });
    }

    const { operationId, baseVersion, target } = parsedInput.data;
    const family = await familyService.deactivate(id, target, user.id, operationId, baseVersion);
    return NextResponse.json({ family }, { headers: privateHeaders });
  } catch (error) {
    return handleError(error, request);
  }
}
