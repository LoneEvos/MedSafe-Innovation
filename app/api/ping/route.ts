import { NextResponse } from "next/server";

// Health-check endpoint. Returns { ok: true } so we can confirm the app is up.
export async function GET() {
  return NextResponse.json({ ok: true });
}
