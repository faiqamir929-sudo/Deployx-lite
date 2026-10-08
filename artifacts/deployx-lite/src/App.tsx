import { useEffect, useRef, type ReactNode } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AIAssistant } from "@/components/ai-assistant";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import Settings from "@/pages/settings";
import {
  Route,
  Switch,
  useLocation,
  Redirect,
  Router as WouterRouter,
} from "wouter";
import { TerminalSquare } from "lucide-react";

const queryClient = new QueryClient();

// REQUIRED — resolves publishable key from hostname (same build serves dev + prod)
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — empty in dev (intentional), auto-populated in production by the hosting platform
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

// ─── Clerk appearance: DeployX dark-navy theme ───────────────────────────────
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "bottom" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "hsl(39 92% 63%)",
    colorForeground: "hsl(211 24% 92%)",
    colorMutedForeground: "hsl(211 16% 60%)",
    colorDanger: "hsl(0 72% 62%)",
    colorBackground: "hsl(214 35% 13%)",
    colorInput: "hsl(214 30% 18%)",
    colorInputForeground: "hsl(211 24% 92%)",
    colorNeutral: "hsl(214 29% 30%)",
    fontFamily: "'Manrope', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-[hsl(214_35%_13%)] border border-[hsl(214_29%_23%)] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[hsl(211_24%_92%)] font-extrabold tracking-tight",
    headerSubtitle: "text-[hsl(211_16%_60%)]",
    socialButtonsBlockButtonText: "text-[hsl(211_24%_92%)] font-semibold",
    formFieldLabel:
      "text-[hsl(211_20%_75%)] font-semibold text-xs uppercase tracking-wider",
    footerActionLink: "text-[hsl(39_92%_63%)] font-bold hover:underline",
    footerActionText: "text-[hsl(211_16%_55%)]",
    dividerText: "text-[hsl(211_16%_50%)]",
    identityPreviewEditButton: "text-[hsl(39_92%_63%)]",
    formFieldSuccessText: "text-[hsl(158_46%_54%)]",
    alertText: "text-[hsl(211_24%_92%)]",
    logoBox: "flex justify-center py-1",
    logoImage: "w-10 h-10",
    socialButtonsBlockButton:
      "border border-[hsl(214_29%_28%)] bg-[hsl(214_30%_18%)] hover:bg-[hsl(214_30%_22%)] transition-colors",
    formButtonPrimary:
      "bg-[hsl(39_92%_63%)] text-[hsl(214_35%_13%)] font-bold hover:bg-[hsl(39_92%_70%)] transition-colors",
    formFieldInput:
      "bg-[hsl(214_30%_18%)] border-[hsl(214_29%_28%)] text-[hsl(211_24%_92%)] focus:border-[hsl(39_92%_63%)]",
    footerAction: "bg-[hsl(214_30%_11%)]",
    dividerLine: "bg-[hsl(214_29%_25%)]",
    alert: "bg-[hsl(0_30%_18%)] border-[hsl(0_50%_30%)]",
    otpCodeFieldInput:
      "bg-[hsl(214_30%_18%)] border-[hsl(214_29%_28%)] text-[hsl(211_24%_92%)]",
    formFieldRow: "gap-3",
    main: "gap-4",
  },
};

// ─── Auth page chrome ─────────────────────────────────────────────────────────
function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="noise min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-3">
        <a href={basePath || "/"} className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sidebar text-sidebar-primary shadow-[0_4px_0_hsl(34_74%_42%)]">
            <TerminalSquare size={20} />
          </span>
          <span className="font-extrabold tracking-[-0.04em] text-[22px] text-foreground">
            deploy<span className="text-primary">x</span>
            <sup className="ml-1 font-mono text-[9px] text-muted-foreground">
              LITE
            </sup>
          </span>
        </a>
        <p className="text-sm text-muted-foreground">
          AI-powered deployment platform
        </p>
      </div>
      {children}
    </div>
  );
}

function SignInPage() {
  return (
    <AuthPageShell>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </AuthPageShell>
  );
}

function SignUpPage() {
  return (
    <AuthPageShell>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </AuthPageShell>
  );
}

// ─── Public landing page ──────────────────────────────────────────────────────
function LandingPage() {
  const [, setLocation] = useLocation();
  return (
    <div className="noise min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-8 text-center max-w-xl">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-sidebar text-sidebar-primary shadow-[0_5px_0_hsl(34_74%_42%)]">
            <TerminalSquare size={22} />
          </span>
          <span className="font-extrabold tracking-[-0.04em] text-[28px] text-foreground">
            deploy<span className="text-primary">x</span>
            <sup className="ml-1 font-mono text-[9px] text-muted-foreground">
              LITE
            </sup>
          </span>
        </div>
        <div>
          <h1 className="text-[36px] font-extrabold tracking-[-0.055em] text-foreground leading-tight">
            Ship faster.
            <br />
            <span className="text-primary">Break nothing.</span>
          </h1>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">
            AI-powered deployment and environment management for small
            development teams. Manage projects, protect environment variables,
            and explore simulated deployment pipelines.
          </p>
        </div>
        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={() => setLocation("/sign-up")}
            className="rounded-xl bg-primary px-8 py-3 font-bold text-primary-foreground shadow-[0_4px_0_hsl(34_74%_42%)] hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_hsl(34_74%_42%)] transition-all"
          >
            Get started free
          </button>
          <button
            onClick={() => setLocation("/sign-in")}
            className="rounded-xl border border-border bg-card px-8 py-3 font-bold text-foreground hover:bg-muted/60 transition-colors"
          >
            Sign in
          </button>
        </div>
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#72c6a7]" />
            Encrypted env vars
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Simulated pipelines
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7bb8f0]" />
            Owner-only access
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── / route: Dashboard for auth users, landing for guests ───────────────────
function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <Dashboard />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

// ─── Protected route wrapper (redirects to / if not signed in) ────────────────
function Protected({ children }: { children: ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

// ─── Cache invalidator when signed-in user changes ───────────────────────────
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

// ─── Error boundary with location reset ──────────────────────────────────────
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

// ─── Inner app content (rendered inside ClerkProvider + QueryClientProvider) ──
function AppContent() {
  return (
    <TooltipProvider>
      <ClerkQueryClientCacheInvalidator />
      <AIAssistant />
      <RoutedErrorBoundary>
        <Switch>
          {/* Public — shows dashboard when signed in, landing when signed out */}
          <Route path="/" component={HomeRoute} />
          {/* Auth — wildcard suffix required for Clerk OAuth sub-paths */}
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          {/* Protected workspace */}
          <Route path="/projects">
            {() => (
              <Protected>
                <Projects />
              </Protected>
            )}
          </Route>
          <Route path="/projects/:projectId">
            {() => (
              <Protected>
                <ProjectDetail />
              </Protected>
            )}
          </Route>
          <Route path="/settings">
            {() => (
              <Protected>
                <Settings />
              </Protected>
            )}
          </Route>
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
      <Toaster />
    </TooltipProvider>
  );
}

// ─── ClerkProvider (inside WouterRouter so routerPush can call setLocation) ───
function ClerkApp() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to your workspace",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Join DeployX Lite today",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkApp />
    </WouterRouter>
  );
}

export default App;
