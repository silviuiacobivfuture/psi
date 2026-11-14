import { serve } from "@hono/node-server";
import { z } from "zod";
import { hashSecret } from "./auth/service-keys";
import { createTokenVerifier } from "./auth/tokens";
import { createAccess } from "./authz/access";
import { createMemoryAuthz } from "./authz/memory";
import { buildDeps } from "./build";
import type { Config } from "./config";
import { DEFAULT_LEADS } from "./engagement/scheduler";
import { seedAppAccess } from "./handlers/apps";
import { createApp } from "./http/app";
import { createLimiter } from "./ports/ratelimit";
import { createTestIssuer } from "./testing/tokens";

/**
 * The local run on a Convex that already holds a clinic (an import of the old app): the Convex store, in-memory
 * authorization rebuilt from the store's own roles and members at start, a development issuer so a console can sign in
 * as anyone, and no notification or mail delivery. Refuses to start in production. Port 4381 by default.
 *
 *   CONVEX_URL, PSI_SCHEDULING_KEY   the local backend and its server key
 *   CLINIC_MASTER_KEY_HEX            the clinic's master key, 64 hex characters
 *   LOCAL_APP, LOCAL_OWNER           the app (psizone) and the subject who is its Owner (owner)
 *   S3_*                             optional: where the imported files live
 */
const Env = z.object({
	NODE_ENV: z.string().optional(),
	PORT: z.coerce.number().int().min(1).max(65535).default(4381),
	CONVEX_URL: z.string().url(),
	PSI_SCHEDULING_KEY: z.string().min(32),
	CLINIC_MASTER_KEY_HEX: z.string().regex(/^[0-9a-f]{64}$/),
	LOCAL_APP: z.string().default("psizone"),
	LOCAL_OWNER: z
		.string()
		.regex(/^[a-z][a-z0-9-]{1,40}$/)
		.default("owner"),
	CORS_ORIGINS: z.string().default("http://localhost:4373"),
	S3_ENDPOINT: z.string().url().optional(),
	S3_BUCKET: z.string().min(1).optional(),
	S3_REGION: z.string().min(1).default("us-east-1"),
	S3_ACCESS_KEY_ID: z.string().min(1).optional(),
	S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
});
const env = Env.parse(process.env);
if (env.NODE_ENV === "production") throw new Error("the local run is not for production");

const issuer = await createTestIssuer(`http://localhost:${env.PORT}/dev/`);
const objects =
	env.S3_ENDPOINT !== undefined &&
	env.S3_BUCKET !== undefined &&
	env.S3_ACCESS_KEY_ID !== undefined &&
	env.S3_SECRET_ACCESS_KEY !== undefined
		? {
				endpoint: env.S3_ENDPOINT,
				bucket: env.S3_BUCKET,
				region: env.S3_REGION,
				accessKeyId: env.S3_ACCESS_KEY_ID,
				secretAccessKey: env.S3_SECRET_ACCESS_KEY,
			}
		: undefined;
const config: Config = {
	env: "development",
	port: env.PORT,
	publicUrl: `http://localhost:${env.PORT}`,
	issuers: [{ issuer: issuer.issuer, audiences: [issuer.audience] }],
	callers: [{ id: "psizone-web", app: "psizone" }],
	masterKey: env.CLINIC_MASTER_KEY_HEX,
	delivery: "send",
	reminders: DEFAULT_LEADS,
	store: { kind: "convex", url: env.CONVEX_URL, serverKey: env.PSI_SCHEDULING_KEY },
	authz: { kind: "memory" },
	mail: undefined,
	objects,
	notify: undefined,
	sso: undefined,
	callerHashes: new Map([["psizone-web", hashSecret("dev-psizone-web")]]),
};
// The convex store is built by buildDeps; the memory authorization and its access check are ours.
const authz = createMemoryAuthz();
const deps = buildDeps(config, {
	authz,
	verifier: createTokenVerifier({ issuers: config.issuers, keys: issuer.keys }),
	limiter: createLimiter({ capacity: 1000, refillPerSecond: 1000 }, Date.now),
});
const withAccess = {
	...deps,
	access: createAccess(
		authz,
		async (app, subject) => new Set((await deps.store.c.members.get(app, subject))?.denies ?? []),
	),
};
if ((await deps.store.c.apps.get(env.LOCAL_APP, env.LOCAL_APP)) === undefined)
	throw new Error(`the app ${env.LOCAL_APP} is not in the store: run the import first`);
await seedAppAccess(withAccess, env.LOCAL_APP, env.LOCAL_OWNER);
const members = await deps.store.c.members.list(env.LOCAL_APP);

const app = createApp(withAccess, { corsOrigins: env.CORS_ORIGINS.split(",") });
app.get("/dev/jwks", (c) => c.json(issuer.jwks));
app.get("/dev/people", (c) =>
	c.json(Object.fromEntries(members.map((m) => [m.subject, m.displayName]))),
);
app.post("/dev/token", async (c) => {
	const body = z
		.object({ subject: z.string().min(1) })
		.safeParse(await c.req.json().catch(() => undefined));
	if (!body.success) return c.json({ error: "send {subject}" }, 400);
	return c.json({ token: await issuer.mint(body.data.subject, { expiresIn: 3600 }) });
});
serve({ fetch: app.fetch, port: env.PORT });
process.stdout.write(
	`scheduling-api (local, store ${env.CONVEX_URL}) on http://localhost:${env.PORT}; app ${env.LOCAL_APP}, owner ${env.LOCAL_OWNER}, ${members.length} members\n`,
);
