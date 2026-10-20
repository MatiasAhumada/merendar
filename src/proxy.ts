import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { ROUTES } from "@/constants/routes";

export function proxy(request: NextRequest) {
  const hasSessionCookie = Boolean(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
  const isLoginRoute = request.nextUrl.pathname === ROUTES.LOGIN;
  const isPublicPwaRoute =
    request.nextUrl.pathname === ROUTES.OFFLINE ||
    request.nextUrl.pathname === ROUTES.PWA_MANIFEST ||
    request.nextUrl.pathname === ROUTES.SERVICE_WORKER;
  const isProtectedRoute = !isLoginRoute && !isPublicPwaRoute;

  if (isProtectedRoute && !hasSessionCookie) {
    const loginUrl = new URL(ROUTES.LOGIN, request.url);
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico)$).*)"],
};
