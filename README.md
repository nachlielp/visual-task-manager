# Task Board

A Trello-style board for tickets that Claude manages. There's one project per git repo. Claude reads and writes tickets through an MCP server, and the board updates live so you can see what's going on.

- **Board**: Backlog → To do → In progress → Review → Done columns, with drag-and-drop.
- **Tickets**: markdown description, priority, labels, and a **nested checklist** of steps (sub-steps go to any depth).
- **Dependencies**: a ticket can *depend on* other tickets and *block* others. Cards show "Blocked by …" until every blocker is done. The server rejects links that would form a cycle.
- **Activity feed**: every change is logged with who made it (Claude or you), plus comments and progress notes.
- **PWA**: installable and works offline from cache. A new deploy reaches every open tab within about a minute.

Stack: React 19 + Vite PWA on Vercel, Convex (database, functions and the MCP HTTP endpoint), Clerk (auth).

## Run locally

Requires Node ≥ 20.19 (`nvm use`).

```bash
pnpm install
pnpm dev          # vite + convex dev in parallel
```

`.env.local` holds `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL` and `VITE_CLERK_PUBLISHABLE_KEY`. The Convex deployment env holds `CLERK_JWT_ISSUER_DOMAIN` and, optionally, `APP_URL` (the deployed site; when set, MCP responses include ticket links).

## Connect an agent (MCP)

1. Sign in, then open **Connect agent** and create an API key. It's shown once.
2. Register the server, once per machine.

   Claude Code:

   ```bash
   claude mcp add --transport http --scope user task-board https://<deployment>.convex.site/mcp --header "Authorization: Bearer <api-key>"
   ```

   Codex (OpenAI), in `~/.codex/config.toml`:

   ```toml
   [mcp_servers.task-board]
   url = "https://<deployment>.convex.site/mcp"
   http_headers = { "Authorization" = "Bearer <api-key>" }
   ```

The Settings page shows both with your URL and key already filled in.

The server is stateless JSON-RPC over Streamable HTTP, served by a Convex HTTP action (`convex/http.ts`). Each tool call runs as a single Convex mutation, so a call either fully applies or fully rolls back. Only SHA-256 hashes of API keys are stored. To revoke a key, use the Settings page, or from the CLI:
`npx convex run apiKeys:revokeByPrefix '{"prefix":"vtm_abc123"}'`.

### Tools

| Area | Tools |
|---|---|
| Projects | `list_projects`, `ensure_project` (get or create by repo), `get_project`, `update_project`, `delete_project` |
| Tickets | `list_tickets`, `get_ticket`, `create_ticket` (with nested `checklist` + `depends_on`), `update_ticket`, `delete_ticket` |
| Checklist | `add_checklist_items` (nested, optionally under `parent_item_id`), `update_checklist_item`, `delete_checklist_item` |
| Links | `add_dependency`, `remove_dependency` |
| Notes | `add_comment` |

Projects can be referenced by key (`VTM`), by repo (`owner/name`) or by any git remote URL. Tickets are referenced by ref (`VTM-12`).

## Code map

- `convex/model.ts`: all domain logic (projects, tickets, checklist tree, dependency graph, activity). Both the web functions and the MCP use it.
- `convex/projects.ts`, `tickets.ts`, `checklist.ts`, `activity.ts`, `apiKeys.ts`: Clerk-authenticated functions for the web app.
- `convex/mcp.ts`: MCP tool schemas and the dispatcher. `convex/http.ts`: the `/mcp` transport.
- `src/pages/BoardPage.tsx`: the board and drag-and-drop. `src/components/TicketDialog.tsx`: the ticket view.
- `src/sw.ts`, the registration block in `src/main.tsx`, and `vercel.json` together form the PWA update system. Change all three together.

## Deploy

On Vercel, set the build command to `npx convex deploy --cmd 'pnpm build'`. In Vercel env, set `CONVEX_DEPLOY_KEY` (production) and `VITE_CLERK_PUBLISHABLE_KEY`. On the Convex prod deployment, set `CLERK_JWT_ISSUER_DOMAIN` and `APP_URL` with `npx convex env set --prod …`.
