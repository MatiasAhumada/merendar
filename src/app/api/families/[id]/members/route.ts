

import { PRIVATE_RESPONSE_HEADERS, HTTP_CACHE_CONTROL, HTTP_HEADERS } from "@/constants/http.constant";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { FAMILY_API_MESSAGES } from "@/constants/family.constant";
import { familyService } from "@/server/services/family.service";
import { requireFamilyWriteAccess } from "@/server/services/family-access";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { addFamilyMemberRequestSchema } from "@/schemas/family.schema";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const privateHeaders = PRIVATE_RESPONSE_HEADERS;

function handleError(error: unknown, request: NextRequest) {
    let apiError = new ApiError({ status: 500, message: FAMILY_API_MESSAGES.MEMBER_UPDATE_FAILED, isOperational: false });

    if (error instanceof ApiError) {
      apiError = error;
    }
  const response = apiErrorHandler({ error: apiError, request, fallbackMessage: FAMILY_API_MESSAGES.MEMBER_UPDATE_FAILED });
  response.headers.set(HTTP_HEADERS.CACHE_CONTROL, HTTP_CACHE_CONTROL.PRIVATE_NO_STORE);
  return response;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const parsedInput = addFamilyMemberRequestSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json({ error: { message: FAMILY_API_MESSAGES.MEMBER_FIELDS_INVALID, details: parsedInput.error.flatten().fieldErrors } }, { status: 400, headers: privateHeaders });
    }

    const { id } = await params;
    const { operationId, baseVersion, member, memberId, personId, referencePersonId } = parsedInput.data;
    const family = await familyService.changeMember(id, { action: "add-member", member, memberId, personId, referencePersonId }, user.id, operationId, baseVersion);
    return NextResponse.json({ family }, { status: 201, headers: privateHeaders });
  } catch (error) {
    return handleError(error, request);
  }
}
