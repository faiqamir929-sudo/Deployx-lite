import { useUser } from "@clerk/react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Code2,
  Rocket,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Link } from "wouter";
import { useGetDashboard } from "@workspace/api-client-react";
import {
  DeployXShell,
  ErrorBlock,
  LoadingBlock,
  PageHeading,
} from "@/components/deployx-shell";

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Rocket;
  accent: string;
}) {
  return (
    <div
      className="group rounded-xl border border-border bg-card p-5 transition-transform hover:-translate-y-0.5"
      data-testid={`metric-${label.toLowerCase().replaceAll(" ", "-")}`}
    >
      <div className="mb-5 flex items-start justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">
          {label}
        </span>
        <span
          className={`grid h-8 w-8 place-items-center rounded-lg ${accent}`}
        >
          <Icon size={16} />
        </span>
      </div>
      <div className="text-[30px] font-extrabold tracking-[-.06em]">
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}
function Trend({
  data,
}: {
  data: { day: string; deployments: number; successful: number }[];
}) {
  const max = Math.max(...data.map((x) => x.deployments), 1);
  return (
    <div className="flex h-[190px] items-end gap-2 pt-5">
      {data.map((item) => (
        <div
          key={item.day}
          className="group flex min-w-0 flex-1 flex-col items-center gap-2"
        >
          <div className="relative flex h-[145px] w-full max-w-9 items-end justify-center gap-1">
            <div
              className="w-2.5 rounded-t bg-primary/20 transition-all group-hover:bg-primary/35"
              style={{
                height: `${Math.max(12, (item.deployments / max) * 100)}%`,
              }}
            />
            <div
              className="w-2.5 rounded-t bg-accent transition-all group-hover:bg-accent/80"
              style={{
                height: `${Math.max(8, (item.successful / max) * 100)}%`,
              }}
            />
            <span className="absolute -top-5 hidden font-mono text-[9px] text-foreground group-hover:block">
              {item.deployments}
            </span>
          </div>
          <span className="font-mono text-[9px] text-muted-foreground">
            {item.day}
          </span>
        </div>
      ))}
    </div>
  );
}
export default function Dashboard() {
  const dashboard = useGetDashboard({ query: { queryKey: ["dashboard"] } });
  const { user } = useUser();
  const firstName =
    user?.firstName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "there";
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <DeployXShell>
      <PageHeading
        eyebrow={today}
        title={`${greeting}, ${firstName}.`}
        subtitle="Here’s the pulse of your delivery workspace. Quietly healthy."
        action={
          <Link
            href="/projects"
            data-testid="link-view-projects"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground shadow-[0_3px_0_hsl(28_68%_38%)] transition-transform hover:-translate-y-0.5"
          >
            View projects <ArrowUpRight size={15} />
          </Link>
        }
      />
      {dashboard.isLoading ? (
        <LoadingBlock />
      ) : dashboard.isError || !dashboard.data ? (
        <ErrorBlock retry={() => dashboard.refetch()} />
      ) : (
        <div className="animate-rise space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Projects"
              value={dashboard.data.projects.total}
              detail={`${dashboard.data.projects.active} active · ${dashboard.data.projects.archived} archived`}
              icon={Code2}
              accent="bg-[#e9eff9] text-[#45658b]"
            />
            <Metric
              label="Deployments"
              value={dashboard.data.deployments.total}
              detail={`${dashboard.data.deployments.running} currently running`}
              icon={Rocket}
              accent="bg-[#faecda] text-primary"
            />
            <Metric
              label="Success rate"
              value={`${dashboard.data.successRate}%`}
              detail="Last 30 days"
              icon={TrendingUp}
              accent="bg-[#e0f1eb] text-accent"
            />
            <Metric
              label="Avg. duration"
              value={dashboard.data.averageDuration}
              detail="Across successful runs"
              icon={Clock3}
              accent="bg-[#eee8f4] text-[#76598e]"
            />
          </div>
          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <section className="rounded-xl border border-border bg-card p-5 md:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold">Deployment rhythm</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The last 14 days, at a glance
                  </p>
                </div>
                <div className="flex gap-3 font-mono text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <i className="h-2 w-2 rounded-sm bg-primary/25" /> all
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="h-2 w-2 rounded-sm bg-accent" /> successful
                  </span>
                </div>
              </div>
              <Trend data={dashboard.data.deployTrend} />
            </section>
            <section className="rounded-xl border border-border bg-card p-5 md:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-bold">Recent activity</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Signals from your workspace
                  </p>
                </div>
                <button
                  className="text-xs font-bold text-primary"
                  data-testid="button-view-activity"
                >
                  View all
                </button>
              </div>
              <div className="space-y-5">
                {dashboard.data.activity.length === 0 ? (
                  <div
                    className="py-8 text-center text-sm text-muted-foreground"
                    data-testid="empty-activity"
                  >
                    Nothing new here yet.
                  </div>
                ) : (
                  dashboard.data.activity.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex gap-3"
                      data-testid={`activity-${item.id}`}
                    >
                      <div
                        className={`mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full ${item.tone === "success" ? "bg-accent/10 text-accent" : item.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}
                      >
                        {item.tone === "success" ? (
                          <CheckCircle2 size={14} />
                        ) : item.tone === "error" ? (
                          <XCircle size={14} />
                        ) : (
                          <Rocket size={14} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-3">
                          <p className="truncate text-xs font-bold">
                            {item.title}
                          </p>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {item.time}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
          <section className="rounded-xl border border-border bg-card p-5 md:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-bold">Workspace health</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Projects that need your attention
                </p>
              </div>
              <Link
                href="/projects"
                data-testid="link-health-projects"
                className="flex items-center gap-1 text-xs font-bold text-primary"
              >
                Open project list <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex items-center gap-3 rounded-lg bg-accent/5 p-4">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-accent/10 text-accent">
                  <CheckCircle2 size={16} />
                </span>
                <div>
                  <p className="text-xs font-bold">All systems go</p>
                  <p className="text-[11px] text-muted-foreground">
                    {dashboard.data.projects.active} active projects are healthy
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-primary/5 p-4">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
                  <Rocket size={16} />
                </span>
                <div>
                  <p className="text-xs font-bold">
                    {dashboard.data.deployments.running
                      ? `${dashboard.data.deployments.running} in motion`
                      : "Ready to ship"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Deployment pipeline is available
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-muted p-4">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-card text-muted-foreground">
                  <Clock3 size={16} />
                </span>
                <div>
                  <p className="text-xs font-bold">Keep an eye on deployment pace</p>
                  <p className="text-[11px] text-muted-foreground">
                    Average run is {dashboard.data.averageDuration}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </DeployXShell>
  );
}
