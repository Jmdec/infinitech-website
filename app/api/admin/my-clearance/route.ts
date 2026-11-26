// app/api/admin/my-clearance/route.ts
// Employee-side read of their OWN clearance forms, limited to their OWN department.
//  GET /api/admin/my-clearance        -> list of the signed-in employee's forms
//  GET /api/admin/my-clearance?id=12  -> one form (only if it belongs to them)
import { NextRequest, NextResponse } from "next/server";
import { getEmployeeInfo } from "@/lib/employee-department";

export const runtime = "nodejs";

const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

const pick = (obj: any, ...paths: string[]) => {
  for (const path of paths) {
    const value = path.split(".").reduce<any>((cur, key) => cur?.[key], obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

// Reads a string or an object like { name: "Admin" } (avoids "[object Object]").
const toText = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    return toText(v.name ?? v.department_name ?? v.title);
  }
  return "";
};

const norm = (value: string) => value.trim().toLowerCase();

export async function GET(request: NextRequest) {
  const token = request.cookies.get("adminToken")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const serviceToken = process.env.LARAVEL_SERVICE_TOKEN;
  if (!serviceToken) {
    return NextResponse.json(
      { message: "Admin API is not configured." },
      { status: 503 },
    );
  }

  // 1. Who is signed in? (employee id + department come from the SESSION)
  let session: any;
  try {
    const res = await fetch(`${laravelUrl}/api/admin/session`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    session = await res.json();
  } catch {
    return NextResponse.json(
      { message: "Authentication service unavailable." },
      { status: 503 },
    );
  }

  const empId = Number(pick(session, "employee.id", "employee_id"));
  const idNumber = String(
    pick(session, "employee.id_number", "employee_number") ?? "",
  );
  if (!Number.isFinite(empId) && !idNumber) {
    return NextResponse.json({ data: [] });
  }

  // Department of the signed-in employee: session first, then the masterfile.
  let myDepartment = toText(pick(session, "employee.department", "department"));
  if (!myDepartment && Number.isFinite(empId)) {
    myDepartment = (await getEmployeeInfo(empId)).department;
  }
  const myDept = norm(myDepartment);

  // A form is shown only if it is the employee's own AND from their department.
  const visibleToMe = (record: any) => {
    const recordEmpId = Number(
      pick(record, "employee_id", "employee.employee_id", "employee.id"),
    );
    const recordNumber = String(
      pick(record, "id_number", "employee.id_number") ?? "",
    );
    const isMine =
      (Number.isFinite(recordEmpId) && recordEmpId === empId) ||
      (!!idNumber && recordNumber === idNumber);
    if (!isMine) return false;

    const recordDept = norm(
      toText(pick(record, "department", "employee.department")),
    );
    // If both sides have a department they must match.
    if (myDept && recordDept && myDept !== recordDept) return false;

    return true;
  };

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${serviceToken}`,
  };

  // 2. One record
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    if (!/^\d+$/.test(id)) {
      return NextResponse.json(
        { message: "Invalid request." },
        { status: 422 },
      );
    }
    const res = await fetch(`${laravelUrl}/api/admin/clearance/${id}`, {
      headers,
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    const record = json?.data ?? json;
    if (!res.ok || !record || !visibleToMe(record)) {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ data: record });
  }

  // 3. List (filtered here, so an employee never receives someone else's form)
  const res = await fetch(`${laravelUrl}/api/admin/clearance`, {
    headers,
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json(
      { message: json?.message || "Unable to load clearance forms." },
      { status: 502 },
    );
  }
  const all: any[] = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.data?.data)
      ? json.data.data
      : [];

  return NextResponse.json({ data: all.filter(visibleToMe) });
}
