import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!code) {
    console.error("Splitwise callback: no code received");
    return NextResponse.redirect(new URL("/split?error=no_code", appUrl));
  }

  try {
    const redirectUri = `${appUrl}/api/splitwise/callback`;

    const tokenRes = await fetch("https://secure.splitwise.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.SPLITWISE_CLIENT_ID!,
        client_secret: process.env.SPLITWISE_CLIENT_SECRET!,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenText = await tokenRes.text();
    let tokens: any;
    try {
      tokens = JSON.parse(tokenText);
    } catch {
      console.error("Splitwise token response not JSON:", tokenText);
      return NextResponse.redirect(new URL("/split?error=invalid_response", appUrl));
    }

    if (!tokens.access_token) {
      console.error("Splitwise token exchange failed:", tokens);
      return NextResponse.redirect(new URL("/split?error=auth_failed", appUrl));
    }

    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          splitwise_access_token: tokens.access_token,
          splitwise_refresh_token: tokens.refresh_token || null,
          splitwise_token_expires_at: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : null,
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("Failed to store Splitwise tokens:", updateError);
      }
    } else {
      console.error("Splitwise callback: no authenticated user");
    }

    return NextResponse.redirect(new URL("/split?connected=true", appUrl));
  } catch (err) {
    console.error("Splitwise callback error:", err);
    return NextResponse.redirect(new URL("/split?error=auth_failed", appUrl));
  }
}
