import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import * as yaml from "js-yaml";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

function normalizeOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

const configuredAllowedOrigins = new Set(
  [process.env.CORS_ALLOWED_ORIGINS, process.env.ALLOWED_ORIGINS]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(","))
    .map((value) => normalizeOrigin(value.trim()))
    .filter((value): value is string => Boolean(value)),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Never reflect arbitrary Origin headers while using credentialed requests.
// Same-origin requests are allowed automatically; cross-origin callers must
// be explicitly listed in CORS_ALLOWED_ORIGINS/ALLOWED_ORIGINS.
//
// This guard intentionally runs before the Clerk proxy. It does not parse or
// consume the request body, so the proxy still receives raw bytes before the
// JSON/urlencoded body parsers below.
app.use((req, res, next) => {
  const origin = req.get("origin");
  const normalizedOrigin = origin ? normalizeOrigin(origin) : undefined;
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const effectiveHost = forwardedHost || req.get("host");
  const requestOrigin = normalizeOrigin(
    `${forwardedProto || req.protocol}://${effectiveHost}`,
  );
  const allowed =
    !origin ||
    normalizedOrigin === requestOrigin ||
    (normalizedOrigin !== undefined &&
      configuredAllowedOrigins.has(normalizedOrigin));
  if (!allowed) {
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }
  cors({ credentials: true, origin: true })(req, res, next);
});

// Clerk proxy must come before body parsers (streams raw bytes).
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Resolve the publishable key from the incoming request host so the same
// server can serve multiple Clerk custom domains.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// ─── Swagger UI ───────────────────────────────────────────────────────────────
// Served at /docs — no auth required so reviewers can browse the spec.
const openapiPath = path.resolve(
  __dirname,
  "../../../lib/api-spec/openapi.yaml",
);
try {
  const spec = yaml.load(fs.readFileSync(openapiPath, "utf8")) as object;
  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: "DeployX Lite — API Reference",
      customCss: ".topbar { display: none }",
      swaggerOptions: { persistAuthorization: true },
    }),
  );
} catch {
  logger.warn(
    "Could not load openapi.yaml for Swagger UI — docs endpoint disabled",
  );
}

app.use("/api", router);

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error({ err: error }, "Unhandled request error");
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error" });
  },
);

export default app;
