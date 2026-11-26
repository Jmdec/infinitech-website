import { PH_ROWS, phRowIndex } from "./philhealth-table";
import { SSS_ROWS, sssRowIndex } from "./sss-table";

// ── SSS ── read straight from the company table (lib/sss-table.ts).
// Returns the EMPLOYEE TOTAL (Regular SS + MPF) of the salary's bracket.
// Salaries below 20,000 use the 20,000 bracket (company rule).
export function sssEmployeeShare(monthlySalary: number): number {
  const i = sssRowIndex(monthlySalary);

  return i < 0 ? 0 : SSS_ROWS[i].ee.total;
}

// ── PhilHealth ── read straight from the company table
// (lib/philhealth-table.ts). Returns the EMPLOYEE SHARE of the salary's bracket.
export function philhealthEmployeeShare(monthlySalary: number): number {
  const i = phRowIndex(monthlySalary);

  return i < 0 ? 0 : PH_ROWS[i].employee;
}

// ── Pag-IBIG ── always 200
export const PAGIBIG_AMOUNT = 200;
