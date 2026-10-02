// MCP tools. `tools` is what `tools/list` advertises; `callTool` executes one
// call as a single Convex mutation, so every tool call is atomic.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import {
  PRIORITIES,
  STATUSES,
  addChecklistItems,
  addComment,
  addDependency,
  checklistRows,
  checklistTree,
  cleanLabels,
  createTicket,
  deleteChecklistItem,
  deleteProject,
  deleteTicket,
  ensureProject,
  fail,
  projectView,
  refBuilder,
  removeDependency,
  resolveChecklistItem,
  resolveProject,
  resolveTicket,
  ticketDetail,
  ticketSummary,
  updateChecklistItem,
  updateProject,
  updateTicket,
  type ChecklistInput,
  type Priority,
  type Status,
} from "./model";

export const SERVER_INSTRUCTIONS = `Task Board is a Trello-style board the user watches to follow your work. There is one project per git repo.

Workflow:
1. When you start working in a repo, call ensure_project with the repo as "owner/name" (from \`git remote get-url origin\`; if there is no remote, use the folder name). Use the returned project key for later calls.
2. Before starting non-trivial work, check list_tickets for an existing ticket. Otherwise create_ticket with a clear title, a markdown description, and a checklist of the concrete steps (nest sub-steps with "children").
3. Set status to in_progress when you start a ticket. Tick off checklist items with update_checklist_item as you finish them (get_ticket shows item ids). Use add_comment for notable findings or decisions. When finished, move the ticket to review if the user should check it, otherwise to done.
4. Record ordering constraints with add_dependency (a ticket depends on another one that must finish first).
5. Give every ticket exactly one fix label so the user can filter by who has to act: "code-fix" when you can do all of it yourself in code, or "config-fix" when it needs the user (dashboard or console settings, secrets/env vars/API keys, accounts or billing, DNS, approvals, manual testing on their devices). If you discover mid-ticket that the user is needed, switch it to config-fix and add_comment saying exactly what they must do.

Ticket refs look like KEY-12. Statuses: backlog, todo, in_progress, review, done. Priorities: low, medium, high, urgent.`;

// --- JSON Schemas -----------------------------------------------------------

const projectArg = {
  type: "string",
  description: 'Project key (e.g. "VTM") or repo ("owner/name" or a git URL).',
};
const ticketArg = {
  type: "string",
  description: 'Ticket ref, e.g. "VTM-12".',
};
const statusArg = { type: "string", enum: STATUSES };
const priorityArg = { type: "string", enum: PRIORITIES };
const labelsArg = {
  type: "array",
  items: { type: "string" },
  description:
    'Free-form labels, e.g. bug, frontend. Include exactly one of "code-fix" (you can do it all) or "config-fix" (needs the user).',
};

/** Checklist item schema nested `depth` levels (no $ref, for broad client support). */
function checklistItemSchema(depth: number): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    text: { type: "string" },
    done: { type: "boolean", description: "Default false." },
  };
  if (depth > 1) {
    properties.children = {
      type: "array",
      description: "Sub-steps.",
      items: checklistItemSchema(depth - 1),
    };
  }
  return { type: "object", properties, required: ["text"] };
}
const checklistArg = {
  type: "array",
  description: "Steps to complete the ticket; nest sub-steps under children.",
  items: checklistItemSchema(4),
};

function schema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

const readOnly = { readOnlyHint: true, destructiveHint: false };
const write = { readOnlyHint: false, destructiveHint: false };
const destructive = { readOnlyHint: false, destructiveHint: true };

export const tools = [
  {
    name: "list_projects",
    description: "List all projects (one per repo) with ticket counts per status.",
    inputSchema: schema({}),
    annotations: readOnly,
  },
  {
    name: "ensure_project",
    description:
      "Get the project for a repo, creating it if it doesn't exist yet. Call this first when working in a repo.",
    inputSchema: schema(
      {
        repo: {
          type: "string",
          description: 'Repo as "owner/name" or its git remote URL.',
        },
        name: { type: "string", description: "Display name (defaults to the repo name)." },
        key: {
          type: "string",
          description: "Ticket prefix, 2–10 letters/digits (derived from the name if omitted).",
        },
        description: { type: "string" },
      },
      ["repo"],
    ),
    annotations: write,
  },
  {
    name: "get_project",
    description: "Get one project with ticket counts per status.",
    inputSchema: schema({ project: projectArg }, ["project"]),
    annotations: readOnly,
  },
  {
    name: "update_project",
    description: "Rename a project, change its key/repo, or edit its description.",
    inputSchema: schema(
      {
        project: projectArg,
        name: { type: "string" },
        key: { type: "string" },
        repo: { type: "string" },
        description: { type: "string" },
      },
      ["project"],
    ),
    annotations: write,
  },
  {
    name: "delete_project",
    description:
      "Permanently delete a project and all its tickets. Only do this when the user explicitly asks.",
    inputSchema: schema(
      {
        project: projectArg,
        confirm: { type: "boolean", description: "Must be true." },
      },
      ["project", "confirm"],
    ),
    annotations: destructive,
  },
  {
    name: "list_tickets",
    description:
      "List tickets in a project (board order), with checklist progress and unfinished blockers.",
    inputSchema: schema(
      {
        project: projectArg,
        status: {
          type: "array",
          items: statusArg,
          description: "Only these statuses (default: all).",
        },
        label: {
          type: "string",
          description: 'Only tickets with this label, e.g. "config-fix" for ones that need the user.',
        },
      },
      ["project"],
    ),
    annotations: readOnly,
  },
  {
    name: "get_ticket",
    description:
      "Get a ticket in full: description, nested checklist (with item ids), dependencies and recent activity.",
    inputSchema: schema({ ticket: ticketArg }, ["ticket"]),
    annotations: readOnly,
  },
  {
    name: "create_ticket",
    description:
      "Create a ticket, optionally with a nested checklist of steps and dependencies on other tickets.",
    inputSchema: schema(
      {
        project: projectArg,
        title: { type: "string" },
        description: { type: "string", description: "Markdown." },
        status: { ...statusArg, description: "Default todo." },
        priority: { ...priorityArg, description: "Default medium." },
        labels: labelsArg,
        checklist: checklistArg,
        depends_on: {
          type: "array",
          items: { type: "string" },
          description: "Refs of tickets that must be finished first.",
        },
      },
      ["project", "title"],
    ),
    annotations: write,
  },
  {
    name: "update_ticket",
    description:
      "Update a ticket's title, description, status, priority or labels. Changing status moves it to the top of that column.",
    inputSchema: schema(
      {
        ticket: ticketArg,
        title: { type: "string" },
        description: { type: "string", description: "Markdown; replaces the existing description." },
        status: statusArg,
        priority: priorityArg,
        labels: { ...labelsArg, description: "Replaces the existing labels." },
      },
      ["ticket"],
    ),
    annotations: write,
  },
  {
    name: "delete_ticket",
    description: "Permanently delete a ticket with its checklist and dependency links.",
    inputSchema: schema({ ticket: ticketArg }, ["ticket"]),
    annotations: destructive,
  },
  {
    name: "add_checklist_items",
    description:
      "Append steps to a ticket's checklist, at the top level or under an existing item (parent_item_id).",
    inputSchema: schema(
      {
        ticket: ticketArg,
        items: checklistArg,
        parent_item_id: {
          type: "string",
          description: "Nest the new items under this checklist item.",
        },
      },
      ["ticket", "items"],
    ),
    annotations: write,
  },
  {
    name: "update_checklist_item",
    description: "Tick off / reopen a checklist item, or edit its text.",
    inputSchema: schema(
      {
        item_id: { type: "string", description: "From get_ticket." },
        done: { type: "boolean" },
        text: { type: "string" },
      },
      ["item_id"],
    ),
    annotations: write,
  },
  {
    name: "delete_checklist_item",
    description: "Delete a checklist item and all its sub-items.",
    inputSchema: schema({ item_id: { type: "string" } }, ["item_id"]),
    annotations: destructive,
  },
  {
    name: "add_dependency",
    description:
      "Record that `ticket` depends on `depends_on` (depends_on must finish first; it blocks ticket).",
    inputSchema: schema({ ticket: ticketArg, depends_on: ticketArg }, ["ticket", "depends_on"]),
    annotations: write,
  },
  {
    name: "remove_dependency",
    description: "Remove a dependency between two tickets.",
    inputSchema: schema({ ticket: ticketArg, depends_on: ticketArg }, ["ticket", "depends_on"]),
    annotations: write,
  },
  {
    name: "add_comment",
    description:
      "Add a progress note to a ticket's activity feed (findings, decisions, what's left).",
    inputSchema: schema(
      { ticket: ticketArg, text: { type: "string", description: "Markdown." } },
      ["ticket", "text"],
    ),
    annotations: write,
  },
] as const;

// --- Argument helpers --------------------------------------------------------

type Args = Record<string, unknown>;

function str(args: Args, name: string): string {
  const val = args[name];
  if (typeof val !== "string" || !val.trim()) fail(`"${name}" is required`);
  return val;
}
function optStr(args: Args, name: string): string | undefined {
  const val = args[name];
  if (val === undefined || val === null) return undefined;
  if (typeof val !== "string") fail(`"${name}" must be a string`);
  return val;
}
function optBool(args: Args, name: string): boolean | undefined {
  const val = args[name];
  if (val === undefined || val === null) return undefined;
  if (typeof val !== "boolean") fail(`"${name}" must be a boolean`);
  return val;
}
function optStrArray(args: Args, name: string): string[] | undefined {
  const val = args[name];
  if (val === undefined || val === null) return undefined;
  if (!Array.isArray(val) || val.some((x) => typeof x !== "string")) {
    fail(`"${name}" must be an array of strings`);
  }
  return val as string[];
}

const STATUS_ALIASES: Record<string, Status> = {
  to_do: "todo",
  open: "todo",
  doing: "in_progress",
  inprogress: "in_progress",
  started: "in_progress",
  in_review: "review",
  closed: "done",
  complete: "done",
  completed: "done",
};
function toStatus(raw: string): Status {
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((STATUSES as string[]).includes(s)) return s as Status;
  if (STATUS_ALIASES[s]) return STATUS_ALIASES[s];
  fail(`Unknown status "${raw}". Use one of: ${STATUSES.join(", ")}`);
}
function optStatus(args: Args, name: string) {
  const s = optStr(args, name);
  return s === undefined ? undefined : toStatus(s);
}
function optPriority(args: Args, name: string): Priority | undefined {
  const p = optStr(args, name)?.trim().toLowerCase();
  if (p === undefined) return undefined;
  if (!(PRIORITIES as string[]).includes(p)) {
    fail(`Unknown priority "${p}". Use one of: ${PRIORITIES.join(", ")}`);
  }
  return p as Priority;
}
function checklistInput(val: unknown, name = "checklist"): ChecklistInput[] {
  if (!Array.isArray(val)) fail(`"${name}" must be an array`);
  return val.map((raw) => {
    const item = typeof raw === "string" ? { text: raw } : (raw as Args);
    if (!item || typeof item.text !== "string") fail(`each ${name} item needs "text"`);
    return {
      text: item.text,
      done: item.done === true,
      children:
        item.children === undefined ? undefined : checklistInput(item.children, "children"),
    };
  });
}

// --- Output shaping ------------------------------------------------------------

function appUrl(path: string) {
  const base = process.env.APP_URL?.replace(/\/+$/, "");
  return base ? `${base}${path}` : undefined;
}

async function ticketOut(ctx: MutationCtx, t: Doc<"tickets">, refs = refBuilder(ctx)) {
  const s = await ticketSummary(ctx, t, refs);
  const key = s.ref.split("-")[0];
  return {
    ref: s.ref,
    title: s.title,
    status: s.status,
    priority: s.priority,
    labels: s.labels,
    checklist: s.checklist.total ? `${s.checklist.done}/${s.checklist.total}` : undefined,
    blocked_by: s.blocked_by.length ? s.blocked_by.map((b) => b.ref) : undefined,
    url: appUrl(`/p/${key}/t/${s.number}`),
  };
}

async function ticketFull(ctx: MutationCtx, t: Doc<"tickets">) {
  const d = await ticketDetail(ctx, t);
  return {
    ref: d.ref,
    project: d.project_key,
    title: d.title,
    status: d.status,
    priority: d.priority,
    labels: d.labels,
    description: d.description,
    checklist: checklistTree(await checklistRows(ctx, t._id)),
    checklist_progress: `${d.checklist.done}/${d.checklist.total}`,
    depends_on: d.depends_on.map(({ ref, title, status }) => ({ ref, title, status })),
    blocks: d.blocks.map(({ ref, title, status }) => ({ ref, title, status })),
    recent_activity: d.activity.slice(0, 15).map((a) => ({
      at: new Date(a.created_at).toISOString(),
      by: a.actor,
      [a.kind === "comment" ? "comment" : "event"]: a.message,
    })),
    url: appUrl(`/p/${d.project_key}/t/${d.number}`),
  };
}

async function projectOut(ctx: MutationCtx, p: Doc<"projects">) {
  const view = await projectView(ctx, p);
  return {
    key: view.key,
    name: view.name,
    repo: view.repo,
    description: view.description,
    counts: view.counts,
    url: appUrl(`/p/${view.key}`),
  };
}

// --- Dispatcher -------------------------------------------------------------------

export const callTool = internalMutation({
  args: {
    user_id: v.string(),
    key_id: v.id("api_keys"),
    name: v.string(),
    args: v.any(),
  },
  returns: v.any(),
  handler: async (ctx, { user_id: userId, key_id, name, args: rawArgs }) => {
    const key = await ctx.db.get(key_id);
    if (key && (key.last_used_at ?? 0) < Date.now() - 60_000) {
      await ctx.db.patch(key_id, { last_used_at: Date.now() });
    }
    const args: Args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
    const claude = "claude" as const;

    switch (name) {
      case "list_projects": {
        const projects = await ctx.db
          .query("projects")
          .withIndex("by_user", (q) => q.eq("user_id", userId))
          .collect();
        return { projects: await Promise.all(projects.map((p) => projectOut(ctx, p))) };
      }

      case "ensure_project": {
        const { project, created } = await ensureProject(ctx, userId, claude, {
          repo: str(args, "repo"),
          name: optStr(args, "name"),
          key: optStr(args, "key"),
          description: optStr(args, "description"),
        });
        return { created, project: await projectOut(ctx, project) };
      }

      case "get_project":
        return projectOut(ctx, await resolveProject(ctx, userId, str(args, "project")));

      case "update_project": {
        const p = await resolveProject(ctx, userId, str(args, "project"));
        await updateProject(ctx, userId, claude, p, {
          name: optStr(args, "name"),
          key: optStr(args, "key"),
          repo: optStr(args, "repo"),
          description: optStr(args, "description"),
        });
        return projectOut(ctx, (await ctx.db.get(p._id))!);
      }

      case "delete_project": {
        if (optBool(args, "confirm") !== true) fail('Set "confirm": true to delete');
        const p = await resolveProject(ctx, userId, str(args, "project"));
        await deleteProject(ctx, p);
        return { deleted: p.key };
      }

      case "list_tickets": {
        const p = await resolveProject(ctx, userId, str(args, "project"));
        const statuses = optStrArray(args, "status")?.map(toStatus);
        const label = cleanLabels([optStr(args, "label") ?? ""])[0];
        const refs = refBuilder(ctx);
        const tickets = [];
        for (const status of statuses ?? STATUSES) {
          const col = await ctx.db
            .query("tickets")
            .withIndex("by_project_status_order", (q) =>
              q.eq("project_id", p._id).eq("status", status),
            )
            .collect();
          for (const t of col) {
            if (label && !t.labels.includes(label)) continue;
            tickets.push(await ticketOut(ctx, t, refs));
          }
        }
        return { project: p.key, count: tickets.length, tickets };
      }

      case "get_ticket": {
        const { ticket } = await resolveTicket(ctx, userId, str(args, "ticket"));
        return ticketFull(ctx, ticket);
      }

      case "create_ticket": {
        const p = await resolveProject(ctx, userId, str(args, "project"));
        const t = await createTicket(ctx, userId, claude, p, {
          title: str(args, "title"),
          description: optStr(args, "description"),
          status: optStatus(args, "status"),
          priority: optPriority(args, "priority"),
          labels: optStrArray(args, "labels"),
          checklist: args.checklist === undefined ? undefined : checklistInput(args.checklist),
          depends_on: optStrArray(args, "depends_on"),
        });
        return ticketFull(ctx, t);
      }

      case "update_ticket": {
        const { ticket } = await resolveTicket(ctx, userId, str(args, "ticket"));
        await updateTicket(ctx, userId, claude, ticket, {
          title: optStr(args, "title"),
          description: optStr(args, "description"),
          status: optStatus(args, "status"),
          priority: optPriority(args, "priority"),
          labels: optStrArray(args, "labels"),
        });
        return ticketOut(ctx, (await ctx.db.get(ticket._id))!);
      }

      case "delete_ticket": {
        const { ticket, project } = await resolveTicket(ctx, userId, str(args, "ticket"));
        await deleteTicket(ctx, userId, claude, ticket);
        return { deleted: `${project.key}-${ticket.number}` };
      }

      case "add_checklist_items": {
        const { ticket } = await resolveTicket(ctx, userId, str(args, "ticket"));
        const parentRaw = optStr(args, "parent_item_id");
        let parentId;
        if (parentRaw) {
          const { item } = await resolveChecklistItem(ctx, userId, parentRaw);
          if (item.ticket_id !== ticket._id) fail("parent_item_id belongs to another ticket");
          parentId = item._id;
        }
        await addChecklistItems(
          ctx,
          userId,
          claude,
          ticket,
          checklistInput(args.items, "items"),
          parentId,
        );
        return {
          checklist: checklistTree(await checklistRows(ctx, ticket._id)),
        };
      }

      case "update_checklist_item": {
        const { item, ticket } = await resolveChecklistItem(ctx, userId, str(args, "item_id"));
        await updateChecklistItem(ctx, userId, claude, item, ticket, {
          text: optStr(args, "text"),
          done: optBool(args, "done"),
        });
        const rows = await checklistRows(ctx, ticket._id);
        return {
          item: { id: item._id, text: optStr(args, "text") ?? item.text, done: optBool(args, "done") ?? item.done },
          checklist_progress: `${rows.filter((r) => r.done).length}/${rows.length}`,
        };
      }

      case "delete_checklist_item": {
        const { item, ticket } = await resolveChecklistItem(ctx, userId, str(args, "item_id"));
        const removed = await deleteChecklistItem(ctx, item, ticket);
        return { removed_items: removed };
      }

      case "add_dependency":
      case "remove_dependency": {
        const { ticket } = await resolveTicket(ctx, userId, str(args, "ticket"));
        const { ticket: dep } = await resolveTicket(ctx, userId, str(args, "depends_on"));
        if (name === "add_dependency") {
          await addDependency(ctx, userId, claude, ticket, dep);
        } else if (!(await removeDependency(ctx, userId, claude, ticket, dep))) {
          fail("Those tickets have no dependency between them");
        }
        return ticketOut(ctx, (await ctx.db.get(ticket._id))!);
      }

      case "add_comment": {
        const { ticket } = await resolveTicket(ctx, userId, str(args, "ticket"));
        await addComment(ctx, userId, claude, ticket, str(args, "text"));
        return { ok: true };
      }

      default:
        fail(`Unknown tool "${name}"`);
    }
  },
});

