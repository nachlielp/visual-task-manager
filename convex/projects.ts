import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  createProject,
  deleteProject,
  projectView,
  requireUserId,
  resolveProject,
  updateProject,
} from "./model";
import { projectViewValidator } from "./validators";

export const list = query({
  args: {},
  returns: v.array(projectViewValidator),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .collect();
    projects.sort((a, b) => b.updated_at - a.updated_at);
    return await Promise.all(projects.map((p) => projectView(ctx, p)));
  },
});

export const getByKey = query({
  args: { key: v.string() },
  returns: v.union(projectViewValidator, v.null()),
  handler: async (ctx, { key }) => {
    const userId = await requireUserId(ctx);
    const p = await ctx.db
      .query("projects")
      .withIndex("by_user_key", (q) =>
        q.eq("user_id", userId).eq("key", key.toUpperCase()),
      )
      .first();
    return p ? await projectView(ctx, p) : null;
  },
});

export const create = mutation({
  args: {
    repo: v.string(),
    name: v.optional(v.string()),
    key: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.object({ key: v.string() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const p = await createProject(ctx, userId, "user", args);
    return { key: p.key };
  },
});

export const update = mutation({
  args: {
    project_id: v.id("projects"),
    name: v.optional(v.string()),
    key: v.optional(v.string()),
    repo: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.object({ key: v.string() }),
  handler: async (ctx, { project_id, ...patch }) => {
    const userId = await requireUserId(ctx);
    const p = await resolveProject(ctx, userId, project_id);
    await updateProject(ctx, userId, "user", p, patch);
    return { key: (await ctx.db.get(p._id))!.key };
  },
});

export const remove = mutation({
  args: { project_id: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, { project_id }) => {
    const userId = await requireUserId(ctx);
    const p = await resolveProject(ctx, userId, project_id);
    await deleteProject(ctx, p);
    return null;
  },
});
