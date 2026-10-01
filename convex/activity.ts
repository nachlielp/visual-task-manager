import { v } from "convex/values";
import { query } from "./_generated/server";
import { activityView, requireUserId, resolveProject } from "./model";
import { activityViewValidator } from "./validators";

export const forProject = query({
  args: { project_id: v.id("projects"), limit: v.optional(v.number()) },
  returns: v.array(activityViewValidator),
  handler: async (ctx, { project_id, limit }) => {
    const userId = await requireUserId(ctx);
    const project = await resolveProject(ctx, userId, project_id);
    const rows = await ctx.db
      .query("activity")
      .withIndex("by_project", (q) => q.eq("project_id", project._id))
      .order("desc")
      .take(Math.min(limit ?? 60, 200));
    return rows.map(activityView);
  },
});
