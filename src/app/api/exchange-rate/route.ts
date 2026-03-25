import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  try {
    const supabase = createServiceClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data: cached } = await supabase
      .from("exchange_rates")
      .select("rate")
      .eq("from_currency", "USD")
      .eq("to_currency", "INR")
      .eq("date", today)
      .maybeSingle();

    if (cached) {
      return NextResponse.json({ rate: cached.rate, date: today, cached: true });
    }

    const res = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD"
    );
    const data = await res.json();
    const rate = data.rates?.INR || 83.5;

    await supabase.from("exchange_rates").upsert({
      from_currency: "USD",
      to_currency: "INR",
      rate,
      date: today,
    }, { onConflict: "from_currency,to_currency,date" });

    return NextResponse.json({ rate, date: today, cached: false });
  } catch {
    return NextResponse.json({ rate: 83.5, date: new Date().toISOString().slice(0, 10), fallback: true });
  }
}
