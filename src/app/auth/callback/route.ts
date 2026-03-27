import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .single();

  if (!profile?.onboarding_completed) {
    return NextResponse.redirect(new URL("/onboarding", origin));
  }

  return NextResponse.redirect(new URL("/", origin));
}
