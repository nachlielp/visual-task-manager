import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button, Input, useConfirm, useToast } from "@/components/ui";
import { IconCopy, IconKey, IconTrash } from "@/components/Icons";
import { errorText, timeAgo } from "@/lib/tickets";

// HTTP actions live on the .convex.site twin of the deployment URL.
const MCP_URL = `${(import.meta.env.VITE_CONVEX_URL as string).replace(
  /\.convex\.cloud\/?$/,
  ".convex.site",
)}/mcp`;

const CLAUDE_MD = `## Task tracking
Use the task-board MCP to track your work so I can follow it on my board:
- At the start of a task, call ensure_project with this repo ("owner/name" from the git remote).
- Create a ticket for each non-trivial task with a checklist of the steps; set it to in_progress when you start.
- Tick off checklist items as you finish them, add_comment for notable decisions, and move the ticket to review/done when finished.
- Use add_dependency when one ticket must wait for another.`;

function addCommand(token: string) {
  return `claude mcp add --transport http --scope user task-board ${MCP_URL} --header "Authorization: Bearer ${token}"`;
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
  const [name, setName] = useState("Claude Code");
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <div className="kicker text-brand">MCP</div>
        <h1 className="text-3xl font-extrabold tracking-tight">Connect Claude</h1>
        <p className="mt-2 text-muted">
          Claude manages tickets through an MCP server with full create / read / update / delete
          access to your projects, tickets, checklists and dependencies. Changes show up on the
          board live.
        </p>
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
                      description: "Claude sessions using this key will lose access.",
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
        <h2 className="text-lg font-extrabold">2. Add the server to Claude Code</h2>
        <p className="text-sm text-muted">
          Run this once in a terminal. <code>--scope user</code> makes it available in every repo.
        </p>
        <CopyBlock text={addCommand(token ?? "<your-api-key>")} label="Copy command" />
        <p className="text-sm text-muted">
          Any MCP client that speaks Streamable HTTP works: point it at{" "}
          <code className="break-all">{MCP_URL}</code> with an{" "}
          <code>Authorization: Bearer</code> header.
        </p>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="text-lg font-extrabold">3. Tell Claude to use it (optional)</h2>
        <p className="text-sm text-muted">
          The server already explains the workflow to Claude. To make it track work without
          being asked, add this to <code>~/.claude/CLAUDE.md</code>:
        </p>
        <CopyBlock text={CLAUDE_MD} label="Copy instructions" />
      </section>
    </div>
  );
}
