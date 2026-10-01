// MCP server over Streamable HTTP, served from Convex at
//   https://<deployment>.convex.site/mcp
// Stateless: every POST carries JSON-RPC message(s) and gets a JSON reply (no
// SSE stream, no session). Auth is a per-user API key minted in the web app:
//   Authorization: Bearer vtm_...
import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { sha256Hex } from "./apiKeys";
import { SERVER_INSTRUCTIONS, tools } from "./mcp";

const SUPPORTED_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "task-board", title: "Task Board", version: "1.0.0" };

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};
type Auth = { user_id: string; key_id: Id<"api_keys"> };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const rpcError = (id: JsonRpcMessage["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

function errorMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    return typeof err.data === "string" ? err.data : JSON.stringify(err.data);
  }
  return err instanceof Error ? err.message : String(err);
}

async function authenticate(ctx: ActionCtx, req: Request): Promise<Auth | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  if (!token) return null;
  return await ctx.runQuery(internal.apiKeys.lookup, {
    key_hash: await sha256Hex(token),
  });
}

async function handle(ctx: ActionCtx, auth: Auth, msg: JsonRpcMessage) {
  const { id, method, params } = msg;
  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      const protocolVersion =
        typeof requested === "string" && SUPPORTED_PROTOCOLS.includes(requested)
          ? requested
          : SUPPORTED_PROTOCOLS[1];
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: SERVER_INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools } };
    case "tools/call": {
      const name = params?.name;
      if (typeof name !== "string") return rpcError(id, -32602, "Missing tool name");
      if (!tools.some((t) => t.name === name)) {
        return rpcError(id, -32602, `Unknown tool: ${name}`);
      }
      try {
        const result = await ctx.runMutation(internal.mcp.callTool, {
          user_id: auth.user_id,
          key_id: auth.key_id,
          name,
          args: params?.arguments ?? {},
        });
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        };
      } catch (err) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: `Error: ${errorMessage(err)}` }],
            isError: true,
          },
        };
      }
    }
    case "resources/list":
      return { jsonrpc: "2.0", id, result: { resources: [] } };
    case "prompts/list":
      return { jsonrpc: "2.0", id, result: { prompts: [] } };
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

const mcpPost = httpAction(async (ctx, req) => {
  const auth = await authenticate(ctx, req);
  if (!auth) {
    return json(
      rpcError(
        null,
        -32001,
        "Unauthorized: pass 'Authorization: Bearer <api key>' (create a key in Task Board → Settings)",
      ),
      401,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }

  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as JsonRpcMessage[];
  const responses = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object" || typeof msg.method !== "string") {
      // A response or junk from the client — nothing to answer.
      continue;
    }
    // Notifications (no id) get no response.
    if (msg.id === undefined || msg.id === null) continue;
    responses.push(await handle(ctx, auth, msg));
  }

  if (responses.length === 0) return new Response(null, { status: 202 });
  return json(batch ? responses : responses[0]);
});

// No server-initiated stream and no sessions to end.
const notAllowed = httpAction(
  async () =>
    new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } }),
);

const http = httpRouter();
http.route({ path: "/mcp", method: "POST", handler: mcpPost });
http.route({ path: "/mcp", method: "GET", handler: notAllowed });
http.route({ path: "/mcp", method: "DELETE", handler: notAllowed });
export default http;
