import { v } from "convex/values";
import {
  actorValidator,
  priorityValidator,
  statusValidator,
} from "./schema";

export const statusCountsValidator = v.object({
  backlog: v.number(),
  todo: v.number(),
  in_progress: v.number(),
  review: v.number(),
  done: v.number(),
});

export const projectViewValidator = v.object({
  _id: v.id("projects"),
  name: v.string(),
  repo: v.string(),
  key: v.string(),
  description: v.optional(v.string()),
  created_at: v.number(),
  updated_at: v.number(),
  counts: statusCountsValidator,
});

export const ticketLinkValidator = v.object({
  _id: v.id("tickets"),
  ref: v.string(),
  title: v.string(),
  status: statusValidator,
});

export const ticketSummaryValidator = v.object({
  _id: v.id("tickets"),
  ref: v.string(),
  number: v.number(),
  project_id: v.id("projects"),
  title: v.string(),
  status: statusValidator,
  priority: priorityValidator,
  labels: v.array(v.string()),
  order: v.number(),
  created_by: actorValidator,
  created_at: v.number(),
  updated_at: v.number(),
  completed_at: v.optional(v.number()),
  has_description: v.boolean(),
  checklist: v.object({ done: v.number(), total: v.number() }),
  // Unfinished tickets this one is waiting on.
  blocked_by: v.array(ticketLinkValidator),
  depends_on_count: v.number(),
  blocks_count: v.number(),
});

export const checklistItemViewValidator = v.object({
  _id: v.id("checklist_items"),
  parent_id: v.optional(v.id("checklist_items")),
  text: v.string(),
  done: v.boolean(),
  order: v.number(),
  depth: v.number(),
});

export const activityViewValidator = v.object({
  _id: v.id("activity"),
  ticket_id: v.optional(v.id("tickets")),
  ticket_ref: v.optional(v.string()),
  actor: actorValidator,
  kind: v.union(v.literal("event"), v.literal("comment")),
  message: v.string(),
  created_at: v.number(),
});

export const ticketDetailValidator = v.object({
  ...ticketSummaryValidator.fields,
  description: v.optional(v.string()),
  project_key: v.string(),
  project_name: v.string(),
  checklist_items: v.array(checklistItemViewValidator),
  depends_on: v.array(ticketLinkValidator),
  blocks: v.array(ticketLinkValidator),
  activity: v.array(activityViewValidator),
});
