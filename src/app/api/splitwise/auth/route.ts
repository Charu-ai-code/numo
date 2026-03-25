import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const clientId = process.env.SPLITWISE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/splitwise/callback`;

  if (!clientId) {
    return NextResponse.json(
      { error: "Splitwise Client ID not configured" },
      { status: 500 }
    );
  }

  const url = new URL("https://secure.splitwise.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);

  return NextResponse.redirect(url.toString());
}
