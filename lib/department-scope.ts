// lib/department-scope.ts
// Shared by the server route AND the client page, so both use the same rule:
//   - superadmin or HR (has "employee_masterfile") -> sees ALL departments
//   - everyone else -> only their OWN department

// Reads a string or an object like { name: "Admin" } (avoids "[object Object]").
export const toText = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    return toText(v.name ?? v.department_name ?? v.title);
  }
  return "";
};

// Tolerant of different permission shapes:
//   ["employee_masterfile"] | [{ directory: "employee_masterfile" }] | { employee_masterfile: [...] }
export function hasDirectory(session: any, directory: string): boolean {
  const permissions = session?.permissions;
  if (!permissions) return false;

  if (Array.isArray(permissions)) {
    return permissions.some((p: any) =>
      typeof p === "string"
        ? p === directory || p === "all_directory"
        : p?.directory === directory ||
          p?.key === directory ||
          p?.directory === "all_directory",
    );
  }
  if (typeof permissions === "object") {
    return directory in permissions || "all_directory" in permissions;
  }
  return false;
}

export type DepartmentScope = {
  canSeeAll: boolean;
  department: string; // the signed-in employee's own department ("" if unknown)
};

export function resolveDepartmentScope(session: any): DepartmentScope {
  const department = toText(
    session?.employee?.department ?? session?.department,
  );
  const canSeeAll =
    session?.is_superadmin === true ||
    hasDirectory(session, "employee_masterfile");

  return { canSeeAll, department };
}
