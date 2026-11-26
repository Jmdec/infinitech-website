// PhilHealth table, pasted as-is from the company sheet.
// To change a rate later, edit the line below; the parser reads the rest.
// Columns: bracket | salary range | salary base | total monthly premium |
// employee share | employer share.
// (Bracket 1 range was typed "8,99.99" in the sheet; it is 8,999.99.)
const RAW = `
1	8,999.99 and BELOW 		8,000.00	500.00	250.00	250.00
2	9,000 - 9,999.99		9,000.00	500.00	250.00	250.00
3	10,000 - 10,999.99		10,000.00	500.00	250.00	250.00
4	11,000 - 11,999.99		11,000.00	550.00	275.00	275.00
5	12,000 - 12,999.99		12,000.00	600.00	300.00	300.00
6	13,000 - 13,999.99		13,000.00	650.00	325.00	325.00
7	14,000 - 14,999.99		14,000.00	700.00	350.00	350.00
8	15,000 - 15,999.99		15,000.00	750.00	375.00	375.00
9	16,000 - 16,999.99		16,000.00	800.00	400.00	400.00
10	17,000 - 17,999.99		17,000.00	850.00	425.00	425.00
11	18,000 - 18,999.99		18,000.00	900.00	450.00	450.00
12	19,000 - 19,999.99		19,000.00	950.00	475.00	475.00
13	20,000 - 20,999.99		20,000.00	1,000.00	500.00	500.00
14	21,000 - 21,999.99		21,000.00	1,050.00	525.00	525.00
15	22,000 - 22,999.99		22,000.00	1,100.00	550.00	550.00
16	23,000 - 23,999.99		23,000.00	1,150.00	575.00	575.00
17	24,000 - 24,999.99		24,000.00	1,200.00	600.00	600.00
18	25,000 - 25,999.99		25,000.00	1,250.00	625.00	625.00
19	26,000 - 26,999.99		26,000.00	1,300.00	650.00	650.00
20	27,000 - 27,999.99		27,000.00	1,350.00	675.00	675.00
21	28,000 - 28,999.99		28,000.00	1,400.00	700.00	700.00
22	29,000 - 29,999.99		29,000.00	1,450.00	725.00	725.00
23	30,000 - 30,999.99		30,000.00	1,500.00	750.00	750.00
24	31,000 - 31,999.99		31,000.00	1,550.00	775.00	775.00
25	32,000 - 32,999.99		32,000.00	1,600.00	800.00	800.00
26	33,000 - 33,999.99		33,000.00	1,650.00	825.00	825.00
27	34,000 - 34,999.99		34,000.00	1,700.00	850.00	850.00
28	35,000 and Up		35,000.00	1,750.00	875.00	875.00
`;

export type PhilhealthRow = {
  bracket: number;
  label: string;
  min: number;
  base: number;
  premium: number;
  employee: number;
  employer: number;
};

const toNum = (t: string) => parseFloat(t.replace(/,/g, "")) || 0;

function parsePhilhealthTable(raw: string): PhilhealthRow[] {
  const rows: PhilhealthRow[] = [];

  for (const line of raw.split("\n")) {
    const m = line
      .trim()
      .match(
        /^(\d+)\s+(.*?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/,
      );

    if (!m) continue;

    const label = m[2].replace(/\s+/g, " ").trim();
    const first = label.match(/[\d,]+(?:\.\d+)?/);

    rows.push({
      bracket: Number(m[1]),
      label,
      // "…and BELOW" catches everything under the first bracket.
      min: /below/i.test(label) || !first ? 0 : toNum(first[0]),
      base: toNum(m[3]),
      premium: toNum(m[4]),
      employee: toNum(m[5]),
      employer: toNum(m[6]),
    });
  }

  return rows;
}

export const PH_ROWS: PhilhealthRow[] = parsePhilhealthTable(RAW);

// Index of the bracket for a monthly salary (-1 if there is no salary).
export function phRowIndex(monthlySalary: number): number {
  if (!(monthlySalary > 0)) return -1;

  let found = 0;

  PH_ROWS.forEach((row, i) => {
    if (monthlySalary >= row.min) found = i;
  });

  return found;
}
