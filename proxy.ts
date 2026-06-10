import { auth } from "@/auth"
import { NextResponse } from "next/server"

export async function proxy(request) {
  const session = await auth()
  const isLoggedIn = !!session
  const isLoginPage = request.nextUrl.pathname === "/login"
  const isAuthRoute = request.nextUrl.pathname.startsWith("/api/auth")

  if (isAuthRoute) return NextResponse.next()
  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
}
