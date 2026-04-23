import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PUBLIC_PATHS = ["/login"]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next()
  }

  const hasSession = request.cookies.get("session")?.value === "1"

  if (!hasSession && !PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/home", request.url))
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(hasSession ? "/home" : "/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/:path*"],
}
