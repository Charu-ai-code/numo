import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Must include OAuth return path so middleware does not redirect before code exchange. */
const publicPaths = ["/login", "/signup", "/forgot-password", "/auth/callback"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    path.startsWith("/_next/") ||
    path.startsWith("/api/") ||
    path === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = publicPaths.some((p) => path.startsWith(p));
  const isOnboarding = path.startsWith("/onboarding");

  if (!user && !isPublic && !isOnboarding) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Do not redirect away from /auth/callback: OAuth must reach the route handler to
  // exchange ?code= for a session. A stale JWT here would skip exchange and break Google login.
  if (
    user &&
    isPublic &&
    !path.startsWith("/auth/callback")
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
