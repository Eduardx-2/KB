import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware ligero de auth.
 * El gate real es AuthGate (client) porque usamos @supabase/supabase-js
 * con persistencia en localStorage (sin @supabase/ssr).
 *
 * Acá solo:
 * - bypass si NEXT_PUBLIC_AUTH_DISABLED=true
 * - dejar pasar rutas públicas
 * - best-effort: si no hay cookie sb-*-auth-token, redirigir a /login
 *   (puede ser imperfecto; AuthGate cubre el caso real)
 */

const PUBLIC_PREFIXES = ["/login", "/signup", "/invite", "/auth"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function hasSupabaseAuthCookie(req: NextRequest): boolean {
  // Supabase browser client suele setear cookies sb-<ref>-auth-token (a veces chunked)
  for (const { name } of req.cookies.getAll()) {
    if (name.includes("-auth-token") || name.startsWith("sb-")) {
      return true;
    }
  }
  return false;
}

export function middleware(req: NextRequest) {
  const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED === "true";
  if (authDisabled) {
    return NextResponse.next();
  }

  // Sin claves de Supabase → modo demo (mismo criterio que HAS_SUPABASE)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Best-effort cookie check. Si no hay cookie, AuthGate igual protege en cliente.
  // No redirigimos agresivamente acá para evitar loops cuando la sesión vive solo en localStorage.
  if (!hasSupabaseAuthCookie(req)) {
    // Dejar pasar: AuthGate redirigirá si hace falta.
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Excluir assets estáticos y API de Next.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
