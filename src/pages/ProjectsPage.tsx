import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Button, Input, Label, Modal, useToast } from "@/components/ui";
import { IconFolder, IconPlus, IconSparkle } from "@/components/Icons";
import { STATUSES, STATUS_DOT, STATUS_LABELS, errorText, timeAgo, type ProjectView } from "@/lib/tickets";
import { cn } from "@/lib/utils";

export default function ProjectsPage() {
  const projects = useQuery(api.projects.list);
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker text-muted">One per repo</div>
          <h1 className="text-3xl font-extrabold tracking-tight">Projects</h1>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <IconPlus /> New project
        </Button>
      </div>

      {projects === undefined ? (
        <div className="mt-8 text-sm font-semibold text-muted">Loading…</div>
      ) : projects.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p._id} project={p} />
          ))}
        </div>
      )}

      <NewProjectModal open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function ProjectCard({ project: p }: { project: ProjectView }) {
  const total = STATUSES.reduce((n, s) => n + p.counts[s], 0);
  const open = total - p.counts.done;
  return (
    <Link
      to={`/p/${p.key}`}
      className="card group flex flex-col gap-3 p-4 transition-transform hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-lg font-extrabold tracking-tight group-hover:text-brand">
            {p.name}
          </div>
          <div className="truncate font-mono text-xs text-muted">{p.repo}</div>
        </div>
        <span className="rounded-md border-[1.5px] border-brand/30 bg-tint px-2 py-0.5 text-[11px] font-extrabold text-brand">
          {p.key}
        </span>
      </div>
      {p.description && <p className="line-clamp-2 text-sm text-muted">{p.description}</p>}
      {total > 0 && (
        <div className="flex h-2 overflow-hidden rounded-sm bg-paper-dark">
          {STATUSES.map((s) =>
            p.counts[s] ? (
              <div
                key={s}
                className={cn(STATUS_DOT[s])}
                style={{ width: `${(p.counts[s] / total) * 100}%` }}
                title={`${STATUS_LABELS[s]}: ${p.counts[s]}`}
              />
            ) : null,
          )}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between text-xs font-semibold text-muted">
        <span>
          {p.counts.in_progress > 0 && (
            <span className="text-brand">{p.counts.in_progress} in progress · </span>
          )}
          {open} open · {p.counts.done} done
        </span>
        <span>{timeAgo(p.updated_at)}</span>
      </div>
    </Link>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-8 rounded-lg border-[1.5px] border-dashed border-line-strong p-8 text-center text-muted">
      <IconFolder className="mx-auto mb-3 text-3xl" />
      <p className="font-semibold text-ink">No projects yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm">
        Connect Claude and it will create a project for each repo it works in — or add one
        yourself.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild variant="primary">
          <Link to="/settings">
            <IconSparkle /> Connect Claude
          </Link>
        </Button>
        <Button onClick={onCreate}>
          <IconPlus /> New project
        </Button>
      </div>
    </div>
  );
}

function NewProjectModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useMutation(api.projects.create);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [repo, setRepo] = useState("");
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await create({
        repo,
        name: name || undefined,
        key: key || undefined,
      });
      onOpenChange(false);
      setRepo("");
      setName("");
      setKey("");
      navigate(`/p/${res.key}`);
    } catch (err) {
      toast(errorText(err), "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New project" description="One project per repo.">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="repo">Repo</Label>
          <Input
            id="repo"
            required
            autoFocus
            placeholder="owner/name or git URL"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="defaults to repo name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex w-28 flex-col gap-1.5">
            <Label htmlFor="key">Key</Label>
            <Input
              id="key"
              placeholder="auto"
              value={key}
              maxLength={10}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !repo.trim()}>
            Create project
          </Button>
        </div>
      </form>
    </Modal>
  );
}
