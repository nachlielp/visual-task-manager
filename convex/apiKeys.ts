import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { fail, requireUserId } from "./model";

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `vtm_${b64}`;
}

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("api_keys"),
      name: v.string(),
      prefix: v.string(),
      created_at: v.number(),
      last_used_at: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const keys = await ctx.db
      .query("api_keys")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .order("desc")
      .collect();
    return keys.map((k) => ({
      _id: k._id,
      name: k.name,
      prefix: k.prefix,
      created_at: k.created_at,
      last_used_at: k.last_used_at,
    }));
  },
});

/**
 * Mint a key. Runs as an action so the token comes from real (non-replayed)
 * randomness; the plaintext is returned exactly once and never stored.
 */
export const create = action({
  args: { name: v.string() },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, { name }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) fail("Not authenticated");
    const token = randomToken();
    await ctx.runMutation(internal.apiKeys.insert, {
      user_id: identity.subject,
      name: name.trim() || "Claude",
      key_hash: await sha256Hex(token),
      prefix: token.slice(0, 10),
    });
    return { token };
  },
});

export const insert = internalMutation({
  args: {
    user_id: v.string(),
    name: v.string(),
    key_hash: v.string(),
    prefix: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("api_keys", { ...args, created_at: Date.now() });
    return null;
  },
});

export const revoke = mutation({
  args: { key_id: v.id("api_keys") },
  returns: v.null(),
  handler: async (ctx, { key_id }) => {
    const userId = await requireUserId(ctx);
    const key = await ctx.db.get(key_id);
    if (!key || key.user_id !== userId) fail("Key not found");
    await ctx.db.delete(key_id);
    return null;
  },
});

export const lookup = internalQuery({
  args: { key_hash: v.string() },
  returns: v.union(
    v.object({ key_id: v.id("api_keys"), user_id: v.string() }),
    v.null(),
  ),
  handler: async (ctx, { key_hash }) => {
    const key = await ctx.db
      .query("api_keys")
      .withIndex("by_hash", (q) => q.eq("key_hash", key_hash))
      .first();
    return key ? { key_id: key._id, user_id: key.user_id } : null;
  },
});

/** CLI escape hatch: `npx convex run apiKeys:revokeByPrefix '{"prefix":"vtm_abc123"}'`. */
export const revokeByPrefix = internalMutation({
  args: { prefix: v.string() },
  returns: v.number(),
  handler: async (ctx, { prefix }) => {
    const keys = (await ctx.db.query("api_keys").collect()).filter((k) =>
      k.prefix.startsWith(prefix),
    );
    for (const k of keys) await ctx.db.delete(k._id);
    return keys.length;
  },
});
