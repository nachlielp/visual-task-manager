import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useConfirm,
  useToast,
} from "@/components/ui";
import {
  IconChecklist,
  IconLock,
  IconPencil,
  IconPlus,
  IconSparkle,
  IconSubitem,
  IconTrash,
  IconX,
} from "@/components/Icons";
import { Markdown } from "@/components/Markdown";
import { ActorIcon } from "@/components/ActivityFeed";
import {
  FIX_LABELS,
  PRIORITIES,
  PRIORITY_STYLE,
  STATUSES,
  STATUS_DOT,
  STATUS_LABELS,
  errorText,
  isFixLabel,
  timeAgo,
  type Priority,
  type Status,
  type TicketDetail,
} from "@/lib/tickets";
import { cn } from "@/lib/utils";

export function TicketDialog({
  refId,
  projectId,
  onClose,
}: {
  refId: string;
  projectId: Id<"projects">;
  onClose: () => void;
}) {
  const ticket = useQuery(api.tickets.get, { ref: refId });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] max-w-[min(900px,100%)] overflow-y-auto p-0"
        aria-describedby={undefined}
        onEscapeKeyDown={(e) => {
          // Escape first leaves an inline editor; a second Escape closes the dialog.
          const el = document.activeElement;
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            e.preventDefault();
            // Let the input's own Escape handler run (cancel edit), then drop focus.
            window.setTimeout(() => el.blur(), 0);
          }
        }}
      >
        {ticket === undefined ? (
          <div className="p-8 text-sm font-semibold text-muted">
            <DialogTitle className="sr-only">Loading ticket</DialogTitle>
            Loading…
          </div>
        ) : ticket === null ? (
          <div className="p-8">
            <DialogTitle>Ticket {refId} not found</DialogTitle>
            <DialogDescription className="mt-1">It may have been deleted.</DialogDescription>
          </div>
        ) : (
          <TicketBody ticket={ticket} projectId={projectId} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function useAction() {
  const { toast } = useToast();
  return (p: Promise<unknown>) => p.catch((err) => toast(errorText(err), "danger"));
}

function TicketBody({
  ticket: t,
  projectId,
  onClose,
}: {
  ticket: TicketDetail;
  projectId: Id<"projects">;
  onClose: () => void;
}) {
  const update = useMutation(api.tickets.update);
  const remove = useMutation(api.tickets.remove);
  const confirm = useConfirm();
  const run = useAction();

  const destroy = async () => {
    const ok = await confirm({
      title: `Delete ${t.ref}?`,
      description: "Its checklist, links and activity are deleted too.",
      confirmText: "Delete ticket",
      variant: "danger",
    });
    if (!ok) return;
    onClose();
    await run(remove({ ticket_id: t._id }));
  };

  return (
    <div className="flex flex-col">
      <div className="border-b-[1.5px] border-line px-5 pt-5 pb-4 pr-14">
        <div className="kicker flex items-center gap-1.5 text-muted">
          <Link to={`/p/${t.project_key}`} className="hover:text-brand">
            {t.project_name}
          </Link>
          <span>/</span>
          <span className="text-brand">{t.ref}</span>
          {t.created_by === "claude" && (
            <span className="flex items-center gap-1 normal-case tracking-normal text-brand">
              <IconSparkle /> by Claude
            </span>
          )}
        </div>
        <EditableTitle
          value={t.title}
          onSave={(title) => run(update({ ticket_id: t._id, title }))}
        />
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-[1fr_230px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Description ticket={t} />
          <Checklist ticket={t} />
          <ActivitySection ticket={t} />
        </div>

        <aside className="flex flex-col gap-5">
          <Field label="Status">
            <Select
              value={t.status}
              onValueChange={(status) =>
                run(update({ ticket_id: t._id, status: status as Status }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-[3px]", STATUS_DOT[s])} />
                      {STATUS_LABELS[s]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              value={t.priority}
              onValueChange={(priority) =>
                run(update({ ticket_id: t._id, priority: priority as Priority }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span
                      className={cn(
                        "rounded-[4px] border-[1.5px] px-1.5 text-[11px] font-bold uppercase",
                        PRIORITY_STYLE[p],
                      )}
                    >
                      {p}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <FixType ticket={t} />
          <Labels ticket={t} />
          <Dependencies ticket={t} projectId={projectId} />
          <div className="flex flex-col gap-1 text-xs font-semibold text-muted">
            <span>Created {timeAgo(t.created_at)}</span>
            <span>Updated {timeAgo(t.updated_at)}</span>
            {t.completed_at && <span>Completed {timeAgo(t.completed_at)}</span>}
          </div>
          <Button variant="ghost-danger" className="justify-start" onClick={destroy}>
            <IconTrash /> Delete ticket
          </Button>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="kicker text-muted">{label}</div>
      {children}
    </div>
  );
}

function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <form
        className="mt-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() && draft !== value) onSave(draft);
          setEditing(false);
        }}
      >
        <DialogTitle className="sr-only">{value}</DialogTitle>
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft.trim() && draft !== value) onSave(draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setDraft(value);
              setEditing(false);
            }
          }}
          className="text-lg font-bold"
        />
      </form>
    );
  }
  return (
    <DialogTitle asChild>
      <h2
        className="mt-1 cursor-text text-xl font-extrabold tracking-tight hover:text-brand sm:text-2xl"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Click to edit"
      >
        {value}
      </h2>
    </DialogTitle>
  );
}

function SectionHeader({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      {icon && <span className="text-muted">{icon}</span>}
      <h3 className="kicker text-ink">{title}</h3>
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </div>
  );
}

function Description({ ticket: t }: { ticket: TicketDetail }) {
  const update = useMutation(api.tickets.update);
  const run = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <section>
      <SectionHeader title="Description">
        {!editing && (
          <button
            className="btn-ghost h-8"
            onClick={() => {
              setDraft(t.description ?? "");
              setEditing(true);
            }}
          >
            <IconPencil /> Edit
          </button>
        )}
      </SectionHeader>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            autoFocus
            rows={8}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Markdown supported"
            className="font-mono text-[13px]"
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => {
                run(update({ ticket_id: t._id, description: draft }));
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : t.description ? (
        <Markdown>{t.description}</Markdown>
      ) : (
        <button
          className="w-full rounded-md border-[1.5px] border-dashed border-line-strong px-3 py-3 text-left text-sm text-muted hover:bg-paper-dark/50"
          onClick={() => {
            setDraft("");
            setEditing(true);
          }}
        >
          Add a description…
        </button>
      )}
    </section>
  );
}

type Item = TicketDetail["checklist_items"][number];

function Checklist({ ticket: t }: { ticket: TicketDetail }) {
  const add = useMutation(api.checklist.add);
  const run = useAction();
  const [text, setText] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const { done, total } = t.checklist;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // When hiding finished steps, keep a done parent visible if it has open children.
  const items = t.checklist_items;
  const hasOpenDescendant = (i: number) => {
    for (let j = i + 1; j < items.length && items[j].depth > items[i].depth; j++) {
      if (!items[j].done) return true;
    }
    return false;
  };
  const visible = hideDone
    ? items.filter((it, i) => !it.done || hasOpenDescendant(i))
    : items;

  return (
    <section>
      <SectionHeader icon={<IconChecklist />} title="Checklist">
        {total > 0 && (
          <span className="mr-1 text-xs font-bold text-muted">
            {done}/{total}
          </span>
        )}
        {done > 0 && (
          <button className="btn-ghost h-8" onClick={() => setHideDone((v) => !v)}>
            {hideDone ? "Show done" : "Hide done"}
          </button>
        )}
      </SectionHeader>
      {total > 0 && (
        <div className="mb-3 h-2 overflow-hidden rounded-sm bg-paper-dark">
          <div
            className={cn("h-full transition-all", pct === 100 ? "bg-success" : "bg-brand")}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <ul className="flex flex-col">
        {visible.map((item) => (
          <ChecklistRow key={item._id} item={item} ticketId={t._id} />
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          run(add({ ticket_id: t._id, text }));
          setText("");
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a step" />
        <Button type="submit" disabled={!text.trim()}>
          <IconPlus /> Add
        </Button>
      </form>
    </section>
  );
}

function ChecklistRow({ item, ticketId }: { item: Item; ticketId: Id<"tickets"> }) {
  const update = useMutation(api.checklist.update).withOptimisticUpdate((store, args) => {
    // Toggle instantly; the server result replaces this a moment later.
    for (const q of store.getAllQueries(api.tickets.get)) {
      if (!q.value) continue;
      store.setQuery(api.tickets.get, q.args, {
        ...q.value,
        checklist_items: q.value.checklist_items.map((i) =>
          i._id === args.item_id ? { ...i, done: args.done ?? i.done, text: args.text ?? i.text } : i,
        ),
      });
    }
  });
  const add = useMutation(api.checklist.add);
  const remove = useMutation(api.checklist.remove);
  const run = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [adding, setAdding] = useState(false);
  const [subText, setSubText] = useState("");

  const saveText = () => {
    if (draft.trim() && draft !== item.text) run(update({ item_id: item._id, text: draft }));
    setEditing(false);
  };

  return (
    <li style={{ paddingLeft: item.depth * 22 }}>
      <div className="group flex min-h-9 items-start gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-paper-dark/50">
        <Checkbox
          className="mt-0.5"
          checked={item.done}
          onCheckedChange={(v) => run(update({ item_id: item._id, done: v === true }))}
          aria-label={item.done ? "Mark not done" : "Mark done"}
        />
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveText}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveText();
              if (e.key === "Escape") {
                e.stopPropagation();
                setDraft(item.text);
                setEditing(false);
              }
            }}
            className="-my-1.5 h-8"
          />
        ) : (
          <span
            className={cn(
              "flex-1 cursor-text text-sm leading-5",
              item.done && "text-muted line-through decoration-line-strong",
            )}
            onClick={() => {
              setDraft(item.text);
              setEditing(true);
            }}
          >
            {item.text}
          </span>
        )}
        {!editing && (
          <div className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            <button
              className="btn-ghost h-6 w-6 p-0"
              title="Add sub-step"
              aria-label="Add sub-step"
              onClick={() => setAdding(true)}
            >
              <IconSubitem />
            </button>
            <button
              className="btn-ghost btn-ghost-danger h-6 w-6 p-0"
              title="Delete step"
              aria-label="Delete step"
              onClick={() => run(remove({ item_id: item._id }))}
            >
              <IconTrash />
            </button>
          </div>
        )}
      </div>
      {adding && (
        <form
          className="mt-1 mb-1 flex gap-2"
          style={{ paddingLeft: 22 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!subText.trim()) return;
            run(add({ ticket_id: ticketId, text: subText, parent_id: item._id }));
            setSubText("");
          }}
        >
          <Input
            autoFocus
            value={subText}
            onChange={(e) => setSubText(e.target.value)}
            placeholder="Sub-step"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setAdding(false);
              }
            }}
          />
          <Button type="submit" disabled={!subText.trim()}>
            Add
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
            <IconX />
          </Button>
        </form>
      )}
    </li>
  );
}

/** Code fix vs config fix: one of the built-in labels, or neither. */
function FixType({ ticket: t }: { ticket: TicketDetail }) {
  const update = useMutation(api.tickets.update);
  const run = useAction();
  const current = FIX_LABELS.find((f) => t.labels.includes(f.label))?.label;
  const pick = (label: string) => {
    const rest = t.labels.filter((l) => !isFixLabel(l));
    run(update({ ticket_id: t._id, labels: label === current ? rest : [label, ...rest] }));
  };
  return (
    <Field label="Fix">
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Fix type">
        {FIX_LABELS.map((f) => (
          <button
            key={f.label}
            role="radio"
            aria-checked={current === f.label}
            onClick={() => pick(f.label)}
            className={cn(
              "flex flex-col items-start rounded-md border-[1.5px] px-2 py-1 text-left text-xs font-bold",
              current === f.label ? f.style : "border-line bg-white text-muted hover:bg-paper-dark",
            )}
          >
            {f.name}
            <span className="text-[11px] font-semibold opacity-75">{f.hint}</span>
          </button>
        ))}
      </div>
    </Field>
  );
}

function Labels({ ticket: t }: { ticket: TicketDetail }) {
  const update = useMutation(api.tickets.update);
  const run = useAction();
  const [text, setText] = useState("");
  const set = (labels: string[]) => run(update({ ticket_id: t._id, labels }));
  // Fix labels are edited with FixType above.
  const shown = t.labels.filter((l) => !isFixLabel(l));
  return (
    <Field label="Labels">
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {shown.map((l) => (
            <span
              key={l}
              className="flex items-center gap-1 rounded-[5px] bg-paper-dark py-0.5 pr-1 pl-2 text-xs font-bold text-muted"
            >
              {l}
              <button
                aria-label={`Remove ${l}`}
                className="rounded-sm hover:text-danger"
                onClick={() => set(t.labels.filter((x) => x !== l))}
              >
                <IconX />
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          set([...t.labels, ...text.split(",")]);
          setText("");
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add label" />
      </form>
    </Field>
  );
}

function Dependencies({ ticket: t, projectId }: { ticket: TicketDetail; projectId: Id<"projects"> }) {
  const options = useQuery(api.tickets.options, { project_id: projectId });
  const addDep = useMutation(api.tickets.addDep);
  const removeDep = useMutation(api.tickets.removeDep);
  const run = useAction();

  const linked = new Set([t._id, ...t.depends_on.map((d) => d._id), ...t.blocks.map((b) => b._id)]);
  const candidates = (options ?? []).filter((o) => !linked.has(o._id));

  return (
    <>
      <Field label="Depends on">
        <LinkList
          links={t.depends_on}
          projectKey={t.project_key}
          onRemove={(id) => run(removeDep({ ticket_id: t._id, depends_on_id: id }))}
        />
        <LinkPicker
          placeholder="Add blocker…"
          options={candidates}
          onPick={(id) => run(addDep({ ticket_id: t._id, depends_on_id: id }))}
        />
      </Field>
      <Field label="Blocks">
        <LinkList
          links={t.blocks}
          projectKey={t.project_key}
          onRemove={(id) => run(removeDep({ ticket_id: id, depends_on_id: t._id }))}
        />
        <LinkPicker
          placeholder="Add dependent…"
          options={candidates}
          onPick={(id) => run(addDep({ ticket_id: id, depends_on_id: t._id }))}
        />
      </Field>
    </>
  );
}

function LinkList({
  links,
  projectKey,
  onRemove,
}: {
  links: TicketDetail["depends_on"];
  projectKey: string;
  onRemove: (id: Id<"tickets">) => void;
}) {
  if (!links.length) return null;
  return (
    <ul className="flex flex-col gap-1">
      {links.map((l) => {
        const [key, number] = l.ref.split("-");
        const open = l.status !== "done";
        return (
          <li
            key={l._id}
            className="group flex items-center gap-1.5 rounded-md border-[1.5px] border-line bg-white px-2 py-1 text-xs"
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-[2px]", STATUS_DOT[l.status])} />
            <Link
              to={`/p/${key ?? projectKey}/t/${number}`}
              className="min-w-0 flex-1 truncate font-semibold hover:text-brand"
              title={`${l.ref} · ${l.title} (${STATUS_LABELS[l.status]})`}
            >
              <span className="font-extrabold text-muted">{l.ref}</span>{" "}
              <span className={cn(!open && "text-muted line-through")}>{l.title}</span>
            </Link>
            <button
              aria-label={`Unlink ${l.ref}`}
              className="text-muted hover:text-danger"
              onClick={() => onRemove(l._id)}
            >
              <IconX />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function LinkPicker({
  placeholder,
  options,
  onPick,
}: {
  placeholder: string;
  options: TicketDetail["depends_on"];
  onPick: (id: Id<"tickets">) => void;
}) {
  if (!options.length) return null;
  return (
    <Select value="" onValueChange={(id) => onPick(id as Id<"tickets">)}>
      <SelectTrigger className="text-muted">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-64 overflow-y-auto">
        {options.map((o) => (
          <SelectItem key={o._id} value={o._id}>
            <span className="truncate">
              <span className="font-extrabold text-muted">{o.ref}</span> {o.title}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ActivitySection({ ticket: t }: { ticket: TicketDetail }) {
  const comment = useMutation(api.tickets.comment);
  const run = useAction();
  const [text, setText] = useState("");
  const blocked = t.blocked_by.length > 0 && t.status !== "done";
  return (
    <section>
      <SectionHeader title="Activity" />
      {blocked && (
        <div className="mb-3 flex items-center gap-2 rounded-md border-[1.5px] border-danger/25 bg-danger-tint px-3 py-2 text-sm font-semibold text-danger">
          <IconLock /> Waiting on {t.blocked_by.map((b) => b.ref).join(", ")}
        </div>
      )}
      <form
        className="mb-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          run(comment({ ticket_id: t._id, text }));
          setText("");
        }}
      >
        <Textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {text.trim() && (
          <div>
            <Button type="submit" variant="primary">
              Comment
            </Button>
          </div>
        )}
      </form>
      <ul className="flex flex-col gap-1">
        {t.activity.map((a) => (
          <li key={a._id} className="flex gap-2.5 py-1">
            <ActorIcon actor={a.actor} />
            <div className="min-w-0 flex-1 text-[13px]">
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold">{a.actor === "claude" ? "Claude" : "You"}</span>
                {a.kind === "event" && <span className="text-muted">{a.message}</span>}
                <span className="ml-auto shrink-0 text-[11px] font-semibold text-muted">
                  {timeAgo(a.created_at)}
                </span>
              </div>
              {a.kind === "comment" && (
                <Markdown className="mt-1 rounded-md border-[1.5px] border-line bg-white px-3 py-2 text-[13px]">
                  {a.message}
                </Markdown>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
