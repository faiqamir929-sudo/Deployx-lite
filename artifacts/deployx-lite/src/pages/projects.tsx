import {
  Archive,
  ArchiveRestore,
  Copy,
  ExternalLink,
  FolderGit2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  getListProjectsQueryKey,
  useCreateProject,
  useDeleteProject,
  useDuplicateProject,
  useListProjects,
  useUpdateProject,
  type Project,
} from "@workspace/api-client-react";
import {
  DeployXShell,
  ErrorBlock,
  LoadingBlock,
  PageHeading,
} from "@/components/deployx-shell";

const initialForm = {
  name: "",
  description: "",
  repositoryUrl: "",
  branch: "main",
  framework: "Next.js",
  environment: "production" as "development" | "staging" | "production",
  tags: "",
};
function ProjectDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const create = useCreateProject();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!form.name || !form.repositoryUrl) {
      setError("Name and repository URL are required.");
      return;
    }
    create.mutate(
      {
        data: {
          ...form,
          tags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListProjectsQueryKey(),
          });
          onClose();
        },
        onError: () =>
          setError(
            "Could not create this project. Check the repository URL and try again.",
          ),
      },
    );
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4"
      role="dialog"
      data-testid="dialog-create-project"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">
              New workspace surface
            </div>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight">
              Add a project
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground"
            data-testid="button-close-dialog"
          >
            <X size={19} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {(
            [
              ["name", "Project name", "e.g. Atlas web"],
              [
                "repositoryUrl",
                "Repository URL",
                "https://github.com/team/repository",
              ],
              ["branch", "Deploy branch", "main"],
              ["framework", "Framework", "Next.js"],
              ["tags", "Tags", "frontend, customer-facing"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <label key={key} className="block">
              <span className="mb-1.5 block text-xs font-bold">{label}</span>
              <input
                data-testid={`input-project-${key}`}
                value={form[key]}
                onChange={(event) =>
                  setForm({ ...form, [key]: event.target.value })
                }
                placeholder={placeholder}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary"
              />
            </label>
          ))}
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold">
              Description{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </span>
            <textarea
              data-testid="input-project-description"
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
              rows={2}
              placeholder="What does this project do?"
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold">Environment</span>
            <select
              data-testid="select-project-environment"
              value={form.environment}
              onChange={(event) =>
                setForm({
                  ...form,
                  environment: event.target.value as typeof form.environment,
                })
              }
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
          </label>
          {error && (
            <p
              className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
              data-testid="text-form-error"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted"
              data-testid="button-cancel-project"
            >
              Cancel
            </button>
            <button
              disabled={create.isPending}
              className="rounded-lg bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50"
              data-testid="button-submit-project"
            >
              {create.isPending ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
function ProjectRow({
  project,
  onAction,
}: {
  project: Project;
  onAction: (
    action: "archive" | "restore" | "duplicate" | "delete",
    project: Project,
  ) => void;
}) {
  return (
    <div
      className="group grid gap-4 border-b border-border px-5 py-5 transition-colors last:border-0 hover:bg-muted/35 md:grid-cols-[1.5fr_1fr_.65fr_.7fr_auto] md:items-center"
      data-testid={`row-project-${project.id}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e9eff9] text-[#45658b]">
            <FolderGit2 size={17} />
          </div>
          <div className="min-w-0">
            <Link
              href={`/projects/${project.id}`}
              data-testid={`link-project-${project.id}`}
              className="block truncate text-sm font-extrabold hover:text-primary"
            >
              {project.name}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {project.description || "No description yet"}
            </p>
          </div>
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate font-mono text-xs text-foreground">
          {project.repositoryUrl.replace("https://github.com/", "")}
        </p>
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          {project.branch}
        </p>
      </div>
      <div>
        <span
          className={`inline-flex rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${project.status === "archived" ? "bg-muted text-muted-foreground" : "bg-accent/10 text-accent"}`}
        >
          {project.status}
        </span>
      </div>
      <div className="font-mono text-xs text-muted-foreground">
        {project.lastDeployment
          ? new Date(project.lastDeployment).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })
          : "Not deployed"}
      </div>
      <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
        <Link
          href={`/projects/${project.id}`}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-primary"
          data-testid={`button-open-${project.id}`}
        >
          <ExternalLink size={15} />
        </Link>
        <button
          onClick={() => onAction("duplicate", project)}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-primary"
          data-testid={`button-duplicate-${project.id}`}
        >
          <Copy size={15} />
        </button>
        <button
          onClick={() =>
            onAction(
              project.status === "archived" ? "restore" : "archive",
              project,
            )
          }
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-primary"
          data-testid={`button-archive-${project.id}`}
        >
          {project.status === "archived" ? (
            <ArchiveRestore size={15} />
          ) : (
            <Archive size={15} />
          )}
        </button>
        <button
          onClick={() => onAction("delete", project)}
          className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          data-testid={`button-delete-${project.id}`}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
export default function Projects() {
  const projects = useListProjects({
    query: { queryKey: getListProjectsQueryKey() },
  });
  const update = useUpdateProject();
  const duplicate = useDuplicateProject();
  const remove = useDeleteProject();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [confirm, setConfirm] = useState<Project | null>(null);
  const list = useMemo(
    () =>
      (projects.data ?? []).filter((p) =>
        `${p.name} ${p.repositoryUrl} ${(p.tags ?? []).join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [projects.data, search],
  );
  const action = (
    type: "archive" | "restore" | "duplicate" | "delete",
    project: Project,
  ) => {
    if (type === "delete") {
      setConfirm(project);
      return;
    }
    const done = () =>
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    if (type === "duplicate")
      duplicate.mutate({ projectId: project.id }, { onSuccess: done });
    else
      update.mutate(
        { projectId: project.id, data: { archived: type === "archive" } },
        { onSuccess: done },
      );
  };
  return (
    <DeployXShell>
      <PageHeading
        eyebrow="Workspace / projects"
        title="Projects"
        subtitle="The things you ship, organized for the moments that matter."
        action={
          <button
            onClick={() => setShowDialog(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground shadow-[0_3px_0_hsl(28_68%_38%)] hover:-translate-y-0.5"
            data-testid="button-new-project"
          >
            <Plus size={15} /> New project
          </button>
        }
      />
      {projects.isLoading ? (
        <LoadingBlock lines={6} />
      ) : projects.isError ? (
        <ErrorBlock retry={() => projects.refetch()} />
      ) : (
        <div className="animate-rise overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-col justify-between gap-4 border-b border-border p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-bold">
                All projects{" "}
                <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">
                  {projects.data?.length ?? 0}
                </span>
              </h2>
            </div>
            <label className="flex w-full items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 sm:w-64">
              <Search size={15} className="text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects"
                className="w-full bg-transparent text-xs outline-none"
                data-testid="input-search-projects"
              />
            </label>
          </div>
          <div className="hidden grid-cols-[1.5fr_1fr_.65fr_.7fr_auto] gap-4 border-b border-border bg-muted/45 px-5 py-3 font-mono text-[9px] uppercase tracking-[.16em] text-muted-foreground md:grid">
            <span>Project</span>
            <span>Repository</span>
            <span>Status</span>
            <span>Last deploy</span>
            <span />
          </div>
          {list.length === 0 ? (
            <div
              className="px-5 py-16 text-center"
              data-testid="empty-projects"
            >
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <FolderGit2 size={22} />
              </div>
              <h3 className="font-bold">
                {search ? "No matching projects" : "Your launchpad is empty"}
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
                {search
                  ? "Try a different search term."
                  : "Create your first project to give your team a calm place to ship from."}
              </p>
              {!search && (
                <button
                  onClick={() => setShowDialog(true)}
                  className="mt-5 text-xs font-extrabold text-primary"
                  data-testid="button-empty-create"
                >
                  Create a project <span aria-hidden>→</span>
                </button>
              )}
            </div>
          ) : (
            list.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                onAction={action}
              />
            ))
          )}
        </div>
      )}
      {showDialog && <ProjectDialog onClose={() => setShowDialog(false)} />}
      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <Trash2 size={18} />
            </div>
            <h2 className="text-lg font-extrabold">Delete {confirm.name}?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This permanently removes the project and its deployment history.
              This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="rounded-lg px-4 py-2 text-xs font-bold text-muted-foreground"
                data-testid="button-cancel-delete"
              >
                Keep project
              </button>
              <button
                onClick={() =>
                  remove.mutate(
                    { projectId: confirm.id },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({
                          queryKey: getListProjectsQueryKey(),
                        });
                        setConfirm(null);
                      },
                    },
                  )
                }
                disabled={remove.isPending}
                className="rounded-lg bg-destructive px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50"
                data-testid="button-confirm-delete"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </DeployXShell>
  );
}
