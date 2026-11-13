import { serve } from "@hono/node-server";
import { hashSecret } from "./auth/service-keys";
import { createTokenVerifier } from "./auth/tokens";
import { createAccess } from "./authz/access";
import { createMemoryAuthz, platformAdminTuples } from "./authz/memory";
import { buildDeps } from "./build";
import type { Config } from "./config";
import { createApp } from "./http/app";
import { createMemoryMailer } from "./ports/mail";
import { createMemoryNotify } from "./ports/notify";
import { createMemoryObjects } from "./ports/objects";
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
	store: { kind: "memory" },
	authz: { kind: "memory" },
	mail: undefined,
	objects: undefined,
	callerHashes: new Map(Object.entries(secrets).map(([id, s]) => [id, hashSecret(s)])),
};
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
	objects: createMemoryObjects(),
	notifier: createMemoryNotify(),
});
const app = createApp(deps, {
	corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:4381,http://localhost:4382").split(
		",",
	),
});
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
serve({ fetch: app.fetch, port });
process.stdout.write(`scheduling-api (local, synthetic data) on http://localhost:${port}\n`);
