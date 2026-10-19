import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { AUTH, AUTH_MESSAGES } from "@/constants/auth.constant";
import { authService } from "@/server/services/auth.service";

const loginSchema = z
  .object({
    identifier: z.string().trim().min(1).max(AUTH.IDENTIFIER_MAX_LENGTH),
    password: z.string().min(1).max(AUTH.PASSWORD_MAX_LENGTH),
  })
  .strict();

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

function jsonResponse(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || request.nextUrl.protocol.replace(":", "");

  if (!origin || !host || !protocol) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.host === host && parsedOrigin.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await authService.getSession(request.cookies.get(AUTH.SESSION_COOKIE)?.value);

    if (!session) {
      const response = jsonResponse({ error: { message: AUTH_MESSAGES.SESSION_EXPIRED } }, 401);
      response.cookies.delete(AUTH.SESSION_COOKIE);
      return response;
    }

    return jsonResponse({ user: session.user }, 200);
  } catch {
    return jsonResponse({ error: { message: AUTH_MESSAGES.REQUEST_FAILED } }, 500);
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return jsonResponse({ error: { message: AUTH_MESSAGES.REQUEST_FAILED } }, 403);
  }

  try {
    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: { message: AUTH_MESSAGES.INVALID_CREDENTIALS } }, 400);
    }

    const parsedPayload = loginSchema.safeParse(payload);

    if (!parsedPayload.success) {
      return jsonResponse({ error: { message: AUTH_MESSAGES.INVALID_CREDENTIALS } }, 400);
    }

    const result = await authService.login(parsedPayload.data.identifier, parsedPayload.data.password);

    if (result.type === "invalid-credentials") {
      return jsonResponse({ error: { message: AUTH_MESSAGES.INVALID_CREDENTIALS } }, 401);
    }

    if (result.type === "rate-limited") {
      return jsonResponse({ error: { message: AUTH_MESSAGES.LOGIN_UNAVAILABLE } }, 429);
    }

    const response = jsonResponse({ user: result.user }, 200);
    response.cookies.set(AUTH.SESSION_COOKIE, result.token, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt,
      priority: "high",
    });

    return response;
  } catch {
    return jsonResponse({ error: { message: AUTH_MESSAGES.REQUEST_FAILED } }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return jsonResponse({ error: { message: AUTH_MESSAGES.REQUEST_FAILED } }, 403);
  }

  try {
    await authService.logout(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const response = new NextResponse(null, { status: 204, headers: privateHeaders });
    response.cookies.set(AUTH.SESSION_COOKIE, "", {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    });
    return response;
  } catch {
    return jsonResponse({ error: { message: AUTH_MESSAGES.REQUEST_FAILED } }, 500);
  }
}
