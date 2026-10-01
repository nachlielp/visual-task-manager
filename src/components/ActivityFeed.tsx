import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { IconSparkle, IconUser } from "@/components/Icons";
import { Markdown } from "@/components/Markdown";
import { timeAgo, type ActivityItem } from "@/lib/tickets";
import { cn } from "@/lib/utils";

export function ActivityFeed({
  projectId,
  projectKey,
}: {
  projectId: Id<"projects">;
  projectKey: string;
}) {
  const items = useQuery(api.activity.forProject, { project_id: projectId, limit: 60 });
  return (
    <div className="card flex max-h-[calc(100dvh-6rem)] flex-col">
      <div className="kicker border-b-[1.5px] border-line px-4 py-3 text-muted">Activity</div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {items === undefined ? (
          <div className="p-3 text-sm text-muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-3 text-sm text-muted">Nothing yet.</div>
        ) : (
          <ul className="flex flex-col">
            {items.map((a) => (
              <ActivityRow key={a._id} item={a} projectKey={projectKey} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ActorIcon({ actor }: { actor: ActivityItem["actor"] }) {
  return actor === "claude" ? (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-tint text-brand">
      <IconSparkle />
    </span>
  ) : (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-paper-dark text-muted">
      <IconUser />
    </span>
  );
}

function ActivityRow({ item: a, projectKey }: { item: ActivityItem; projectKey: string }) {
  const number = a.ticket_ref?.split("-").pop();
  return (
    <li className="flex gap-2.5 rounded-md px-2 py-2 hover:bg-paper-dark/50">
      <ActorIcon actor={a.actor} />
      <div className="min-w-0 flex-1 text-[13px] leading-snug">
        <div className="flex items-baseline gap-1.5">
          <span className="font-bold">{a.actor === "claude" ? "Claude" : "You"}</span>
          {a.kind === "comment" && a.ticket_ref && (
            <span className="text-muted">
              on{" "}
              <TicketLink projectKey={projectKey} number={number} label={a.ticket_ref} />
            </span>
          )}
          <span className="ml-auto shrink-0 text-[11px] font-semibold text-muted">
            {timeAgo(a.created_at)}
          </span>
        </div>
        {a.kind === "comment" ? (
          <Markdown className="mt-1 rounded-md border-[1.5px] border-line bg-white px-2.5 py-1.5 text-[13px]">
            {a.message}
          </Markdown>
        ) : (
          <div className={cn("text-muted")}>
            <Linkified text={a.message} refId={a.ticket_ref} projectKey={projectKey} />
          </div>
        )}
      </div>
    </li>
  );
}

function TicketLink({
  projectKey,
  number,
  label,
}: {
  projectKey: string;
  number?: string;
  label: string;
}) {
  if (!number || !label.startsWith(`${projectKey}-`)) return <span className="font-bold">{label}</span>;
  return (
    <Link to={`/p/${projectKey}/t/${number}`} className="font-bold text-brand hover:underline">
      {label}
    </Link>
  );
}

/** Turns the first occurrence of the ticket ref in an event message into a link. */
function Linkified({
  text,
  refId,
  projectKey,
}: {
  text: string;
  refId?: string;
  projectKey: string;
}) {
  if (!refId) return <>{text}</>;
  const i = text.indexOf(refId);
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <TicketLink projectKey={projectKey} number={refId.split("-").pop()} label={refId} />
      {text.slice(i + refId.length)}
    </>
  );
}
