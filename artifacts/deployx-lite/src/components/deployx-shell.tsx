import {
  Boxes,
  ChevronRight,
  CircleHelp,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Settings,
  TerminalSquare,
  X,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState, type ReactNode } from "react";
import { useUser, useClerk } from "@clerk/react";
import { NotificationCenter } from "@/components/notification-center";

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: Boxes },
];

export function DeployXShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();

  const displayName =
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ??
    "You";
  const initials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : (user?.primaryEmailAddress?.emailAddress?.[0]?.toUpperCase() ?? "?");
  const teamName =
    user?.organizationMemberships?.[0]?.organization.name ??
    "personal workspace";

  return (
    <div className="noise min-h-[100dvh] bg-background text-foreground">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[260px] border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-full flex-col px-5 py-6">
          <div className="mb-10 flex items-center justify-between px-2">
            <Link
              href="/"
              data-testid="link-brand"
              className="flex items-center gap-3"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_5px_0_hsl(34_74%_42%)]">
                <TerminalSquare size={19} />
              </span>
              <span className="font-extrabold tracking-[-0.04em] text-[18px] text-white">
                deploy<span className="text-sidebar-primary">x</span>
                <sup className="ml-1 font-mono text-[9px] text-slate-400">
                  LITE
                </sup>
              </span>
            </Link>
            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden text-slate-400"
              data-testid="button-close-menu"
            >
              <X size={18} />
            </button>
          </div>
          <div className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[.18em] text-slate-500">
            Workspace
          </div>
          <nav className="space-y-1">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                data-testid={`link-nav-${label.toLowerCase()}`}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${location === href ? "bg-sidebar-accent text-white" : "text-slate-400 hover:bg-sidebar-accent/70 hover:text-white"}`}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{label}</span>
                {location === href && (
                  <ChevronRight
                    className="ml-auto text-sidebar-primary"
                    size={15}
                  />
                )}
              </Link>
            ))}
          </nav>
          <div className="mt-9 mb-3 px-3 font-mono text-[10px] uppercase tracking-[.18em] text-slate-500">
            Account
          </div>
          <nav className="space-y-1">
            <Link
              href="/settings"
              data-testid="link-nav-settings"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${location === "/settings" ? "bg-sidebar-accent text-white" : "text-slate-400 hover:bg-sidebar-accent/70 hover:text-white"}`}
            >
              <Settings size={17} strokeWidth={1.8} />
              <span>Settings</span>
            </Link>
            <button
              onClick={() => signOut({ redirectUrl: "/" })}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-400 hover:bg-sidebar-accent/70 hover:text-white transition-colors"
              data-testid="button-sign-out"
            >
              <LogOut size={17} strokeWidth={1.8} />
              <span>Sign out</span>
            </button>
          </nav>
          <div className="mt-auto rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#72c6a7] shadow-[0_0_0_3px_hsl(158_46%_54%/15%)]" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                Systems nominal
              </span>
            </div>
            <p className="text-xs leading-5 text-slate-300">
              Your deployment runway is clear. Keep shipping.
            </p>
          </div>
          <div className="mt-5 flex items-center gap-3 border-t border-sidebar-border pt-5">
            {isLoaded && user?.imageUrl ? (
              <img
                src={user.imageUrl}
                alt={displayName}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="grid h-8 w-8 place-items-center rounded-full bg-[#e4b361] text-xs font-extrabold text-[#263445]">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-200">
                {isLoaded ? displayName : "—"}
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {isLoaded ? teamName : "loading…"}
              </p>
            </div>
            <button
              className="ml-auto text-slate-500 hover:text-slate-200"
              data-testid="button-account-help"
            >
              <CircleHelp size={16} />
            </button>
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
          data-testid="button-overlay"
        />
      )}
      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md lg:px-10">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-muted-foreground lg:hidden"
            data-testid="button-open-menu"
          >
            <Boxes size={21} />
          </button>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <GitBranch size={14} />
            <span className="font-mono">northstar / production</span>
            <span className="rounded bg-accent/10 px-2 py-1 font-mono text-[10px] text-accent">
              HEALTHY
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <NotificationCenter />
            <div className="hidden h-5 w-px bg-border sm:block" />
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              UTC−08:00
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-5 py-8 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div>
        <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[.2em] text-primary">
          {eyebrow}
        </div>
        <h1 className="text-[30px] font-extrabold tracking-[-.055em] text-foreground md:text-[36px]">
          {title}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          {subtitle}
        </p>
      </div>
      {action}
    </div>
  );
}

export function LoadingBlock({ lines = 4 }: { lines?: number }) {
  return (
    <div
      className="space-y-3 rounded-xl border border-border bg-card p-6"
      data-testid="loading-state"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse-soft h-3 rounded bg-muted ${i === 0 ? "w-1/3" : i === lines - 1 ? "w-2/5" : "w-full"}`}
        />
      ))}
    </div>
  );
}
export function ErrorBlock({ retry }: { retry?: () => void }) {
  return (
    <div
      className="rounded-xl border border-destructive/25 bg-destructive/5 p-8 text-center"
      data-testid="error-state"
    >
      <p className="font-bold text-destructive">Couldn't load this view.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        The workspace is still reachable. Try again in a moment.
      </p>
      {retry && (
        <button
          onClick={retry}
          className="mt-4 rounded-lg bg-destructive px-4 py-2 text-xs font-bold text-white"
          data-testid="button-retry"
        >
          Retry
        </button>
      )}
    </div>
  );
}
