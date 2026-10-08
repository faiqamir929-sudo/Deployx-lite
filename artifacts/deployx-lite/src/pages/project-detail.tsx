import {
  Activity,
  ArrowLeft,
  Check,
  Clock3,
  Code2,
  GitCommitHorizontal,
  Globe2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import {
  getGetRepositoryQueryKey,
  getListDeploymentsQueryKey,
  getListEnvironmentVariablesQueryKey,
  getListProjectsQueryKey,
  useCreateDeployment,
  useCreateEnvironmentVariable,
  useDeleteEnvironmentVariable,
  useGetRepository,
  useListDeployments,
  useListEnvironmentVariables,
  useListProjects,
  useRollbackDeployment,
  useUpdateEnvironmentVariable,
  type EnvironmentVariable,
  type Project,
} from "@workspace/api-client-react";
import {
  DeployXShell,
  ErrorBlock,
  LoadingBlock,
} from "@/components/deployx-shell";

function Status({ value }: { value: string }) {
  const tone =
    value === "success"
      ? "bg-accent/10 text-accent"
      : value === "failed"
        ? "bg-destructive/10 text-destructive"
        : value === "running"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${tone}`}
      data-testid={`status-${value}`}
    >
      {value}
    </span>
  );
}
function EnvRow({
  variable,
  projectId,
  onDone,
}: {
  variable: EnvironmentVariable;
  projectId: string;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const update = useUpdateEnvironmentVariable();
  const remove = useDeleteEnvironmentVariable();
  const queryClient = useQueryClient();
  return (
    <div
      className="flex flex-col gap-3 border-b border-border py-4 last:border-0 sm:flex-row sm:items-center"
      data-testid={`row-variable-${variable.id}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eee8f4] text-[#76598e]">
          <KeyRound size={15} />
        </div>
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-medium">
            {variable.key}
          </p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            {variable.environment} · v{variable.version}
          </p>
        </div>
      </div>
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="New value"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-primary sm:w-40"
          data-testid={`input-edit-variable-${variable.id}`}
        />
      ) : (
        <button
          onClick={() => setShow(!show)}
          className="flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-foreground"
          data-testid={`button-reveal-variable-${variable.id}`}
        >
          <LockKeyhole size={12} />
          {show ? variable.maskedValue : "••••••••••••"}
        </button>
      )}
      <div className="flex items-center gap-1 sm:ml-auto">
        {editing ? (
          <>
            <button
              onClick={() =>
                update.mutate(
                  { projectId, variableId: variable.id, data: { value } },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({
                        queryKey:
                          getListEnvironmentVariablesQueryKey(projectId),
                      });
                      setEditing(false);
                      onDone();
                    },
                  },
                )
              }
              className="rounded-md p-2 text-accent hover:bg-accent/10"
              data-testid={`button-save-variable-${variable.id}`}
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md p-2 text-muted-foreground"
              data-testid={`button-cancel-variable-${variable.id}`}
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setValue("");
                setEditing(true);
              }}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted"
              data-testid={`button-edit-variable-${variable.id}`}
            >
              Edit
            </button>
            <button
              onClick={() =>
                remove.mutate(
                  { projectId, variableId: variable.id },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({
                        queryKey:
                          getListEnvironmentVariablesQueryKey(projectId),
                      });
                      onDone();
                    },
                  },
                )
              }
              className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              data-testid={`button-delete-variable-${variable.id}`}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
function AddVariable({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [environment, setEnvironment] = useState<
    "development" | "staging" | "production"
  >("production");
  const create = useCreateEnvironmentVariable();
  const queryClient = useQueryClient();
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto]">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          placeholder="KEY_NAME"
          className="rounded-md border border-input bg-card px-2.5 py-2 font-mono text-xs outline-none focus:border-primary"
          data-testid="input-env-key"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Value"
          type="password"
          className="rounded-md border border-input bg-card px-2.5 py-2 font-mono text-xs outline-none focus:border-primary"
          data-testid="input-env-value"
        />
        <select
          value={environment}
          onChange={(e) => setEnvironment(e.target.value as typeof environment)}
          className="rounded-md border border-input bg-card px-2.5 py-2 text-xs outline-none"
          data-testid="select-env-environment"
        >
          <option value="production">Production</option>
          <option value="staging">Staging</option>
          <option value="development">Development</option>
        </select>
        <button
          onClick={() =>
            create.mutate(
              { projectId, data: { key, value, environment } },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({
                    queryKey: getListEnvironmentVariablesQueryKey(projectId),
                  });
                  onClose();
                },
              },
            )
          }
          disabled={!key || !value || create.isPending}
          className="rounded-md bg-primary px-3 py-2 text-xs font-extrabold text-primary-foreground disabled:opacity-50"
          data-testid="button-save-env"
        >
          Add
        </button>
      </div>
    </div>
  );
}
export default function ProjectDetail() {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const projects = useListProjects({
    query: { queryKey: getListProjectsQueryKey() },
  });
  const project = projects.data?.find((item) => item.id === projectId) as
    Project | undefined;
  const repo = useGetRepository(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getGetRepositoryQueryKey(projectId),
    },
  });
  const variables = useListEnvironmentVariables(projectId, undefined, {
    query: {
      enabled: !!projectId,
      queryKey: getListEnvironmentVariablesQueryKey(projectId),
    },
  });
  const deployments = useListDeployments(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getListDeploymentsQueryKey(projectId),
      refetchInterval: (query) =>
        query.state.data?.some(
          (d) => d.status === "running" || d.status === "queued",
        )
          ? 1000
          : false,
    },
  });
  const createDeployment = useCreateDeployment();
  const rollback = useRollbackDeployment();
  const queryClient = useQueryClient();
  const [addingEnv, setAddingEnv] = useState(false);
  const [deployNotice, setDeployNotice] = useState("");
  const requestKeys = useRef(new Map<string, string>());
  const requestKey = (operation: string) => {
    const existing = requestKeys.current.get(operation);
    if (existing) return existing;
    const key = crypto.randomUUID();
    requestKeys.current.set(operation, key);
    return key;
  };
  if (projects.isLoading)
    return (
      <DeployXShell>
        <LoadingBlock />
      </DeployXShell>
    );
  if (!project)
    return (
      <DeployXShell>
        <ErrorBlock retry={() => projects.refetch()} />
      </DeployXShell>
    );
  const deploy = () => {
    const operation = `deploy:${projectId}`;
    setDeployNotice("");
    createDeployment.mutate(
      {
        projectId,
        headers: { "Idempotency-Key": requestKey(operation) },
      },
      {
        onSuccess: () => {
          requestKeys.current.delete(operation);
          setDeployNotice("Deployment queued for the background worker.");
          queryClient.invalidateQueries({
            queryKey: getListDeploymentsQueryKey(projectId),
          });
          queryClient.invalidateQueries({
            queryKey: getListProjectsQueryKey(),
          });
        },
        onError: () =>
          setDeployNotice("Could not start the simulator. Try again."),
      },
    );
  };
  const doRollback = (deploymentId: string) => {
    const operation = `rollback:${deploymentId}`;
    setDeployNotice("");
    rollback.mutate(
      {
        deploymentId,
        headers: { "Idempotency-Key": requestKey(operation) },
      },
      {
        onSuccess: () => {
          requestKeys.current.delete(operation);
          setDeployNotice("Rollback queued. Restoring to the selected build.");
          queryClient.invalidateQueries({
            queryKey: getListDeploymentsQueryKey(projectId),
          });
        },
        onError: () => setDeployNotice("Rollback failed. Try again."),
      },
    );
  };
  return (
    <DeployXShell>
      <div className="mb-8">
        <Link
          href="/projects"
          data-testid="link-back-projects"
          className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-primary"
        >
          <ArrowLeft size={14} /> All projects
        </Link>
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[.2em] text-primary">
              Project / {project.environment}
            </div>
            <h1
              className="text-[30px] font-extrabold tracking-[-.055em] md:text-[36px]"
              data-testid="text-project-name"
            >
              {project.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {project.description ||
                "A project ready for its next deployment."}
            </p>
          </div>
          <button
            onClick={deploy}
            disabled={createDeployment.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground shadow-[0_3px_0_hsl(28_68%_38%)] disabled:opacity-60"
            data-testid="button-deploy-project"
          >
            {createDeployment.isPending ? (
              <LoaderCircle className="animate-spin" size={15} />
            ) : (
              <Play size={15} />
            )}
            {createDeployment.isPending ? "Starting…" : "Deploy now"}
          </button>
        </div>
        {deployNotice && (
          <div
            className={`mt-4 rounded-lg px-3 py-2 text-xs ${deployNotice.startsWith("Could") ? "bg-destructive/10 text-destructive" : "bg-accent/10 text-accent"}`}
            data-testid="text-deploy-notice"
          >
            {deployNotice}
          </div>
        )}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 md:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-bold">Repository</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Validated source metadata
                </p>
              </div>
              <Status
                value={project.status === "active" ? "connected" : "archived"}
              />
            </div>
            {repo.isLoading ? (
              <LoadingBlock lines={3} />
            ) : repo.isError || !repo.data ? (
              <ErrorBlock retry={() => repo.refetch()} />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-4">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-card text-foreground">
                    <Code2 size={17} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-bold">
                      {repo.data.owner}/{repo.data.name}
                    </p>
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                      {repo.data.url}
                    </p>
                  </div>
                  <a
                    href={repo.data.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-muted-foreground hover:text-primary"
                    data-testid="link-repository"
                  >
                    <Globe2 size={16} />
                  </a>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      Default branch
                    </p>
                    <p className="mt-2 font-mono text-xs font-bold">
                      {repo.data.defaultBranch}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      Branches
                    </p>
                    <p className="mt-2 font-mono text-xs font-bold">
                      {repo.data.branches.length} available
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      Framework
                    </p>
                    <p className="mt-2 text-xs font-bold">
                      {project.framework}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 border-t border-border pt-4">
                  <GitCommitHorizontal
                    className="mt-0.5 text-primary"
                    size={16}
                  />
                  <div>
                    <p className="text-xs font-bold">
                      {repo.data.lastCommit.message}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {repo.data.lastCommit.sha.slice(0, 8)} ·{" "}
                      {repo.data.lastCommit.author} ·{" "}
                      {new Date(
                        repo.data.lastCommit.committedAt,
                      ).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
          <section className="rounded-xl border border-border bg-card p-5 md:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-bold">Environment variables</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Secrets stay masked by default.
                </p>
              </div>
              <button
                onClick={() => setAddingEnv(!addingEnv)}
                className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-xs font-bold hover:bg-muted"
                data-testid="button-add-variable"
              >
                <Plus size={14} /> Add variable
              </button>
            </div>
            {addingEnv && (
              <div className="mb-2">
                <AddVariable
                  projectId={projectId}
                  onClose={() => setAddingEnv(false)}
                />
              </div>
            )}
            {variables.isLoading ? (
              <LoadingBlock lines={3} />
            ) : variables.isError ? (
              <ErrorBlock retry={() => variables.refetch()} />
            ) : variables.data?.length ? (
              variables.data.map((variable) => (
                <EnvRow
                  key={variable.id}
                  variable={variable}
                  projectId={projectId}
                  onDone={() => undefined}
                />
              ))
            ) : (
              <div
                className="rounded-lg bg-muted/55 px-4 py-8 text-center"
                data-testid="empty-variables"
              >
                <KeyRound className="mx-auto text-muted-foreground" size={20} />
                <p className="mt-2 text-xs font-bold">
                  No environment variables yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add the first secret your build needs.
                </p>
              </div>
            )}
          </section>
        </div>
        <div className="space-y-6">
          {(() => {
            const latest = deployments.data?.[0];
            if (!latest) return null;
            const isActive =
              latest.status === "running" || latest.status === "queued";
            return (
              <section
                className="rounded-xl border border-border bg-card p-5 md:p-6"
                data-testid="panel-pipeline"
              >
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold">
                      Pipeline — deployment #{latest.number}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {latest.status === "queued"
                        ? latest.attempt > 0
                          ? "Waiting for the background worker to retry…"
                          : "Queued for the background worker…"
                        : latest.status === "running"
                          ? "Running the simulated pipeline…"
                          : "Latest run"}
                    </p>
                    <p
                      className="mt-1 text-xs text-muted-foreground"
                      data-testid="pipeline-attempt"
                    >
                      Attempt {latest.attempt} of {latest.maxAttempts}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isActive && (
                      <LoaderCircle
                        className="animate-spin text-primary"
                        size={15}
                      />
                    )}
                    <Status value={latest.status} />
                  </div>
                </div>
                <div className="space-y-2">
                  {latest.steps.map((step) => (
                    <div
                      key={step.name}
                      className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
                      data-testid={`step-${step.name.toLowerCase().replaceAll(" ", "-")}`}
                    >
                      {step.status === "success" ? (
                        <Check className="text-accent" size={14} />
                      ) : step.status === "failed" ? (
                        <X className="text-destructive" size={14} />
                      ) : step.status === "running" ? (
                        <LoaderCircle
                          className="animate-spin text-primary"
                          size={14}
                        />
                      ) : (
                        <Clock3
                          className="text-muted-foreground/50"
                          size={14}
                        />
                      )}
                      <span
                        className={`text-xs font-semibold ${step.status === "pending" ? "text-muted-foreground/60" : ""}`}
                      >
                        {step.name}
                      </span>
                      <span
                        className={`ml-auto font-mono text-[9px] uppercase tracking-wider ${step.status === "success" ? "text-accent" : step.status === "failed" ? "text-destructive" : step.status === "running" ? "text-primary" : "text-muted-foreground/50"}`}
                      >
                        {step.status}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${latest.status === "failed" ? "bg-destructive" : "bg-accent"}`}
                      style={{ width: `${latest.progress}%` }}
                    />
                  </div>
                  <span
                    className="font-mono text-[10px] text-muted-foreground"
                    data-testid="text-pipeline-progress"
                  >
                    {latest.progress}%
                  </span>
                  <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                    <Clock3 size={11} /> {latest.duration}
                  </span>
                </div>
                {latest.status === "failed" && latest.failureReason && (
                  <div
                    className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5"
                    data-testid="text-failure-reason"
                  >
                    <p className="font-mono text-[9px] uppercase tracking-widest text-destructive">
                      Failure reason
                    </p>
                    <p className="mt-1 text-xs font-semibold text-destructive">
                      {latest.failureReason}
                    </p>
                  </div>
                )}
                {latest.logs.length > 0 && (
                  <div
                    className="mt-4 max-h-44 overflow-y-auto rounded-lg bg-[#1d2733] p-3 font-mono text-[10px] leading-relaxed text-[#9fb3c8]"
                    data-testid="panel-pipeline-logs"
                  >
                    {latest.logs.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.includes("✗") || line.startsWith("[error]")
                            ? "text-[#f08a8a]"
                            : line.includes("200 OK")
                              ? "text-[#8ad6a0]"
                              : ""
                        }
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })()}
          <section className="rounded-xl border border-border bg-card p-5 md:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-bold">Deployment history</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Every run, with its paper trail
                </p>
              </div>
              <button
                onClick={() => deployments.refetch()}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                data-testid="button-refresh-deployments"
              >
                <RefreshCw size={15} />
              </button>
            </div>
            {deployments.isLoading ? (
              <LoadingBlock lines={5} />
            ) : deployments.isError ? (
              <ErrorBlock retry={() => deployments.refetch()} />
            ) : deployments.data?.length ? (
              <div className="space-y-1">
                {deployments.data.map((deployment) => (
                  <div
                    key={deployment.id}
                    className="rounded-lg border border-transparent p-3 transition-colors hover:border-border hover:bg-muted/30"
                    data-testid={`row-deployment-${deployment.id}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold">
                          #{deployment.number}
                        </span>
                        <Status value={deployment.status} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {new Date(deployment.startedAt).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" },
                          )}
                        </span>
                        {(deployment.status === "success" ||
                          deployment.status === "failed") && (
                          <button
                            onClick={() => doRollback(deployment.id)}
                            disabled={rollback.isPending}
                            title={`Roll back to #${deployment.number}`}
                            className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-40 transition-colors"
                            data-testid={`button-rollback-${deployment.id}`}
                          >
                            <RotateCcw size={10} /> Rollback
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${deployment.status === "failed" ? "bg-destructive" : "bg-accent"}`}
                          style={{ width: `${deployment.progress}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {deployment.progress}%
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Activity size={12} /> {deployment.triggeredBy}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock3 size={12} /> {deployment.duration}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="py-14 text-center"
                data-testid="empty-deployments"
              >
                <Terminal className="mx-auto text-muted-foreground" size={22} />
                <p className="mt-3 text-xs font-bold">
                  No deployments recorded
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  When you’re ready, run the simulator above.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </DeployXShell>
  );
}
