import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdminAuth } from "@/lib/admin-auth";

export const runtime = "nodejs"; // sharp needs the Node runtime

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_SIZES = [64, 128, 256, 512];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const { id, type } = await params;
  if (!/^\d+$/.test(id) || !["profile-image", "signature"].includes(type)) {
    return NextResponse.json(
      { message: "Employee image not found." },
      { status: 404 },
    );
  }

  const serviceToken = process.env.LARAVEL_SERVICE_TOKEN;
  if (!serviceToken) {
    return NextResponse.json(
      { message: "Employee service is not configured." },
      { status: 500 },
    );
  }

  // Optional resize, whitelisted so people can't request huge/odd sizes
  const sizeParam = Number(request.nextUrl.searchParams.get("size"));
  const size = ALLOWED_SIZES.includes(sizeParam) ? sizeParam : null;

  try {
    // Forward the browser's ETag so Laravel can answer 304 if it supports it
    const ifNoneMatch = request.headers.get("if-none-match");
    const response = await fetch(
      `${laravelUrl}/api/employee-masterfile/${id}/files/${type}`,
      {
        headers: {
          Authorization: `Bearer ${serviceToken}`,
          ...(ifNoneMatch && !size ? { "If-None-Match": ifNoneMatch } : {}),
        },
        cache: "no-store",
      },
    );

    if (response.status === 304) {
      return new NextResponse(null, { status: 304 });
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            response.status === 404
              ? "Employee image not found."
              : "Unable to load employee image.",
        },
        { status: response.status },
      );
    }

    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (!contentType || !ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json(
        { message: "Employee image has an unsupported format." },
        { status: 415 },
      );
    }

    const original = Buffer.from(await response.arrayBuffer());

    // Signatures keep their original format (transparency, sharp edges)
    let body: Buffer = original;
    let outType = contentType;
    if (size && type === "profile-image") {
      body = await sharp(original)
        .rotate() // respect EXIF orientation
        .resize(size, size, { fit: "cover" })
        .webp({ quality: 80 })
        .toBuffer();
      outType = "image/webp";
    }

    // Our own ETag, so it also works when Laravel doesn't send one
    const { createHash } = await import("node:crypto");
    const etag = `"${createHash("sha1").update(body).digest("base64url")}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": outType,
        "Content-Length": String(body.length),
        // private = only the user's browser, never a shared CDN/proxy
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Employee image proxy failed:", error);
    return NextResponse.json(
      { message: "Unable to load employee image." },
      { status: 500 },
    );
  }
}