import { IconChecklist, IconLink, IconLock, IconSparkle } from "@/components/Icons";
import { PRIORITY_STYLE, timeAgo, type TicketSummary } from "@/lib/tickets";
import { cn } from "@/lib/utils";

export function TicketCard({
  ticket: t,
  dragging,
  className,
}: {
  ticket: TicketSummary;
  dragging?: boolean;
  className?: string;
}) {
  const blocked = t.blocked_by.length > 0 && t.status !== "done";
  const pct = t.checklist.total ? (t.checklist.done / t.checklist.total) * 100 : 0;
  return (
    <div
      className={cn(
        "card flex cursor-grab flex-col gap-2 p-3 text-left select-none",
        dragging && "rotate-[1.5deg] shadow-[0_6px_0_rgba(0,0,0,0.12)]",
        t.status === "done" && "opacity-75",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide text-muted">
        <span>{t.ref}</span>
        {t.created_by === "claude" && (
          <IconSparkle className="text-brand" aria-label="Created by Claude" />
        )}
        {t.priority !== "medium" && (
          <span
            className={cn(
              "ml-auto rounded-[4px] border-[1.5px] px-1.5 text-[10px] uppercase leading-4",
              PRIORITY_STYLE[t.priority],
            )}
          >
            {t.priority}
          </span>
        )}
      </div>
      <div
        className={cn(
          "text-sm font-semibold leading-snug",
          t.status === "done" && "line-through decoration-line-strong",
        )}
      >
        {t.title}
      </div>
      {t.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {t.labels.map((l) => (
            <span
              key={l}
              className="rounded-[4px] bg-paper-dark px-1.5 py-px text-[11px] font-bold text-muted"
            >
              {l}
            </span>
          ))}
        </div>
      )}
      {blocked && (
        <div className="flex items-center gap-1 rounded-[5px] border-[1.5px] border-danger/25 bg-danger-tint px-1.5 py-0.5 text-[11px] font-bold text-danger">
          <IconLock />
          Blocked by {t.blocked_by.map((b) => b.ref).join(", ")}
        </div>
      )}
      <div className="flex items-center gap-3 text-[11px] font-bold text-muted">
        {t.checklist.total > 0 && (
          <span
            className={cn(
              "flex items-center gap-1",
              t.checklist.done === t.checklist.total && "text-success",
            )}
          >
            <IconChecklist />
            {t.checklist.done}/{t.checklist.total}
            <span className="ml-0.5 h-1.5 w-10 overflow-hidden rounded-sm bg-paper-dark">
              <span
                className={cn(
                  "block h-full",
                  t.checklist.done === t.checklist.total ? "bg-success" : "bg-brand",
                )}
                style={{ width: `${pct}%` }}
              />
            </span>
          </span>
        )}
        {t.depends_on_count + t.blocks_count > 0 && (
          <span className="flex items-center gap-1" title="Linked tickets">
            <IconLink />
            {t.depends_on_count + t.blocks_count}
          </span>
        )}
        <span className="ml-auto font-semibold">{timeAgo(t.updated_at)}</span>
      </div>
    </div>
  );
}
