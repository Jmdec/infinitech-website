// 📁 app/api/social-media-requests/route.ts
import { NextRequest, NextResponse } from "next/server";
import { notifyTeamOfNewSocialMediaRequest } from "@/lib/social-media-mailer";
import { laravelServiceHeaders } from "@/lib/laravel-service-auth";
import { proxyJson } from "@/lib/laravelProxy";

// Admin list: forwards the logged-in admin's session to Laravel.
export async function GET(req: NextRequest) {
  return proxyJson({
    method: "GET",
    path: "/api/social-media-requests",
    request: req,
    forwardSession: true,
  });
}

// Public form submission: service token only, no admin session.
export async function POST(req: NextRequest) {
  const { name, email, phone, company, platforms, details } = await req.json();

  console.log("📩 New Social Media Management Request Received:", {
    name,
    email,
    phone,
    company,
    platforms,
    details,
  });

  try {
    const apiUrl = process.env.LARAVEL_API_URL;
    if (!apiUrl) throw new Error("LARAVEL_API_URL is not configured");

    const res = await fetch(`${apiUrl}/api/social-media-requests`, {
      method: "POST",
      headers: {
        ...laravelServiceHeaders(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name, email, phone, company, platforms, details }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("❌ Laravel API Error:", data);
      return NextResponse.json(
        {
          code: res.status,
          message: data.message || "Something Went Wrong",
          errors: data.errors ?? null,
        },
        { status: res.status },
      );
    }

    console.log("✅ Social media request forwarded to Laravel successfully!");

    // Fire-and-forget team notification — must never fail the submission itself.
    const record = data?.data ?? data;
    notifyTeamOfNewSocialMediaRequest({
      id: record?.id,
      name,
      email,
      phone,
      company,
      platforms,
      details,
      created_at: record?.created_at ?? new Date().toISOString(),
    }).catch((emailError) => {
      console.error("⚠️ Failed to send team notification email:", emailError);
    });

    return NextResponse.json(
      { code: 200, message: "Request Sent Successfully!", data: record },
      { status: 200 },
    );
  } catch (error) {
    console.error("❌ Send Social Media Request Error:", error);
    return NextResponse.json(
      { code: 500, message: "Something Went Wrong" },
      { status: 500 },
    );
  }
}
