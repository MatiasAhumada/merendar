

import { PRIVATE_RESPONSE_HEADERS, HTTP_CACHE_CONTROL, HTTP_HEADERS } from "@/constants/http.constant";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { FAMILY_API_MESSAGES } from "@/constants/family.constant";
import { familyService } from "@/server/services/family.service";
import { requireFamilyWriteAccess } from "@/server/services/family-access";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { familyDeactivationRequestSchema, updateFamilyMemberRequestSchema } from "@/schemas/family.schema";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const privateHeaders = PRIVATE_RESPONSE_HEADERS;

function handleError(error: unknown, request: NextRequest) {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError({ status: 500, message: FAMILY_API_MESSAGES.FAMILY_MEMBER_UPDATE_FAILED, isOperational: false });
  const response = apiErrorHandler({ error: apiError, request, fallbackMessage: FAMILY_API_MESSAGES.FAMILY_MEMBER_UPDATE_FAILED });
  response.headers.set(HTTP_HEADERS.CACHE_CONTROL, HTTP_CACHE_CONTROL.PRIVATE_NO_STORE);
  return response;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  try {
    if (!isSameOriginRequest(request)) {
      throw new ApiError({ status: 403, message: FAMILY_API_MESSAGES.WRONG_ORIGIN });
    }

    const user = await requireFamilyWriteAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: { message: FAMILY_API_MESSAGES.REQUEST_BODY_INVALID } }, { status: 400, headers: privateHeaders });
    }

    const parsedInput = updateFamilyMemberRequestSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json({ error: { message: FAMILY_API_MESSAGES.MEMBER_FIELDS_INVALID, details: parsedInput.error.flatten().fieldErrors } }, { status: 400, headers: privateHeaders });
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
      throw new ApiError({ status: 403, message: FAMILY_API_MESSAGES.WRONG_ORIGIN });
    }

    const user = await requireFamilyWriteAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: { message: FAMILY_API_MESSAGES.REQUEST_BODY_INVALID } }, { status: 400, headers: privateHeaders });
    }

    const parsedInput = familyDeactivationRequestSchema.safeParse(body);

    if (!parsedInput.success || parsedInput.data.target.kind !== "member") {
      return NextResponse.json({ error: { message: FAMILY_API_MESSAGES.MEMBER_DEACTIVATION_INVALID } }, { status: 400, headers: privateHeaders });
    }

    const { id, memberId } = await params;
    if (parsedInput.data.target.memberId !== memberId) {
      return NextResponse.json({ error: { message: FAMILY_API_MESSAGES.MEMBER_MISMATCH } }, { status: 400, headers: privateHeaders });
    }

    const { operationId, baseVersion, target } = parsedInput.data;
    const family = await familyService.deactivate(id, target, user.id, operationId, baseVersion);
    return NextResponse.json({ family }, { headers: privateHeaders });
  } catch (error) {
    return handleError(error, request);
  }
}
