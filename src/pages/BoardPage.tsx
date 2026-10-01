import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button, Input, useToast } from "@/components/ui";
import {
  IconActivity,
  IconArrowLeft,
  IconPlus,
  IconSearch,
  IconSettings,
  IconX,
} from "@/components/Icons";
import { TicketCard } from "@/components/TicketCard";
import { TicketDialog } from "@/components/TicketDialog";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ProjectSettingsModal } from "@/components/ProjectSettingsModal";
import {
  STATUSES,
  STATUS_DOT,
  STATUS_LABELS,
  errorText,
  type Status,
  type TicketSummary,
} from "@/lib/tickets";
import { cn } from "@/lib/utils";

const ACTIVITY_PREF = "vtm.showActivity";

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Prefer the card under the pointer (drop before it); otherwise the column.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const card = hits.find((h) => String(h.id).startsWith("card:"));
  if (card) return [card];
  return hits.length ? hits : rectIntersection(args);
};

/**
 * Dropping on a card means "take its place": cards dragged downwards within
 * their own column land after the target, everything else lands before it.
 */
function dropTarget(column: TicketSummary[], activeId: string, targetId: string) {
  const from = column.findIndex((t) => t._id === activeId);
  const to = column.findIndex((t) => t._id === targetId);
  if (from !== -1 && from < to) {
    return { before: column[to + 1]?._id ?? null, below: true };
  }
  return { before: targetId as Id<"tickets">, below: false };
}

export default function BoardPage() {
  const { key = "", number } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  useNow();

  const project = useQuery(api.projects.getByKey, { key });
  const tickets = useQuery(
    api.tickets.board,
    project ? { project_id: project._id } : "skip",
  );
  const projectId = project?._id;

  const move = useMutation(api.tickets.move).withOptimisticUpdate(
    (store, { ticket_id, status, before_id }) => {
      if (!projectId) return;
      const args = { project_id: projectId };
      const cur = store.getQuery(api.tickets.board, args);
      if (!cur) return;
      const col = cur
        .filter((t) => t.status === status && t._id !== ticket_id)
        .sort((a, b) => a.order - b.order);
      const idx = before_id ? col.findIndex((t) => t._id === before_id) : -1;
      let order: number;
      if (idx === -1) order = col.length ? col[col.length - 1].order + 1 : 0;
      else order = idx > 0 ? (col[idx - 1].order + col[idx].order) / 2 : col[idx].order - 1;
      store.setQuery(
        api.tickets.board,
        args,
        cur.map((t) => (t._id === ticket_id ? { ...t, status, order } : t)),
      );
    },
  );

  const [search, setSearch] = useState("");
  const [label, setLabel] = useState<string | null>(null);
  const [showActivity, setShowActivity] = useState(() => {
    try {
      return localStorage.getItem(ACTIVITY_PREF) !== "0";
    } catch {
      return true;
    }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const toggleActivity = () => {
    setShowActivity((v) => {
      try {
        localStorage.setItem(ACTIVITY_PREF, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );

  const allLabels = useMemo(
    () => [...new Set((tickets ?? []).flatMap((t) => t.labels))].sort(),
    [tickets],
  );

  const columns = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = Object.fromEntries(STATUSES.map((s) => [s, [] as TicketSummary[]])) as Record<
      Status,
      TicketSummary[]
    >;
    for (const t of tickets ?? []) {
      if (label && !t.labels.includes(label)) continue;
      if (q && !t.title.toLowerCase().includes(q) && !t.ref.toLowerCase().includes(q)) continue;
      map[t.status].push(t);
    }
    for (const s of STATUSES) map[s].sort((a, b) => a.order - b.order);
    return map;
  }, [tickets, search, label]);

  if (project === undefined) {
    return <div className="p-10 text-center text-sm font-semibold text-muted">Loading…</div>;
  }
  if (project === null) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">No project “{key}”</h1>
        <Button asChild className="mt-6">
          <Link to="/">
            <IconArrowLeft /> All projects
          </Link>
        </Button>
      </div>
    );
  }

  const byId = new Map((tickets ?? []).map((t) => [t._id, t]));
  const active = activeId ? byId.get(activeId as Id<"tickets">) : undefined;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    setOverId(null);
    const ticket = byId.get(String(e.active.id) as Id<"tickets">);
    const over = e.over ? String(e.over.id) : null;
    if (!ticket || !over) return;
    let status: Status;
    let before: Id<"tickets"> | null = null;
    if (over.startsWith("card:")) {
      const target = byId.get(over.slice(5) as Id<"tickets">);
      if (!target || target._id === ticket._id) return;
      status = target.status;
      const drop = dropTarget(columns[status], ticket._id, target._id);
      before = drop.before;
    } else {
      status = over.slice(4) as Status;
      const col = columns[status];
      if (status === ticket.status && col[col.length - 1]?._id === ticket._id) return;
    }
    move({ ticket_id: ticket._id, status, before_id: before }).catch((err) =>
      toast(errorText(err), "danger"),
    );
  };

  const openTicket = (t: TicketSummary) => navigate(`/p/${project.key}/t/${t.number}`);

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0">
            <div className="kicker truncate font-mono normal-case tracking-normal text-muted">
              {project.repo}
            </div>
            <h1 className="flex items-center gap-2 truncate text-3xl font-extrabold tracking-tight">
              {project.name}
              <span className="rounded-md border-[1.5px] border-brand/30 bg-tint px-2 py-0.5 text-xs font-extrabold text-brand">
                {project.key}
              </span>
            </h1>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter tickets"
                className="w-44 pl-8"
              />
            </div>
            <Button
              variant={showActivity ? "primary" : "secondary"}
              onClick={toggleActivity}
              aria-pressed={showActivity}
            >
              <IconActivity /> Activity
            </Button>
            <Button onClick={() => setSettingsOpen(true)} aria-label="Project settings">
              <IconSettings />
            </Button>
          </div>
        </div>
        {allLabels.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="kicker mr-1 text-muted">Labels</span>
            {allLabels.map((l) => (
              <button
                key={l}
                onClick={() => setLabel(label === l ? null : l)}
                className={cn(
                  "rounded-md border-[1.5px] px-2 py-0.5 text-xs font-bold",
                  label === l
                    ? "border-brand/30 bg-tint text-brand"
                    : "border-line bg-white text-muted hover:bg-paper-dark",
                )}
              >
                {l}
              </button>
            ))}
            {label && (
              <button className="btn-ghost h-7 px-2" onClick={() => setLabel(null)}>
                <IconX /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] gap-4 px-4 pt-4 pb-2">
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          onDragStart={onDragStart}
          onDragOver={(e) => setOverId(e.over ? String(e.over.id) : null)}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            setOverId(null);
          }}
        >
          <div className="flex min-w-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto pb-4 md:snap-none">
            {STATUSES.map((s) => (
              <Column
                key={s}
                status={s}
                tickets={columns[s]}
                projectId={project._id}
                overId={overId}
                activeId={activeId}
                onOpen={openTicket}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {active ? <TicketCard ticket={active} dragging className="w-[272px]" /> : null}
          </DragOverlay>
        </DndContext>

        {showActivity && (
          <aside className="hidden w-80 shrink-0 lg:block">
            <div className="sticky top-[4.5rem]">
              <ActivityFeed projectId={project._id} projectKey={project.key} />
            </div>
          </aside>
        )}
      </div>
      {showActivity && (
        <div className="px-4 pb-4 lg:hidden">
          <ActivityFeed projectId={project._id} projectKey={project.key} />
        </div>
      )}

      {number && (
        <TicketDialog
          refId={`${project.key}-${number}`}
          projectId={project._id}
          onClose={() => navigate(`/p/${project.key}`)}
        />
      )}
      <ProjectSettingsModal
        project={project}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
}

function Column({
  status,
  tickets,
  projectId,
  overId,
  activeId,
  onOpen,
}: {
  status: Status;
  tickets: TicketSummary[];
  projectId: Id<"projects">;
  overId: string | null;
  activeId: string | null;
  onOpen: (t: TicketSummary) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `col:${status}` });
  const isOver = overId === `col:${status}`;
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-[288px] shrink-0 snap-start flex-col rounded-[10px] border-[1.5px] border-line bg-paper-dark/50 p-2 transition-colors",
        isOver && activeId && "border-brand/40 bg-tint/60",
      )}
    >
      <header className="flex items-center gap-2 px-1.5 pt-1 pb-2">
        <span className={cn("h-2.5 w-2.5 rounded-[3px]", STATUS_DOT[status])} />
        <h2 className="kicker text-ink">{STATUS_LABELS[status]}</h2>
        <span className="text-xs font-bold text-muted">{tickets.length}</span>
      </header>
      <div className="flex min-h-16 flex-1 flex-col gap-2">
        {tickets.map((t) => (
          <DraggableCard
            key={t._id}
            ticket={t}
            dropLine={
              overId === `card:${t._id}` && activeId && activeId !== t._id
                ? dropTarget(tickets, activeId, t._id).below
                  ? "below"
                  : "above"
                : null
            }
            onOpen={onOpen}
          />
        ))}
        {tickets.length === 0 && (
          <div className="rounded-md border-[1.5px] border-dashed border-line-strong/70 px-3 py-4 text-center text-xs font-semibold text-muted">
            Nothing here
          </div>
        )}
      </div>
      <QuickAdd status={status} projectId={projectId} />
    </section>
  );
}

function DraggableCard({
  ticket,
  dropLine,
  onOpen,
}: {
  ticket: TicketSummary;
  dropLine: "above" | "below" | null;
  onOpen: (t: TicketSummary) => void;
}) {
  const drag = useDraggable({ id: ticket._id });
  const drop = useDroppable({ id: `card:${ticket._id}` });
  return (
    <div ref={drop.setNodeRef} className="relative">
      {dropLine && (
        <div
          className={cn(
            "absolute right-1 left-1 z-10 h-[3px] rounded-sm bg-brand",
            dropLine === "above" ? "-top-[5px]" : "-bottom-[5px]",
          )}
        />
      )}
      <div
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        role="button"
        tabIndex={0}
        onClick={() => onOpen(ticket)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen(ticket);
        }}
        className={cn(
          "rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-brand",
          drag.isDragging && "opacity-30",
        )}
      >
        <TicketCard ticket={ticket} />
      </div>
    </div>
  );
}

function QuickAdd({ status, projectId }: { status: Status; projectId: Id<"projects"> }) {
  const create = useMutation(api.tickets.create);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await create({ project_id: projectId, title, status });
      setTitle("");
    } catch (err) {
      toast(errorText(err), "danger");
    }
  };

  if (!open) {
    return (
      <button className="btn-ghost mt-2 justify-start" onClick={() => setOpen(true)}>
        <IconPlus /> Add ticket
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-2">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ticket title"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={!title.trim()}>
          Add
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
