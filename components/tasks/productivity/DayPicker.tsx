import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localToday } from "@/lib/time";

const yesterdayOf = (today: string) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export default function DayPicker({
  date,
  onChange,
}: {
  date: string;
  onChange: (value: string) => void;
}) {
  const today = localToday();
  const yesterday = yesterdayOf(today);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-slate-700">
        Productivity day
      </span>
      <Button
        size="sm"
        type="button"
        variant={date === today ? "default" : "outline"}
        onClick={() => onChange(today)}
      >
        Today
      </Button>
      <Button
        size="sm"
        type="button"
        variant={date === yesterday ? "default" : "outline"}
        onClick={() => onChange(yesterday)}
      >
        Yesterday
      </Button>
      <Input
        aria-label="Pick a date"
        className="h-9 w-40"
        max={today}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        type="date"
        value={date}
      />
    </div>
  );
}
