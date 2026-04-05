import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * OAuth (e.g. Google) returns here with ?code=.
 * Session cookies must be written onto the same Response as the redirect (see @supabase/ssr).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const origin = url.origin;
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  let redirectResponse = NextResponse.redirect(new URL("/", origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            redirectResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .single();

  const nextPath = profile?.onboarding_completed ? "/" : "/onboarding";
  if (nextPath !== "/") {
    const nextUrl = new URL(nextPath, origin);
    const withCookies = NextResponse.redirect(nextUrl);
    redirectResponse.cookies.getAll().forEach((c) => {
      withCookies.cookies.set(c);
    });
    return withCookies;
  }

  return redirectResponse;
}
