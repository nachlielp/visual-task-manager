import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const statusValidator = v.union(
  v.literal("backlog"),
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("review"),
  v.literal("done"),
);

export const priorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent"),
);

// Who made a change: the signed-in human (web UI) or Claude (MCP endpoint).
export const actorValidator = v.union(v.literal("user"), v.literal("claude"));

export default defineSchema({
  // One project per repo. `repo` is normalized "owner/name" (lowercase);
  // `key` is the short ticket prefix ("VTM" → VTM-12).
  projects: defineTable({
    user_id: v.string(), // Clerk subject
    name: v.string(),
    repo: v.string(),
    key: v.string(),
    description: v.optional(v.string()),
    next_number: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_user", ["user_id"])
    .index("by_user_repo", ["user_id", "repo"])
    .index("by_user_key", ["user_id", "key"]),

  tickets: defineTable({
    user_id: v.string(),
    project_id: v.id("projects"),
    number: v.number(),
    title: v.string(),
    description: v.optional(v.string()), // markdown
    status: statusValidator,
    priority: priorityValidator,
    labels: v.array(v.string()),
    // Position within its status column (fractional, ascending).
    order: v.number(),
    created_by: actorValidator,
    created_at: v.number(),
    updated_at: v.number(),
    completed_at: v.optional(v.number()),
  })
    .index("by_project", ["project_id"])
    .index("by_project_number", ["project_id", "number"])
    .index("by_project_status_order", ["project_id", "status", "order"]),

  // Nested checklist: the steps to complete a ticket. `parent_id` makes it a
  // tree; top-level items have no parent.
  checklist_items: defineTable({
    ticket_id: v.id("tickets"),
    parent_id: v.optional(v.id("checklist_items")),
    text: v.string(),
    done: v.boolean(),
    order: v.number(),
    created_at: v.number(),
  })
    .index("by_ticket", ["ticket_id", "order"]),

  // `ticket_id` depends on `depends_on_id` (i.e. depends_on blocks ticket).
  ticket_dependencies: defineTable({
    user_id: v.string(),
    ticket_id: v.id("tickets"),
    depends_on_id: v.id("tickets"),
    created_at: v.number(),
  })
    .index("by_ticket", ["ticket_id"])
    .index("by_depends_on", ["depends_on_id"])
    .index("by_pair", ["ticket_id", "depends_on_id"]),

  // Feed of what happened, so it's easy to see what Claude has been doing.
  activity: defineTable({
    user_id: v.string(),
    project_id: v.id("projects"),
    ticket_id: v.optional(v.id("tickets")),
    ticket_ref: v.optional(v.string()),
    actor: actorValidator,
    kind: v.union(v.literal("event"), v.literal("comment")),
    message: v.string(),
    created_at: v.number(),
  })
    .index("by_project", ["project_id"])
    .index("by_ticket", ["ticket_id"]),

  // Bearer tokens for the MCP endpoint. Only a SHA-256 hash is stored; the
  // plaintext is shown once at creation.
  api_keys: defineTable({
    user_id: v.string(),
    name: v.string(),
    key_hash: v.string(),
    prefix: v.string(),
    created_at: v.number(),
    last_used_at: v.optional(v.number()),
  })
    .index("by_user", ["user_id"])
    .index("by_hash", ["key_hash"]),
});
