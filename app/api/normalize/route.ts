import { NextRequest, NextResponse } from "next/server";
import { normalizeDrugName } from "@/lib/rxnorm";

// GET /api/normalize?name=Tylenol
// Test endpoint for the RxNorm normalization service.
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim();

  if (!name) {
    return NextResponse.json(
      { error: "Provide a drug name, e.g. /api/normalize?name=Tylenol" },
      { status: 400 }
    );
  }

  const result = await normalizeDrugName(name);

  if (!result) {
    return NextResponse.json({ input: name, found: false, result: null });
  }

  return NextResponse.json({ input: name, found: true, result });
}
