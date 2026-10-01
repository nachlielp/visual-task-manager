import { v } from "convex/values";
import { mutation } from "./_generated/server";
import {
  addChecklistItems,
  deleteChecklistItem,
  requireUserId,
  resolveChecklistItem,
  resolveTicket,
  updateChecklistItem,
} from "./model";

export const add = mutation({
  args: {
    ticket_id: v.id("tickets"),
    text: v.string(),
    parent_id: v.optional(v.id("checklist_items")),
  },
  returns: v.null(),
  handler: async (ctx, { ticket_id, text, parent_id }) => {
    const userId = await requireUserId(ctx);
    const { ticket } = await resolveTicket(ctx, userId, ticket_id);
    await addChecklistItems(ctx, userId, "user", ticket, [{ text }], parent_id);
    return null;
  },
});

export const update = mutation({
  args: {
    item_id: v.id("checklist_items"),
    text: v.optional(v.string()),
    done: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { item_id, ...patch }) => {
    const userId = await requireUserId(ctx);
    const { item, ticket } = await resolveChecklistItem(ctx, userId, item_id);
    await updateChecklistItem(ctx, userId, "user", item, ticket, patch);
    return null;
  },
});

export const remove = mutation({
  args: { item_id: v.id("checklist_items") },
  returns: v.null(),
  handler: async (ctx, { item_id }) => {
    const userId = await requireUserId(ctx);
    const { item, ticket } = await resolveChecklistItem(ctx, userId, item_id);
    await deleteChecklistItem(ctx, item, ticket);
    return null;
  },
});
