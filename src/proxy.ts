import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/", "/login", "/setup", "/setup-password", "/icon-192.png", "/icon-512.png", "/icon-512-maskable.png", "/badge-72.png", "/offline.html", "/manifest.webmanifest"];
const PUBLIC_PREFIXES = ["/api/auth", "/api/setup", "/_next", "/favicon", "/serwist/"];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  if (isPublic(pathname)) return NextResponse.next();

  if (!session?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const role = session.user.role;

  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL(roleHome(role), req.url));
  }
  if (pathname.startsWith("/service") && role !== "admin" && role !== "service") {
    return NextResponse.redirect(new URL(roleHome(role), req.url));
  }
  if (pathname.startsWith("/client") && role !== "client") {
    return NextResponse.redirect(new URL(roleHome(role), req.url));
  }

  return NextResponse.next();
});

function roleHome(role: string) {
  if (role === "admin") return "/admin";
  if (role === "service") return "/service";
  return "/client";
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
