import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  addComment,
  addDependency,
  createTicket,
  deleteTicket,
  moveTicket,
  refBuilder,
  removeDependency,
  requireUserId,
  resolveProject,
  resolveTicket,
  ticketDetail,
  ticketSummary,
  updateTicket,
} from "./model";
import { priorityValidator, statusValidator } from "./schema";
import {
  ticketDetailValidator,
  ticketLinkValidator,
  ticketSummaryValidator,
} from "./validators";

/** Every ticket in a project, as card summaries (the client groups by status). */
export const board = query({
  args: { project_id: v.id("projects") },
  returns: v.array(ticketSummaryValidator),
  handler: async (ctx, { project_id }) => {
    const userId = await requireUserId(ctx);
    const project = await resolveProject(ctx, userId, project_id);
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_project", (q) => q.eq("project_id", project._id))
      .collect();
    const refs = refBuilder(ctx);
    return await Promise.all(tickets.map((t) => ticketSummary(ctx, t, refs)));
  },
});

export const get = query({
  args: { ref: v.string() },
  returns: v.union(ticketDetailValidator, v.null()),
  handler: async (ctx, { ref }) => {
    const userId = await requireUserId(ctx);
    try {
      const { ticket } = await resolveTicket(ctx, userId, ref);
      return await ticketDetail(ctx, ticket);
    } catch {
      return null;
    }
  },
});

/** Light list for the dependency picker. */
export const options = query({
  args: { project_id: v.id("projects") },
  returns: v.array(ticketLinkValidator),
  handler: async (ctx, { project_id }) => {
    const userId = await requireUserId(ctx);
    const project = await resolveProject(ctx, userId, project_id);
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_project", (q) => q.eq("project_id", project._id))
      .collect();
    tickets.sort((a, b) => b.number - a.number);
    const refs = refBuilder(ctx);
    return await Promise.all(tickets.map((t) => refs.link(t)));
  },
});

export const create = mutation({
  args: {
    project_id: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.optional(statusValidator),
    priority: v.optional(priorityValidator),
    labels: v.optional(v.array(v.string())),
  },
  returns: v.object({ ref: v.string() }),
  handler: async (ctx, { project_id, ...input }) => {
    const userId = await requireUserId(ctx);
    const project = await resolveProject(ctx, userId, project_id);
    const t = await createTicket(ctx, userId, "user", project, input);
    return { ref: `${project.key}-${t.number}` };
  },
});

export const update = mutation({
  args: {
    ticket_id: v.id("tickets"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(statusValidator),
    priority: v.optional(priorityValidator),
    labels: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, { ticket_id, ...patch }) => {
    const userId = await requireUserId(ctx);
    const { ticket } = await resolveTicket(ctx, userId, ticket_id);
    await updateTicket(ctx, userId, "user", ticket, patch);
    return null;
  },
});

export const move = mutation({
  args: {
    ticket_id: v.id("tickets"),
    status: statusValidator,
    before_id: v.union(v.id("tickets"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { ticket_id, status, before_id }) => {
    const userId = await requireUserId(ctx);
    const { ticket } = await resolveTicket(ctx, userId, ticket_id);
    await moveTicket(ctx, userId, "user", ticket, status, before_id);
    return null;
  },
});

export const remove = mutation({
  args: { ticket_id: v.id("tickets") },
  returns: v.null(),
  handler: async (ctx, { ticket_id }) => {
    const userId = await requireUserId(ctx);
    const { ticket } = await resolveTicket(ctx, userId, ticket_id);
    await deleteTicket(ctx, userId, "user", ticket);
    return null;
  },
});

export const addDep = mutation({
  args: { ticket_id: v.id("tickets"), depends_on_id: v.id("tickets") },
  returns: v.null(),
  handler: async (ctx, { ticket_id, depends_on_id }) => {
    const userId = await requireUserId(ctx);
    const { ticket } = await resolveTicket(ctx, userId, ticket_id);
    const { ticket: dep } = await resolveTicket(ctx, userId, depends_on_id);
    await addDependency(ctx, userId, "user", ticket, dep);
    return null;
  },
});

export const removeDep = mutation({
  args: { ticket_id: v.id("tickets"), depends_on_id: v.id("tickets") },
  returns: v.null(),
  handler: async (ctx, { ticket_id, depends_on_id }) => {
    const userId = await requireUserId(ctx);
    const { ticket } = await resolveTicket(ctx, userId, ticket_id);
    const { ticket: dep } = await resolveTicket(ctx, userId, depends_on_id);
    await removeDependency(ctx, userId, "user", ticket, dep);
    return null;
  },
});

export const comment = mutation({
  args: { ticket_id: v.id("tickets"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { ticket_id, text }) => {
    const userId = await requireUserId(ctx);
    const { ticket } = await resolveTicket(ctx, userId, ticket_id);
    await addComment(ctx, userId, "user", ticket, text);
    return null;
  },
});
