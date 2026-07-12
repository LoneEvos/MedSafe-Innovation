import { NextRequest, NextResponse } from "next/server";
import { extractMedsFromImage } from "@/lib/vision";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// POST /api/scan  (multipart/form-data with an "image" file)
// Returns { meds: [{ name, dose }] } extracted from the label photo.
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with an 'image' file." },
      { status: 400 }
    );
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'image' file." },
      { status: 400 }
    );
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Uploaded file must be an image." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image is too large (max 10 MB)." },
      { status: 413 }
    );
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const meds = await extractMedsFromImage(base64, file.type || "image/jpeg");

  return NextResponse.json({ meds });
}
