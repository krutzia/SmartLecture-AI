import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Flame } from "lucide-react";

type Session = { minutes: number; created_at: string };

interface Props {
  sessions: Session[];
  weeks?: number;
}

// GitHub-style daily activity heatmap.
export const StudyHeatmap = ({ sessions, weeks = 12 }: Props) => {
  const { grid, monthLabels, totals } = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const totalDays = weeks * 7;

    // End on the most recent Saturday so columns align to weeks (Sun..Sat)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    const daysUntilSat = (6 - today.getDay() + 7) % 7;
    endDate.setDate(endDate.getDate() + daysUntilSat);

    const startDate = new Date(endDate.getTime() - (totalDays - 1) * dayMs);

    // Bucket sessions by yyyy-mm-dd
    const buckets = new Map<string, number>();
    sessions.forEach((s) => {
      const d = new Date(s.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      buckets.set(key, (buckets.get(key) ?? 0) + (Number(s.minutes) || 0));
    });

    // Build a [weeks][7] matrix, columns = weeks, rows = day-of-week (Sun..Sat)
    const grid: { date: Date; minutes: number; future: boolean; key: string }[][] = [];
    for (let w = 0; w < weeks; w++) {
      const col: { date: Date; minutes: number; future: boolean; key: string }[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(startDate.getTime() + (w * 7 + d) * dayMs);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        col.push({
          date,
          minutes: buckets.get(key) ?? 0,
          future: date.getTime() > today.getTime(),
          key,
        });
      }
      grid.push(col);
    }

    // Month labels: show month name on weeks where the first day is in a new month
    const monthLabels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    grid.forEach((col, i) => {
      const m = col[0].date.getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ col: i, label: col[0].date.toLocaleDateString(undefined, { month: "short" }) });
        lastMonth = m;
      }
    });

    // Totals
    let totalMinutes = 0;
    let activeDays = 0;
    grid.forEach((col) => col.forEach((cell) => {
      if (!cell.future && cell.minutes > 0) {
        activeDays += 1;
        totalMinutes += cell.minutes;
      }
    }));

    return { grid, monthLabels, totals: { totalMinutes, activeDays } };
  }, [sessions, weeks]);

  const colorFor = (minutes: number, future: boolean) => {
    if (future) return "bg-muted/30";
    if (minutes <= 0) return "bg-muted";
    if (minutes < 5) return "bg-primary/25";
    if (minutes < 15) return "bg-primary/50";
    if (minutes < 30) return "bg-primary/75";
    return "bg-primary";
  };

  return (
    <Card className="rounded-3xl border-border/50 p-6 shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-extrabold flex items-center gap-2">
            Study activity <Flame className="h-4 w-4 text-highlight" />
          </h3>
          <p className="text-xs text-muted-foreground">
            Last {weeks} weeks · {totals.activeDays} active day{totals.activeDays === 1 ? "" : "s"} · {Math.round(totals.totalMinutes)} min total
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>Less</span>
          <span className="h-2.5 w-2.5 rounded-sm bg-muted" />
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/25" />
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/50" />
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/75" />
          <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
          <span>More</span>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <TooltipProvider delayDuration={100}>
          <div className="inline-block min-w-full">
            {/* Month labels row */}
            <div className="ml-7 flex gap-[3px] pb-1.5 text-[10px] text-muted-foreground">
              {grid.map((_, i) => {
                const label = monthLabels.find((m) => m.col === i)?.label;
                return (
                  <div key={i} className="w-[14px]">
                    {label ?? ""}
                  </div>
                );
              })}
            </div>

            <div className="flex">
              {/* Day-of-week labels (show Mon, Wed, Fri) */}
              <div className="mr-1.5 flex flex-col gap-[3px] pt-[1px] text-[10px] text-muted-foreground">
                {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
                  <div key={i} className="h-[14px] leading-[14px]">{d}</div>
                ))}
              </div>

              {/* Grid */}
              <div className="flex gap-[3px]">
                {grid.map((col, ci) => (
                  <div key={ci} className="flex flex-col gap-[3px]">
                    {col.map((cell) => (
                      <Tooltip key={cell.key}>
                        <TooltipTrigger asChild>
                          <div
                            className={`h-[14px] w-[14px] rounded-sm transition-transform hover:scale-125 ${colorFor(cell.minutes, cell.future)}`}
                            aria-label={`${cell.minutes} minutes on ${cell.key}`}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <div className="font-semibold">
                            {cell.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                          </div>
                          <div className="text-muted-foreground">
                            {cell.future ? "—" : cell.minutes > 0 ? `${Math.round(cell.minutes * 10) / 10} min` : "No activity"}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TooltipProvider>
      </div>
    </Card>
  );
};
