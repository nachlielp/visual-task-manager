import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Button,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  useConfirm,
  useToast,
} from "@/components/ui";
import { IconCopy, IconKey, IconTrash } from "@/components/Icons";
import { errorText, timeAgo } from "@/lib/tickets";

// HTTP actions live on the .convex.site twin of the deployment URL.
const MCP_URL = `${(import.meta.env.VITE_CONVEX_URL as string).replace(
  /\.convex\.cloud\/?$/,
  ".convex.site",
)}/mcp`;

const INSTRUCTIONS = `## Task tracking
Use the task-board MCP to track your work so I can follow it on my board:
- At the start of a task, call ensure_project with this repo ("owner/name" from the git remote).
- Create a ticket for each non-trivial task with a checklist of the steps; set it to in_progress when you start.
- Tick off checklist items as you finish them, add_comment for notable decisions, and move the ticket to review/done when finished.
- Use add_dependency when one ticket must wait for another.`;

type Client = "claude" | "codex";

const CLIENTS: Record<
  Client,
  { label: string; keyName: string; instructionsFile: string }
> = {
  claude: { label: "Claude Code", keyName: "Claude Code", instructionsFile: "~/.claude/CLAUDE.md" },
  codex: { label: "Codex (OpenAI)", keyName: "Codex", instructionsFile: "~/.codex/AGENTS.md" },
};

function claudeCommand(token: string) {
  return `claude mcp add --transport http --scope user task-board ${MCP_URL} --header "Authorization: Bearer ${token}"`;
}

function codexConfig(token: string) {
  return `[mcp_servers.task-board]
url = "${MCP_URL}"
http_headers = { "Authorization" = "Bearer ${token}" }`;
}

function CopyBlock({ text, label }: { text: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      {/* Inline padding: the global `pre` rule would override a utility class. */}
      <pre className="text-[12.5px] whitespace-pre-wrap break-all" style={{ paddingRight: 64 }}>
        <code>{text}</code>
      </pre>
      <Button
        variant={copied ? "success" : "secondary"}
        className="absolute top-2 right-2"
        aria-label={label ?? "Copy"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          } catch {
            toast("Couldn't copy — select the text instead", "danger");
          }
        }}
      >
        {copied ? "✓" : <IconCopy />}
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  const keys = useQuery(api.apiKeys.list);
  const createKey = useAction(api.apiKeys.create);
  const revoke = useMutation(api.apiKeys.revoke);
  const confirm = useConfirm();
  const { toast } = useToast();
  const [client, setClient] = useState<Client>("claude");
  const [name, setName] = useState(CLIENTS.claude.keyName);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mint = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createKey({ name });
      setToken(res.token);
    } catch (err) {
      toast(errorText(err), "danger");
    } finally {
      setBusy(false);
    }
  };

  const pickClient = (next: Client) => {
    // Keep a custom key name; only swap the default one.
    if (name === CLIENTS[client].keyName) setName(CLIENTS[next].keyName);
    setClient(next);
  };

  const key = token ?? "<your-api-key>";
  const { label, instructionsFile } = CLIENTS[client];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <div className="kicker text-brand">MCP</div>
        <h1 className="text-3xl font-extrabold tracking-tight">Connect an agent</h1>
        <p className="mt-2 text-muted">
          Coding agents manage tickets through an MCP server with full create / read / update /
          delete access to your projects, tickets, checklists and dependencies. Changes show up on
          the board live.
        </p>
        <Tabs value={client} onValueChange={(v) => pickClient(v as Client)} className="mt-4">
          <TabsList aria-label="Agent">
            {(Object.keys(CLIENTS) as Client[]).map((c) => (
              <TabsTrigger key={c} value={c}>
                {CLIENTS[c].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <section className="card flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-lg font-extrabold">1. Create an API key</h2>
          <p className="text-sm text-muted">
            The key is shown once. Anyone with it can edit your board, so treat it like a
            password.
          </p>
        </div>
        <form onSubmit={mint} className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name" />
          <Button type="submit" variant="primary" disabled={busy}>
            <IconKey /> Create key
          </Button>
        </form>
        {token && (
          <div className="callout-warn flex flex-col gap-3">
            <div className="font-bold">Copy this now — it won't be shown again.</div>
            <CopyBlock text={token} label="Copy key" />
          </div>
        )}
        {keys && keys.length > 0 && (
          <ul className="flex flex-col divide-y divide-line/70 rounded-md border-[1.5px] border-line">
            {keys.map((k) => (
              <li key={k._id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <IconKey className="text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{k.name}</div>
                  <div className="font-mono text-xs text-muted">
                    {k.prefix}… · created {timeAgo(k.created_at)}
                    {k.last_used_at ? ` · used ${timeAgo(k.last_used_at)}` : " · never used"}
                  </div>
                </div>
                <Button
                  variant="ghost-danger"
                  aria-label={`Revoke ${k.name}`}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Revoke “${k.name}”?`,
                      description: "Agents using this key will lose access.",
                      confirmText: "Revoke",
                      variant: "danger",
                    });
                    if (ok) await revoke({ key_id: k._id });
                  }}
                >
                  <IconTrash />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-extrabold">2. Add the server to {label}</h2>
        {client === "claude" ? (
          <>
            <p className="text-sm text-muted">
              Run this once in a terminal. <code>--scope user</code> makes it available in every
              repo.
            </p>
            <CopyBlock text={claudeCommand(key)} label="Copy command" />
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              Add this to <code>~/.codex/config.toml</code>. The Codex CLI, IDE extension and app
              share that file, so it's available in every repo. Check it with{" "}
              <code>codex mcp list</code>.
            </p>
            <CopyBlock text={codexConfig(key)} label="Copy config" />
          </>
        )}
        <p className="text-sm text-muted">
          Any MCP client that speaks Streamable HTTP works: point it at{" "}
          <code className="break-all">{MCP_URL}</code> with an{" "}
          <code>Authorization: Bearer</code> header.
        </p>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-extrabold">3. Tell {label} to use it (optional)</h2>
        <p className="text-sm text-muted">
          The server already explains the workflow to the agent. To make it track work without
          being asked, add this to <code>{instructionsFile}</code>:
        </p>
        <CopyBlock text={INSTRUCTIONS} label="Copy instructions" />
      </section>
    </div>
  );
}
