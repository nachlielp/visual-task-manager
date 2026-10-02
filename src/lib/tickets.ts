import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type ProjectView = FunctionReturnType<typeof api.projects.list>[number];
export type TicketSummary = FunctionReturnType<typeof api.tickets.board>[number];
export type TicketDetail = NonNullable<FunctionReturnType<typeof api.tickets.get>>;
export type ActivityItem = FunctionReturnType<typeof api.activity.forProject>[number];
export type Status = TicketSummary["status"];
export type Priority = TicketSummary["priority"];

export const STATUSES: Status[] = ["backlog", "todo", "in_progress", "review", "done"];

export const STATUS_LABELS: Record<Status, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};

export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

/** Column header dot colors (from the token palette). */
export const STATUS_DOT: Record<Status, string> = {
  backlog: "bg-line-strong",
  todo: "bg-muted",
  in_progress: "bg-brand",
  review: "bg-[#e8c468]",
  done: "bg-success",
};

export const PRIORITY_STYLE: Record<Priority, string> = {
  low: "border-line bg-paper-dark text-muted",
  medium: "border-line-strong bg-white text-ink",
  high: "border-[#e8c468] bg-[#fbf3da] text-[#4a3a0a]",
  urgent: "border-danger/30 bg-danger-tint text-danger",
};

/** Built-in labels saying who can resolve a ticket (mirrors convex/model.ts). */
export const FIX_LABELS = [
  {
    label: "code-fix",
    name: "Code fix",
    hint: "Claude can do it all",
    style: "border-success/30 bg-success-tint text-success-dark",
  },
  {
    label: "config-fix",
    name: "Config fix",
    hint: "Needs you",
    style: "border-[#f0a868] bg-[#fdebdc] text-[#7a3a08]",
  },
] as const;

export const isFixLabel = (l: string) => FIX_LABELS.some((f) => f.label === l);

/** Chip colors for a label: fix labels get their own, the rest are neutral. */
export function labelStyle(l: string): string {
  return FIX_LABELS.find((f) => f.label === l)?.style ?? "border-transparent bg-paper-dark text-muted";
}

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function errorText(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data: unknown }).data;
    if (typeof data === "string") return data;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}
