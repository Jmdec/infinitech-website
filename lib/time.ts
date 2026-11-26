// lib/time.ts
export const MANILA_TZ = "Asia/Manila";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MANILA_OFFSET = 8 * HOUR;

export const CUTOFF_HOUR = 17;
export const CUTOFF_MINUTE = 30;
export const WORK_START_HOUR = 8;

// Server timestamps with no zone are treated as Manila time (+08:00).
// Timestamps that already have Z or an offset are left alone.
export const parseServerDate = (value: string) => {
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return new Date(hasZone ? iso : `${iso}+08:00`);
};

// Use this for every server timestamp instead of Date.parse().
export const serverMs = (value: string) => parseServerDate(value).getTime();

// "2026-11-12" in Manila, no matter the browser timezone.
export const localToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TZ }).format(new Date());

// Manila midnight of the day that contains `ms`, as a UTC timestamp.
export const manilaDayStart = (ms: number) =>
  Math.floor((ms + MANILA_OFFSET) / DAY) * DAY - MANILA_OFFSET;

export const isAfterCutoff = (ms: number) => {
  const d = new Date(ms + MANILA_OFFSET); // read with getUTC* = Manila time
  const h = d.getUTCHours();
  return (
    h > CUTOFF_HOUR || (h === CUTOFF_HOUR && d.getUTCMinutes() >= CUTOFF_MINUTE)
  );
};

// Only 8:00 AM to 5:30 PM Manila time counts, for every viewer.
export const workMsBetween = (startMs: number, endMs: number) => {
  if (endMs <= startMs) return 0;
  let total = 0;
  for (let day = manilaDayStart(startMs); day <= endMs; day += DAY) {
    const winStart = day + WORK_START_HOUR * HOUR;
    const winEnd = day + (CUTOFF_HOUR * 60 + CUTOFF_MINUTE) * 60_000;
    const s = Math.max(startMs, winStart);
    const e = Math.min(endMs, winEnd);
    if (e > s) total += e - s;
  }
  return total;
};
