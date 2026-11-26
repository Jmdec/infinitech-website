// lib/notification-recipients.ts
const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

export async function getNotificationRecipients(
  department?: string,
): Promise<{ to: string[]; cc: string[] }> {
  const serviceToken = process.env.LARAVEL_SERVICE_TOKEN;
  if (!serviceToken) {
    console.warn("[notification-recipients] LARAVEL_SERVICE_TOKEN is not set");
    return { to: [], cc: [] };
  }

  const query = department?.trim()
    ? `?department=${encodeURIComponent(department.trim())}`
    : "";

  try {
    const response = await fetch(
      `${laravelUrl}/api/admin/notification-recipients/notification_emails${query}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${serviceToken}`,
        },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      console.warn(
        "[notification-recipients] Laravel returned",
        response.status,
      );
      return { to: [], cc: [] };
    }
    const json = await response.json();
    return {
      to: Array.isArray(json?.data?.emails) ? json.data.emails : [],
      cc: Array.isArray(json?.data?.cc) ? json.data.cc : [],
    };
  } catch (error) {
    console.warn("[notification-recipients] request failed:", error);
    return { to: [], cc: [] };
  }
}
