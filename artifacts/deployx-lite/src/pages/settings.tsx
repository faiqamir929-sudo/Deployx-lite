import { useClerk, useUser } from "@clerk/react";
import {
  Check,
  Moon,
  Save,
  SlidersHorizontal,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { DeployXShell, PageHeading } from "@/components/deployx-shell";
export default function Settings() {
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const displayName =
    user?.fullName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "Your account";
  const emailAddress = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials =
    (user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "") ||
    displayName.slice(0, 2).toUpperCase();
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState("light");
  const [email, setEmail] = useState(true);
  const [compact, setCompact] = useState(false);
  const save = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };
  return (
    <DeployXShell>
      <PageHeading
        eyebrow="Account / preferences"
        title="Settings"
        subtitle="A few thoughtful defaults for how DeployX feels under your hands."
        action={
          <button
            onClick={save}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground shadow-[0_3px_0_hsl(28_68%_38%)]"
            data-testid="button-save-settings"
          >
            {saved ? <Check size={15} /> : <Save size={15} />}
            {saved ? "Saved" : "Save changes"}
          </button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-1">
          <button
            className="flex w-full items-center gap-3 rounded-lg bg-primary/10 px-3 py-2.5 text-left text-xs font-bold text-primary"
            data-testid="button-settings-general"
          >
            <SlidersHorizontal size={16} /> General
          </button>
          <button
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground hover:bg-muted"
            data-testid="button-settings-profile"
          >
            <UserRound size={16} /> Profile
          </button>
          <button
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground hover:bg-muted"
            data-testid="button-settings-team"
          >
            <UsersRound size={16} /> Team
          </button>
        </nav>
        <div className="space-y-5">
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-bold">Workspace preferences</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              These choices apply to your current workspace only.
            </p>
            <div className="mt-7 divide-y divide-border">
              <div className="flex items-center justify-between gap-5 py-5 first:pt-0">
                <div>
                  <p className="text-sm font-bold">Color mode</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Choose the appearance that keeps you in flow.
                  </p>
                </div>
                <div className="flex rounded-lg border border-input p-1">
                  <button
                    onClick={() => {
                      setTheme("light");
                      document.documentElement.classList.remove("dark");
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold ${theme === "light" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    data-testid="button-theme-light"
                  >
                    Light
                  </button>
                  <button
                    onClick={() => {
                      setTheme("dark");
                      document.documentElement.classList.add("dark");
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold ${theme === "dark" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    data-testid="button-theme-dark"
                  >
                    <Moon size={13} />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-5 py-5">
                <div>
                  <p className="text-sm font-bold">Deployment notifications</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Receive a note when a run completes or needs attention.
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={email}
                  onClick={() => setEmail(!email)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${email ? "bg-accent" : "bg-muted"}`}
                  data-testid="switch-notifications"
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${email ? "translate-x-6" : "translate-x-1"}`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between gap-5 py-5 last:pb-0">
                <div>
                  <p className="text-sm font-bold">Compact project rows</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fit more projects into a single view.
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={compact}
                  onClick={() => setCompact(!compact)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${compact ? "bg-accent" : "bg-muted"}`}
                  data-testid="switch-compact"
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${compact ? "translate-x-6" : "translate-x-1"}`}
                  />
                </button>
              </div>
            </div>
          </section>
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-bold">Your account</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The teammate behind the terminal.
            </p>
            <div className="mt-6 flex items-center gap-4">
              {user?.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt={displayName}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded-full bg-[#e4b361] font-extrabold text-[#263445]">
                  {initials}
                </div>
              )}
              <div>
                <p
                  className="text-sm font-extrabold"
                  data-testid="text-profile-name"
                >
                  {displayName}
                </p>
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="text-profile-email"
                >
                  {emailAddress}
                </p>
              </div>
              <button
                onClick={() => openUserProfile()}
                className="ml-auto rounded-lg border border-input px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted"
                data-testid="button-edit-profile"
              >
                Edit profile
              </button>
            </div>
          </section>
        </div>
      </div>
    </DeployXShell>
  );
}
