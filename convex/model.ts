// Domain logic shared by the web UI (Clerk-authenticated functions) and the
// MCP endpoint (API-key-authenticated). Every helper takes the owning
// `userId` explicitly and an `actor` so the activity feed can say who did it.
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type Status = Doc<"tickets">["status"];
export type Priority = Doc<"tickets">["priority"];
export type Actor = Doc<"activity">["actor"];

export const STATUSES: Status[] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
];
export const STATUS_LABELS: Record<Status, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};
export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

export type ChecklistInput = {
  text: string;
  done?: boolean;
  children?: ChecklistInput[];
};

export function fail(message: string): never {
  throw new ConvexError(message);
}

// --- Auth -----------------------------------------------------------------

export async function requireUserId(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) fail("Not authenticated");
  return identity.subject;
}

// --- Projects -------------------------------------------------------------

/** "git@github.com:Owner/Repo.git" / "https://github.com/owner/repo" → "owner/repo". */
export function normalizeRepo(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^git\+/, "").replace(/^[a-z]+:\/\//, "");
  s = s.replace(/^[^@/]+@/, ""); // user@ in ssh urls
  s = s.replace(/^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?[:/]/, ""); // host
  s = s.replace(/\.git$/, "").replace(/\/+$/, "").replace(/^\/+/, "");
  if (!s) fail("repo must not be empty");
  return s;
}

function deriveKeyBase(name: string): string {
  const words = name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^a-zA-Z]/g, ""))
    .filter(Boolean);
  let key =
    words.length >= 2
      ? words
          .slice(0, 4)
          .map((w) => w[0])
          .join("")
      : (words[0] ?? "").slice(0, 4);
  key = key.toUpperCase();
  return key.length >= 2 ? key : "PRJ";
}

async function keyTaken(ctx: QueryCtx, userId: string, key: string) {
  const existing = await ctx.db
    .query("projects")
    .withIndex("by_user_key", (q) => q.eq("user_id", userId).eq("key", key))
    .first();
  return existing !== null;
}

async function uniqueKey(ctx: QueryCtx, userId: string, base: string) {
  if (!(await keyTaken(ctx, userId, base))) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}${i}`;
    if (!(await keyTaken(ctx, userId, candidate))) return candidate;
  }
}

function validateKey(key: string): string {
  const k = key.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(k)) {
    fail("key must be 2–10 letters/digits, starting with a letter (e.g. VTM)");
  }
  return k;
}

export async function findProjectByRepo(
  ctx: QueryCtx,
  userId: string,
  repo: string,
) {
  return await ctx.db
    .query("projects")
    .withIndex("by_user_repo", (q) =>
      q.eq("user_id", userId).eq("repo", normalizeRepo(repo)),
    )
    .first();
}

/** Accepts a project key ("VTM"), a repo ("owner/name" or a git URL) or an id. */
export async function resolveProject(
  ctx: QueryCtx,
  userId: string,
  ref: string,
): Promise<Doc<"projects">> {
  const r = ref.trim();
  if (!r) fail("project is required");
  const id = ctx.db.normalizeId("projects", r);
  if (id) {
    const p = await ctx.db.get(id);
    if (p && p.user_id === userId) return p;
  }
  const byKey = await ctx.db
    .query("projects")
    .withIndex("by_user_key", (q) =>
      q.eq("user_id", userId).eq("key", r.toUpperCase()),
    )
    .first();
  if (byKey) return byKey;
  const byRepo = await findProjectByRepo(ctx, userId, r);
  if (byRepo) return byRepo;
  fail(
    `Project "${ref}" not found. Use ensure_project to create it, or list_projects to see existing ones.`,
  );
}

export async function createProject(
  ctx: MutationCtx,
  userId: string,
  actor: Actor,
  input: { repo: string; name?: string; key?: string; description?: string },
): Promise<Doc<"projects">> {
  const repo = normalizeRepo(input.repo);
  if (await findProjectByRepo(ctx, userId, repo)) {
    fail(`A project for repo "${repo}" already exists`);
  }
  const name = input.name?.trim() || repo.split("/").pop() || repo;
  let key: string;
  if (input.key) {
    key = validateKey(input.key);
    if (await keyTaken(ctx, userId, key)) fail(`Key "${key}" is already used`);
  } else {
    key = await uniqueKey(ctx, userId, deriveKeyBase(name));
  }
  const now = Date.now();
  const id = await ctx.db.insert("projects", {
    user_id: userId,
    name,
    repo,
    key,
    description: input.description?.trim() || undefined,
    next_number: 1,
    created_at: now,
    updated_at: now,
  });
  await logActivity(ctx, {
    userId,
    projectId: id,
    actor,
    message: `created project ${name} (${key})`,
  });
  return (await ctx.db.get(id))!;
}

/** Get the project for a repo, creating it on first use. */
export async function ensureProject(
  ctx: MutationCtx,
  userId: string,
  actor: Actor,
  input: { repo: string; name?: string; key?: string; description?: string },
): Promise<{ project: Doc<"projects">; created: boolean }> {
  const existing = await findProjectByRepo(ctx, userId, input.repo);
  if (existing) return { project: existing, created: false };
  return { project: await createProject(ctx, userId, actor, input), created: true };
}

export async function updateProject(
  ctx: MutationCtx,
  userId: string,
  actor: Actor,
  project: Doc<"projects">,
  patch: { name?: string; description?: string; key?: string; repo?: string },
) {
  const changes: Partial<Doc<"projects">> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) fail("name must not be empty");
    changes.name = name;
  }
  if (patch.description !== undefined) {
    changes.description = patch.description.trim() || undefined;
  }
  if (patch.key !== undefined) {
    const key = validateKey(patch.key);
    if (key !== project.key) {
      if (await keyTaken(ctx, userId, key)) fail(`Key "${key}" is already used`);
      changes.key = key;
    }
  }
  if (patch.repo !== undefined) {
    const repo = normalizeRepo(patch.repo);
    if (repo !== project.repo) {
      if (await findProjectByRepo(ctx, userId, repo)) {
        fail(`A project for repo "${repo}" already exists`);
      }
      changes.repo = repo;
    }
  }
  await ctx.db.patch(project._id, { ...changes, updated_at: Date.now() });
  await logActivity(ctx, {
    userId,
    projectId: project._id,
    actor,
    message: "updated project settings",
  });
}

export async function deleteProject(ctx: MutationCtx, project: Doc<"projects">) {
  const tickets = await ctx.db
    .query("tickets")
    .withIndex("by_project", (q) => q.eq("project_id", project._id))
    .collect();
  for (const t of tickets) await deleteTicketRows(ctx, t._id);
  const activity = await ctx.db
    .query("activity")
    .withIndex("by_project", (q) => q.eq("project_id", project._id))
    .collect();
  for (const a of activity) await ctx.db.delete(a._id);
  await ctx.db.delete(project._id);
}

export async function statusCounts(ctx: QueryCtx, projectId: Id<"projects">) {
  const counts: Record<Status, number> = {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    review: 0,
    done: 0,
  };
  const tickets = await ctx.db
    .query("tickets")
    .withIndex("by_project", (q) => q.eq("project_id", projectId))
    .collect();
  for (const t of tickets) counts[t.status]++;
  return counts;
}

export async function projectView(ctx: QueryCtx, p: Doc<"projects">) {
  return {
    _id: p._id,
    name: p.name,
    repo: p.repo,
    key: p.key,
    description: p.description,
    created_at: p.created_at,
    updated_at: p.updated_at,
    counts: await statusCounts(ctx, p._id),
  };
}

// --- Tickets --------------------------------------------------------------

/** Caches project keys so refs ("VTM-12") can be built cheaply in loops. */
class RefBuilder {
  private keys = new Map<Id<"projects">, string>();
  private ctx: QueryCtx;
  constructor(ctx: QueryCtx) {
    this.ctx = ctx;
  }
  async ref(t: Doc<"tickets">) {
    let key = this.keys.get(t.project_id);
    if (key === undefined) {
      key = (await this.ctx.db.get(t.project_id))?.key ?? "?";
      this.keys.set(t.project_id, key);
    }
    return `${key}-${t.number}`;
  }
  async link(t: Doc<"tickets">) {
    return { _id: t._id, ref: await this.ref(t), title: t.title, status: t.status };
  }
}

export function refBuilder(ctx: QueryCtx) {
  return new RefBuilder(ctx);
}

/** Accepts a ticket ref ("VTM-12") or a ticket id. */
export async function resolveTicket(
  ctx: QueryCtx,
  userId: string,
  ref: string,
): Promise<{ ticket: Doc<"tickets">; project: Doc<"projects"> }> {
  const r = ref.trim();
  const id = ctx.db.normalizeId("tickets", r);
  if (id) {
    const ticket = await ctx.db.get(id);
    if (ticket && ticket.user_id === userId) {
      const project = (await ctx.db.get(ticket.project_id))!;
      return { ticket, project };
    }
  }
  const m = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(r);
  if (m) {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_user_key", (q) =>
        q.eq("user_id", userId).eq("key", m[1].toUpperCase()),
      )
      .first();
    if (project) {
      const ticket = await ctx.db
        .query("tickets")
        .withIndex("by_project_number", (q) =>
          q.eq("project_id", project._id).eq("number", Number(m[2])),
        )
        .first();
      if (ticket) return { ticket, project };
    }
  }
  fail(`Ticket "${ref}" not found (use a ref like VTM-12)`);
}

export async function checklistRows(ctx: QueryCtx, ticketId: Id<"tickets">) {
  return await ctx.db
    .query("checklist_items")
    .withIndex("by_ticket", (q) => q.eq("ticket_id", ticketId))
    .collect();
}

export async function ticketSummary(
  ctx: QueryCtx,
  t: Doc<"tickets">,
  refs: RefBuilder = refBuilder(ctx),
) {
  const items = await checklistRows(ctx, t._id);
  const deps = await ctx.db
    .query("ticket_dependencies")
    .withIndex("by_ticket", (q) => q.eq("ticket_id", t._id))
    .collect();
  const blockedBy = [];
  for (const d of deps) {
    const other = await ctx.db.get(d.depends_on_id);
    if (other && other.status !== "done") blockedBy.push(await refs.link(other));
  }
  const blocks = await ctx.db
    .query("ticket_dependencies")
    .withIndex("by_depends_on", (q) => q.eq("depends_on_id", t._id))
    .collect();
  return {
    _id: t._id,
    ref: await refs.ref(t),
    number: t.number,
    project_id: t.project_id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    labels: t.labels,
    order: t.order,
    created_by: t.created_by,
    created_at: t.created_at,
    updated_at: t.updated_at,
    completed_at: t.completed_at,
    has_description: !!t.description,
    checklist: {
      done: items.filter((i) => i.done).length,
      total: items.length,
    },
    blocked_by: blockedBy,
    depends_on_count: deps.length,
    blocks_count: blocks.length,
  };
}

/** Checklist rows in display order (depth-first), each tagged with its depth. */
export function flattenChecklist(items: Doc<"checklist_items">[]) {
  const byParent = new Map<string, Doc<"checklist_items">[]>();
  for (const i of items) {
    const k = i.parent_id ?? "root";
    byParent.set(k, [...(byParent.get(k) ?? []), i]);
  }
  const out: Array<{
    _id: Id<"checklist_items">;
    parent_id?: Id<"checklist_items">;
    text: string;
    done: boolean;
    order: number;
    depth: number;
  }> = [];
  const walk = (parent: string, depth: number) => {
    const kids = (byParent.get(parent) ?? []).sort((a, b) => a.order - b.order);
    for (const k of kids) {
      out.push({
        _id: k._id,
        parent_id: k.parent_id,
        text: k.text,
        done: k.done,
        order: k.order,
        depth,
      });
      walk(k._id, depth + 1);
    }
  };
  walk("root", 0);
  return out;
}

export type ChecklistTreeNode = {
  id: string;
  text: string;
  done: boolean;
  children?: ChecklistTreeNode[];
};

/** Nested form of the checklist, for MCP responses. */
export function checklistTree(items: Doc<"checklist_items">[]): ChecklistTreeNode[] {
  const flat = flattenChecklist(items);
  const nodes = new Map<string, ChecklistTreeNode>();
  const roots: ChecklistTreeNode[] = [];
  for (const i of flat) {
    const node: ChecklistTreeNode = { id: i._id, text: i.text, done: i.done };
    nodes.set(i._id, node);
    const parent = i.parent_id ? nodes.get(i.parent_id) : undefined;
    if (parent) (parent.children ??= []).push(node);
    else roots.push(node);
  }
  return roots;
}

export async function ticketDetail(ctx: QueryCtx, t: Doc<"tickets">) {
  const refs = refBuilder(ctx);
  const project = (await ctx.db.get(t.project_id))!;
  const summary = await ticketSummary(ctx, t, refs);
  const items = await checklistRows(ctx, t._id);
  const deps = await ctx.db
    .query("ticket_dependencies")
    .withIndex("by_ticket", (q) => q.eq("ticket_id", t._id))
    .collect();
  const dependsOn = [];
  for (const d of deps) {
    const other = await ctx.db.get(d.depends_on_id);
    if (other) dependsOn.push(await refs.link(other));
  }
  const blocking = await ctx.db
    .query("ticket_dependencies")
    .withIndex("by_depends_on", (q) => q.eq("depends_on_id", t._id))
    .collect();
  const blocks = [];
  for (const d of blocking) {
    const other = await ctx.db.get(d.ticket_id);
    if (other) blocks.push(await refs.link(other));
  }
  const activity = await ctx.db
    .query("activity")
    .withIndex("by_ticket", (q) => q.eq("ticket_id", t._id))
    .order("desc")
    .take(100);
  return {
    ...summary,
    description: t.description,
    project_key: project.key,
    project_name: project.name,
    checklist_items: flattenChecklist(items),
    depends_on: dependsOn,
    blocks,
    activity: activity.map(activityView),
  };
}

export function activityView(a: Doc<"activity">) {
  return {
    _id: a._id,
    ticket_id: a.ticket_id,
    ticket_ref: a.ticket_ref,
    actor: a.actor,
    kind: a.kind,
    message: a.message,
    created_at: a.created_at,
  };
}

async function orderAtTop(ctx: QueryCtx, projectId: Id<"projects">, status: Status) {
  const first = await ctx.db
    .query("tickets")
    .withIndex("by_project_status_order", (q) =>
      q.eq("project_id", projectId).eq("status", status),
    )
    .order("asc")
    .first();
  return first ? first.order - 1 : 0;
}

async function orderAtBottom(ctx: QueryCtx, projectId: Id<"projects">, status: Status) {
  const last = await ctx.db
    .query("tickets")
    .withIndex("by_project_status_order", (q) =>
      q.eq("project_id", projectId).eq("status", status),
    )
    .order("desc")
    .first();
  return last ? last.order + 1 : 0;
}

function cleanLabels(labels: string[]) {
  return [...new Set(labels.map((l) => l.trim().toLowerCase()).filter(Boolean))];
}

export async function createTicket(
  ctx: MutationCtx,
  userId: string,
  actor: Actor,
  project: Doc<"projects">,
  input: {
    title: string;
    description?: string;
    status?: Status;
    priority?: Priority;
    labels?: string[];
    checklist?: ChecklistInput[];
    depends_on?: string[];
  },
): Promise<Doc<"tickets">> {
  const title = input.title.trim();
  if (!title) fail("title must not be empty");
  const status = input.status ?? "todo";
  const now = Date.now();
  const number = project.next_number;
  await ctx.db.patch(project._id, { next_number: number + 1, updated_at: now });
  const id = await ctx.db.insert("tickets", {
    user_id: userId,
    project_id: project._id,
    number,
    title,
    description: input.description?.trim() || undefined,
    status,
    priority: input.priority ?? "medium",
    labels: cleanLabels(input.labels ?? []),
    order: await orderAtBottom(ctx, project._id, status),
    created_by: actor,
    created_at: now,
    updated_at: now,
    completed_at: status === "done" ? now : undefined,
  });
  const ref = `${project.key}-${number}`;
  if (input.checklist?.length) {
    await insertChecklistTree(ctx, id, input.checklist, undefined, 0);
  }
  await logActivity(ctx, {
    userId,
    projectId: project._id,
    ticketId: id,
    ticketRef: ref,
    actor,
    message: `created ${ref} “${title}”`,
  });
  const ticket = (await ctx.db.get(id))!;
  for (const depRef of input.depends_on ?? []) {
    const { ticket: dep } = await resolveTicket(ctx, userId, depRef);
    await addDependency(ctx, userId, actor, ticket, dep);
  }
  return ticket;
}

export async function updateTicket(
  ctx: MutationCtx,
  userId: string,
  actor: Actor,
  ticket: Doc<"tickets">,
  patch: {
    title?: string;
    description?: string;
    status?: Status;
    priority?: Priority;
    labels?: string[];
  },
) {
  const refs = refBuilder(ctx);
  const ref = await refs.ref(ticket);
  const now = Date.now();
  const changes: Partial<Doc<"tickets">> = { updated_at: now };
  const notes: string[] = [];
  if (patch.title !== undefined && patch.title.trim() !== ticket.title) {
    const title = patch.title.trim();
    if (!title) fail("title must not be empty");
    changes.title = title;
    notes.push(`renamed to “${title}”`);
  }
  if (patch.description !== undefined) {
    const description = patch.description.trim() || undefined;
    if (description !== ticket.description) {
      changes.description = description;
      notes.push("updated the description");
    }
  }
  if (patch.priority !== undefined && patch.priority !== ticket.priority) {
    changes.priority = patch.priority;
    notes.push(`set priority to ${patch.priority}`);
  }
  if (patch.labels !== undefined) {
    changes.labels = cleanLabels(patch.labels);
    notes.push(
      changes.labels.length ? `set labels: ${changes.labels.join(", ")}` : "cleared labels",
    );
  }
  if (patch.status !== undefined && patch.status !== ticket.status) {
    changes.status = patch.status;
    changes.order = await orderAtTop(ctx, ticket.project_id, patch.status);
    changes.completed_at = patch.status === "done" ? now : undefined;
    notes.push(`moved to ${STATUS_LABELS[patch.status]}`);
  }
  await ctx.db.patch(ticket._id, changes);
  if (notes.length) {
    await logActivity(ctx, {
      userId,
      projectId: ticket.project_id,
      ticketId: ticket._id,
      ticketRef: ref,
      actor,
      message: `${notes.join(", ")} on ${ref}`,
    });
  }
}

/** Drag-and-drop move: into `status`, placed before `beforeId` (or at the end). */
export async function moveTicket(
  ctx: MutationCtx,
  userId: string,
  actor: Actor,
  ticket: Doc<"tickets">,
  status: Status,
  beforeId: Id<"tickets"> | null,
) {
  const column = (
    await ctx.db
      .query("tickets")
      .withIndex("by_project_status_order", (q) =>
        q.eq("project_id", ticket.project_id).eq("status", status),
      )
      .collect()
  ).filter((t) => t._id !== ticket._id);
  let order: number;
  const idx = beforeId ? column.findIndex((t) => t._id === beforeId) : -1;
  if (idx === -1) {
    order = column.length ? column[column.length - 1].order + 1 : 0;
  } else {
    const before = column[idx];
    const prev = column[idx - 1];
    order = prev ? (prev.order + before.order) / 2 : before.order - 1;
  }
  const now = Date.now();
  const statusChanged = status !== ticket.status;
  await ctx.db.patch(ticket._id, {
    status,
    order,
    updated_at: now,
    ...(statusChanged
      ? { completed_at: status === "done" ? now : undefined }
      : {}),
  });
  if (statusChanged) {
    const ref = await refBuilder(ctx).ref(ticket);
    await logActivity(ctx, {
      userId,
      projectId: ticket.project_id,
      ticketId: ticket._id,
      ticketRef: ref,
      actor,
      message: `moved ${ref} to ${STATUS_LABELS[status]}`,
    });
  }
}

async function deleteTicketRows(ctx: MutationCtx, ticketId: Id<"tickets">) {
  for (const i of await checklistRows(ctx, ticketId)) await ctx.db.delete(i._id);
  const out = await ctx.db
    .query("ticket_dependencies")
    .withIndex("by_ticket", (q) => q.eq("ticket_id", ticketId))
    .collect();
  const inc = await ctx.db
    .query("ticket_dependencies")
    .withIndex("by_depends_on", (q) => q.eq("depends_on_id", ticketId))
    .collect();
  for (const d of [...out, ...inc]) await ctx.db.delete(d._id);
  const activity = await ctx.db
    .query("activity")
    .withIndex("by_ticket", (q) => q.eq("ticket_id", ticketId))
    .collect();
  for (const a of activity) await ctx.db.delete(a._id);
  await ctx.db.delete(ticketId);
}

export async function deleteTicket(
  ctx: MutationCtx,
  userId: string,
  actor: Actor,
  ticket: Doc<"tickets">,
) {
  const ref = await refBuilder(ctx).ref(ticket);
  await deleteTicketRows(ctx, ticket._id);
  await logActivity(ctx, {
    userId,
    projectId: ticket.project_id,
    ticketRef: ref,
    actor,
    message: `deleted ${ref} “${ticket.title}”`,
  });
}

async function touch(ctx: MutationCtx, ticketId: Id<"tickets">) {
  await ctx.db.patch(ticketId, { updated_at: Date.now() });
}

// --- Checklist ------------------------------------------------------------

async function insertChecklistTree(
  ctx: MutationCtx,
  ticketId: Id<"tickets">,
  items: ChecklistInput[],
  parentId: Id<"checklist_items"> | undefined,
  startOrder: number,
): Promise<Id<"checklist_items">[]> {
  const ids: Id<"checklist_items">[] = [];
  let order = startOrder;
  for (const item of items) {
    const text = item.text?.trim();
    if (!text) fail("checklist item text must not be empty");
    const id = await ctx.db.insert("checklist_items", {
      ticket_id: ticketId,
      parent_id: parentId,
      text,
      done: item.done ?? false,
      order: order++,
      created_at: Date.now(),
    });
    ids.push(id);
    if (item.children?.length) {
      await insertChecklistTree(ctx, ticketId, item.children, id, 0);
    }
  }
  return ids;
}

export async function addChecklistItems(
  ctx: MutationCtx,
  userId: string,
  actor: Actor,
  ticket: Doc<"tickets">,
  items: ChecklistInput[],
  parentId?: Id<"checklist_items">,
) {
  if (!items.length) fail("items must not be empty");
  const existing = await checklistRows(ctx, ticket._id);
  if (parentId && !existing.some((i) => i._id === parentId)) {
    fail("parent_item_id is not an item of this ticket");
  }
  const siblings = existing.filter((i) => i.parent_id === parentId);
  const start = siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
  const ids = await insertChecklistTree(ctx, ticket._id, items, parentId, start);
  await touch(ctx, ticket._id);
  const ref = await refBuilder(ctx).ref(ticket);
  await logActivity(ctx, {
    userId,
    projectId: ticket.project_id,
    ticketId: ticket._id,
    ticketRef: ref,
    actor,
    message:
      items.length === 1
        ? `added step “${items[0].text.trim()}” to ${ref}`
        : `added ${items.length} steps to ${ref}`,
  });
  return ids;
}

export async function resolveChecklistItem(
  ctx: QueryCtx,
  userId: string,
  itemId: string,
) {
  const id = ctx.db.normalizeId("checklist_items", itemId.trim());
  const item = id ? await ctx.db.get(id) : null;
  const ticket = item ? await ctx.db.get(item.ticket_id) : null;
  if (!item || !ticket || ticket.user_id !== userId) {
    fail(`Checklist item "${itemId}" not found (get_ticket lists item ids)`);
  }
  return { item, ticket };
}

export async function updateChecklistItem(
  ctx: MutationCtx,
  userId: string,
  actor: Actor,
  item: Doc<"checklist_items">,
  ticket: Doc<"tickets">,
  patch: { text?: string; done?: boolean },
) {
  const changes: Partial<Doc<"checklist_items">> = {};
  if (patch.text !== undefined) {
    const text = patch.text.trim();
    if (!text) fail("text must not be empty");
    changes.text = text;
  }
  if (patch.done !== undefined) changes.done = patch.done;
  await ctx.db.patch(item._id, changes);
  await touch(ctx, ticket._id);
  if (patch.done !== undefined && patch.done !== item.done) {
    const ref = await refBuilder(ctx).ref(ticket);
    await logActivity(ctx, {
      userId,
      projectId: ticket.project_id,
      ticketId: ticket._id,
      ticketRef: ref,
      actor,
      message: `${patch.done ? "completed" : "reopened"} step “${changes.text ?? item.text}” on ${ref}`,
    });
  }
}

export async function deleteChecklistItem(
  ctx: MutationCtx,
  item: Doc<"checklist_items">,
  ticket: Doc<"tickets">,
) {
  const all = await checklistRows(ctx, ticket._id);
  const doomed = new Set<string>([item._id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const i of all) {
      if (i.parent_id && doomed.has(i.parent_id) && !doomed.has(i._id)) {
        doomed.add(i._id);
        grew = true;
      }
    }
  }
  for (const id of doomed) await ctx.db.delete(id as Id<"checklist_items">);
  await touch(ctx, ticket._id);
  return doomed.size;
}

// --- Dependencies ---------------------------------------------------------

/** Does `from` (transitively) depend on `target`? */
async function dependsTransitively(
  ctx: QueryCtx,
  from: Id<"tickets">,
  target: Id<"tickets">,
) {
  const seen = new Set<string>();
  const stack: Id<"tickets">[] = [from];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === target) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const edges = await ctx.db
      .query("ticket_dependencies")
      .withIndex("by_ticket", (q) => q.eq("ticket_id", cur))
      .collect();
    for (const e of edges) stack.push(e.depends_on_id);
  }
  return false;
}

/** Make `ticket` depend on `dependsOn` (dependsOn blocks ticket). */
export async function addDependency(
  ctx: MutationCtx,
  userId: string,
  actor: Actor,
  ticket: Doc<"tickets">,
  dependsOn: Doc<"tickets">,
) {
  if (ticket._id === dependsOn._id) fail("A ticket can't depend on itself");
  const existing = await ctx.db
    .query("ticket_dependencies")
    .withIndex("by_pair", (q) =>
      q.eq("ticket_id", ticket._id).eq("depends_on_id", dependsOn._id),
    )
    .first();
  if (existing) return;
  const refs = refBuilder(ctx);
  const ref = await refs.ref(ticket);
  const depRef = await refs.ref(dependsOn);
  if (await dependsTransitively(ctx, dependsOn._id, ticket._id)) {
    fail(`That would create a cycle: ${depRef} already depends on ${ref}`);
  }
  await ctx.db.insert("ticket_dependencies", {
    user_id: userId,
    ticket_id: ticket._id,
    depends_on_id: dependsOn._id,
    created_at: Date.now(),
  });
  await touch(ctx, ticket._id);
  await logActivity(ctx, {
    userId,
    projectId: ticket.project_id,
    ticketId: ticket._id,
    ticketRef: ref,
    actor,
    message: `${ref} now depends on ${depRef}`,
  });
}

export async function removeDependency(
  ctx: MutationCtx,
  userId: string,
  actor: Actor,
  ticket: Doc<"tickets">,
  dependsOn: Doc<"tickets">,
) {
  const existing = await ctx.db
    .query("ticket_dependencies")
    .withIndex("by_pair", (q) =>
      q.eq("ticket_id", ticket._id).eq("depends_on_id", dependsOn._id),
    )
    .first();
  if (!existing) return false;
  await ctx.db.delete(existing._id);
  await touch(ctx, ticket._id);
  const refs = refBuilder(ctx);
  const ref = await refs.ref(ticket);
  await logActivity(ctx, {
    userId,
    projectId: ticket.project_id,
    ticketId: ticket._id,
    ticketRef: ref,
    actor,
    message: `${ref} no longer depends on ${await refs.ref(dependsOn)}`,
  });
  return true;
}

// --- Activity -------------------------------------------------------------

export async function logActivity(
  ctx: MutationCtx,
  a: {
    userId: string;
    projectId: Id<"projects">;
    ticketId?: Id<"tickets">;
    ticketRef?: string;
    actor: Actor;
    message: string;
    kind?: "event" | "comment";
  },
) {
  await ctx.db.insert("activity", {
    user_id: a.userId,
    project_id: a.projectId,
    ticket_id: a.ticketId,
    ticket_ref: a.ticketRef,
    actor: a.actor,
    kind: a.kind ?? "event",
    message: a.message,
    created_at: Date.now(),
  });
}

export async function addComment(
  ctx: MutationCtx,
  userId: string,
  actor: Actor,
  ticket: Doc<"tickets">,
  text: string,
) {
  const message = text.trim();
  if (!message) fail("comment must not be empty");
  await logActivity(ctx, {
    userId,
    projectId: ticket.project_id,
    ticketId: ticket._id,
    ticketRef: await refBuilder(ctx).ref(ticket),
    actor,
    kind: "comment",
    message,
  });
  await touch(ctx, ticket._id);
}
