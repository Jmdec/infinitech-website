const laravelUrl = process.env.LARAVEL_API_URL || "http://localhost:8000";

const pick = (obj: any, ...paths: string[]) => {
  for (const path of paths) {
    const value = path.split(".").reduce<any>((cur, key) => cur?.[key], obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

export type EmployeeInfo = {
  department: string;
  number: string;
  email: string;
};

const EMPTY: EmployeeInfo = { department: "", number: "", email: "" };

// Kinukuha ang department at email mula sa Employee Masterfile (server-side).
export async function getEmployeeInfo(
  employeeId: unknown,
): Promise<EmployeeInfo> {
  const id = Number(employeeId);
  const serviceToken = process.env.LARAVEL_SERVICE_TOKEN;
  if (!serviceToken || !Number.isInteger(id) || id <= 0) {
    return { ...EMPTY };
  }

  try {
    const response = await fetch(
      `${laravelUrl}/api/employee-masterfile/${id}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${serviceToken}`,
        },
        cache: "no-store",
      },
    );
    if (!response.ok) return { ...EMPTY };

    const json = await response.json();
    const employee = json?.data ?? json;

    const department = pick(
      employee,
      "department",
      "department_name",
      "department.name",
      "position.department",
    );
    const number = pick(
      employee,
      "id_number",
      "employee_id",
      "employee_number",
    );
    const email = pick(employee, "email_address", "email", "work_email");

    if (!department) {
      console.warn(
        "[notify] No department field found. Employee keys:",
        Object.keys(employee ?? {}),
      );
    }
    if (!email) {
      console.warn(
        "[notify] No email field found. Employee keys:",
        Object.keys(employee ?? {}),
      );
    }

    return {
      department: typeof department === "string" ? department.trim() : "",
      number: number ? String(number) : "",
      email: typeof email === "string" ? email.trim().toLowerCase() : "",
    };
  } catch {
    return { ...EMPTY };
  }
}
