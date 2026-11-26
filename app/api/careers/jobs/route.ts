import { proxyJson } from "@/lib/laravelProxy";

export async function GET() {
  return proxyJson({
    method: "GET",
    path: "/api/careers/jobs",
  });
}
