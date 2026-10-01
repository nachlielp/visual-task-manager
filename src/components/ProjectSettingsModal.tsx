import { useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Button, Input, Label, Modal, Textarea, useConfirm, useToast } from "@/components/ui";
import { IconTrash } from "@/components/Icons";
import { errorText, type ProjectView } from "@/lib/tickets";

export function ProjectSettingsModal({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Project settings">
      {/* Mounted only while open, so the fields start from the latest values. */}
      <SettingsForm project={project} onDone={() => onOpenChange(false)} />
    </Modal>
  );
}

function SettingsForm({ project, onDone }: { project: ProjectView; onDone: () => void }) {
  const update = useMutation(api.projects.update);
  const remove = useMutation(api.projects.remove);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [name, setName] = useState(project.name);
  const [key, setKey] = useState(project.key);
  const [repo, setRepo] = useState(project.repo);
  const [description, setDescription] = useState(project.description ?? "");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await update({ project_id: project._id, name, key, repo, description });
      onDone();
      toast("Project saved", "success");
      if (res.key !== project.key) navigate(`/p/${res.key}`, { replace: true });
    } catch (err) {
      toast(errorText(err), "danger");
    }
  };

  const destroy = async () => {
    const ok = await confirm({
      title: `Delete ${project.name}?`,
      description: "All tickets, checklists and activity in this project are deleted for good.",
      confirmText: "Delete project",
      variant: "danger",
    });
    if (!ok) return;
    await remove({ project_id: project._id });
    navigate("/");
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="ps-name">Name</Label>
          <Input id="ps-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex w-28 flex-col gap-1.5">
          <Label htmlFor="ps-key">Key</Label>
          <Input
            id="ps-key"
            value={key}
            maxLength={10}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ps-repo">Repo</Label>
        <Input id="ps-repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ps-desc">Description</Label>
        <Textarea
          id="ps-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button type="button" variant="ghost-danger" onClick={destroy}>
          <IconTrash /> Delete project
        </Button>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </div>
    </form>
);
}
