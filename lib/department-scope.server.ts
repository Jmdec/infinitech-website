// lib/department-scope.server.ts
// SERVER ONLY. Same rule as the notify route: session first, then the
// Employee Masterfile as the fallback for the department.
import { getEmployeeInfo } from "@/lib/employee-department";
import {
  resolveDepartmentScope,
  type DepartmentScope,
} from "@/lib/department-scope";

const pick = (obj: any, ...paths: string[]) => {
  for (const path of paths) {
    const value = path.split(".").reduce<any>((cur, key) => cur?.[key], obj);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

export async function getDepartmentScope(
  session: any,
): Promise<DepartmentScope> {
  const scope = resolveDepartmentScope(session);

  // The session had no department -> read it from the Employee Masterfile.
  if (!scope.department) {
    const employeeId = pick(session, "employee.id", "employee_id");
    if (employeeId) {
      const info = await getEmployeeInfo(employeeId);
      scope.department = info.department;
    }
  }

  return scope;
}
