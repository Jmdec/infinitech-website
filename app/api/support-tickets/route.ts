// 📁 app/api/support-tickets/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { laravelServiceHeaders } from "@/lib/laravel-service-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, category, subject, message, domain, currentPage } =
      body;

    // Validate required fields
    if (!name || !email || !category || !subject || !message) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 },
      );
    }

    const websiteKeywords = [
      "website",
      "page",
      "button",
      "link",
      "feature",
      "menu",
      "error",
      "bug",
      "broken",
      "not working",
      "issue",
      "feedback",
      "improve",
      "suggestion",
    ];
    const isWebsiteRelated = websiteKeywords.some(
      (keyword) =>
        message.toLowerCase().includes(keyword) ||
        subject.toLowerCase().includes(keyword),
    );

    if (!isWebsiteRelated) {
      return NextResponse.json(
        { message: "Please submit website-related issues or feedback only" },
        { status: 400 },
      );
    }

    const validCategories = [
      "bug_report",
      "feature_request",
      "general_feedback",
      "menu_question",
      "other",
    ];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { message: "Invalid category" },
        { status: 400 },
      );
    }

    // Send to Laravel backend (service token, same as the other public forms)
    const apiUrl = process.env.LARAVEL_API_URL;
    if (!apiUrl) throw new Error("LARAVEL_API_URL is not configured");

    const laravelResponse = await fetch(`${apiUrl}/api/support-tickets`, {
      method: "POST",
      headers: {
        ...laravelServiceHeaders(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        category,
        subject,
        message,
        domain,
        current_page: currentPage,
      }),
    });

    if (!laravelResponse.ok) {
      const errorBody = await laravelResponse.text();
      console.error(
        "Laravel support ticket error:",
        laravelResponse.status,
        errorBody.slice(0, 300),
      );
      throw new Error("Failed to create support ticket in backend");
    }

    const ticketData = await laravelResponse.json();

    return NextResponse.json(
      {
        message: "Support ticket created successfully",
        ticket_id: ticketData.data?.ticket_number || ticketData.data?.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Support ticket error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}
