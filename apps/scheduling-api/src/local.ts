import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { FILE_MAX_BYTES } from "@psi/scheduling-sdk/contract";
import { hashSecret } from "./auth/service-keys";
import { createTokenVerifier } from "./auth/tokens";
import { createAccess } from "./authz/access";
import { createMemoryAuthz, platformAdminTuples } from "./authz/memory";
import { buildDeps } from "./build";
import type { Config } from "./config";
import { DEFAULT_LEADS } from "./engagement/scheduler";
import { createApp } from "./http/app";
import { createMemoryMailer } from "./ports/mail";
import { createMemoryNotify } from "./ports/notify";
import { createFsObjects, FS_ROUTE } from "./ports/objects-fs";
import { createLimiter } from "./ports/ratelimit";
import { createMemoryStore } from "./store/memory";
import { PEOPLE, populate } from "./testing/populate";
import { createTestIssuer } from "./testing/tokens";

/**
 * The local run: in-memory adapters seeded with synthetic data, and a development issuer so a console can sign in as
 * anyone without Authentik. Refuses to start in production. Port 4380 (never 4300-4360).
 *
 *   GET  /dev/people          who exists, and the roles they hold
 *   POST /dev/token {subject} a bearer token for that subject (audience scheduling-api)
 *   GET  /dev/jwks            the issuer's keys
 * Service keys: psizone-web.dev-psizone-web, hemisync-web.dev-hemisync-web.
 */
if (process.env.NODE_ENV === "production") throw new Error("the local run is not for production");
const port = Number(process.env.PORT ?? 4380);
const issuer = await createTestIssuer(`http://localhost:${port}/dev/`);
const secrets = { "psizone-web": "dev-psizone-web", "hemisync-web": "dev-hemisync-web" } as const;
const config: Config = {
	env: "development",
	port,
	publicUrl: `http://localhost:${port}`,
	issuers: [{ issuer: issuer.issuer, audiences: [issuer.audience] }],
	callers: [
		{ id: "psizone-web", app: "psizone" },
		{ id: "hemisync-web", app: "hemisync" },
	],
	masterKey: "ab".repeat(32),
	delivery: "send",
	reminders: DEFAULT_LEADS,
	store: { kind: "memory" },
	authz: { kind: "memory" },
	mail: undefined,
	// Not S3: the local run keeps files in a folder git ignores (see `fsObjects` below).
	objects: undefined,
	// Unset on purpose: the local run logs notifications and delivers none.
	notify: undefined,
	sso: undefined,
	callerHashes: new Map(Object.entries(secrets).map(([id, s]) => [id, hashSecret(s)])),
};
const corsOrigins = (
	process.env.CORS_ORIGINS ?? "http://localhost:4381,http://localhost:4382"
).split(",");
/** Client files of the local run: `apps/scheduling-api/.local/objects`, ignored by git, never read in production. */
const fsObjects = createFsObjects({
	root: fileURLToPath(new URL("../.local/objects", import.meta.url)),
	publicUrl: config.publicUrl,
	secret: "local-objects-secret",
	maxBytes: FILE_MAX_BYTES,
});
const store = createMemoryStore();
const authz = createMemoryAuthz(platformAdminTuples("root"));
const deps = buildDeps(config, {
	store,
	authz,
	access: createAccess(
		authz,
		async (app, subject) => new Set((await store.c.members.get(app, subject))?.denies ?? []),
	),
	verifier: createTokenVerifier({ issuers: config.issuers, keys: issuer.keys }),
	mailer: createMemoryMailer(),
	objects: fsObjects,
	notifier: createMemoryNotify(),
	limiter: createLimiter({ capacity: 1000, refillPerSecond: 1000 }, Date.now),
});
const app = createApp(deps, { corsOrigins });
app.get("/dev/jwks", (c) => c.json(issuer.jwks));
app.get("/dev/people", (c) =>
	c.json({ root: "estate administrator (creates apps)", hugo: "owner of hemisync", ...PEOPLE }),
);
app.post("/dev/token", async (c) => {
	const body: unknown = await c.req.json().catch(() => undefined);
	const subject =
		typeof body === "object" && body !== null
			? Object.getOwnPropertyDescriptor(body, "subject")?.value
			: undefined;
	if (typeof subject !== "string" || subject === "")
		return c.json({ error: "send {subject}" }, 400);
	return c.json({ token: await issuer.mint(subject, { expiresIn: 3600 }), subject });
});

const seeded = await populate({
	upload: (url, size, contentType) => fsObjects.upload(url, size, contentType),
	call: async (as, method, path, body) => {
		const headers: Record<string, string> =
			as === null ? {} : { authorization: `Bearer ${await issuer.mint(as)}` };
		if (body !== undefined) headers["content-type"] = "application/json";
		const res = await app.request(path, {
			method,
			headers,
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		const text = await res.text();
		return { status: res.status, json: text === "" ? {} : JSON.parse(text), headers: res.headers };
	},
});
process.stdout.write(
	`seeded: ${Object.keys(seeded.ids).length} ids; apps psizone (owner olga) and hemisync (owner hugo)\n`,
);
/** The signed links of client files point here, beside the API: the bytes pass this route, never a handler (no 1 MB cap). */
const objectHeaders = (origin: string | null): Record<string, string> =>
	origin !== null && corsOrigins.includes(origin)
		? {
				"access-control-allow-origin": origin,
				"access-control-allow-methods": "GET, PUT",
				"access-control-allow-headers": "content-type",
				vary: "origin",
			}
		: {};
serve({
	fetch: async (request: Request) => {
		if (!new URL(request.url).pathname.startsWith(FS_ROUTE)) return app.fetch(request);
		const headers = objectHeaders(request.headers.get("origin"));
		if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
		const answer = await fsObjects.handle(request);
		for (const [name, value] of Object.entries(headers)) answer.headers.set(name, value);
		return answer;
	},
	port,
});
process.stdout.write(`scheduling-api (local, synthetic data) on http://localhost:${port}\n`);
