import { buildOpenApi, ROUTES, type RouteSpec } from "@psi/scheduling-sdk/contract";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { handlers } from "../handlers/index";
import type { Deps, HttpEnv } from "./context";
import { fail } from "./errors";
import { finish, prepare, refusal } from "./pipeline";
import { openStream } from "./stream";

const MAX_BODY_BYTES = 1_048_576;

/** The service: the contract's route table mounted on Hono, each route behind the same pipeline. */
export function createApp(
	deps: Deps,
	options: { corsOrigins?: readonly string[]; extend?: (app: Hono<HttpEnv>) => void } = {},
): Hono<HttpEnv> {
	const app = new Hono<HttpEnv>();
	app.use("*", async (c, next) => {
		c.set("requestId", crypto.randomUUID());
		const declared = Number(c.req.header("content-length") ?? "0");
		if (declared > MAX_BODY_BYTES) {
			const r = refusal(deps, fail("invalid", "the body is too large"), c.get("requestId"));
			return new Response(JSON.stringify(r.body), {
				status: 413,
				headers: { "content-type": "application/json" },
			});
		}
		await next();
		c.header("cache-control", "no-store");
		c.header("x-content-type-options", "nosniff");
		c.header("x-request-id", c.get("requestId"));
	});
	if (options.corsOrigins !== undefined && options.corsOrigins.length > 0) {
		app.use(
			"/v1/*",
			cors({
				origin: [...options.corsOrigins],
				allowHeaders: [
					"authorization",
					"content-type",
					"x-service-key",
					"x-psi-subject",
					"x-psi-view-as",
				],
				allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
				maxAge: 600,
			}),
		);
	}

	const openapi = buildOpenApi(ROUTES as ReadonlyArray<RouteSpec>, {
		title: "psi scheduling service",
		version: "1",
		serverUrl: deps.config.publicUrl,
	});
	app.get("/health", (c) => c.json({ status: "ok" }));
	app.get("/ready", async (c) => {
		try {
			await deps.store.ping();
			return c.json({ status: "ok" });
		} catch {
			return c.json({ status: "unavailable" }, 503);
		}
	});
	app.get("/v1/openapi.json", (c) => c.json(openapi));

	for (const spec of ROUTES as ReadonlyArray<RouteSpec>) {
		if (spec.side === "meta") continue;
		if (spec.stream === true) {
			app.get(spec.path, (c) => openStream(deps, spec, c));
			continue;
		}
		const handler = handlers[spec.id];
		if (handler === undefined) throw new Error(`no handler for ${spec.id}`);
		app.on(spec.method, spec.path, async (c) => {
			try {
				const prepared = await prepare(deps, spec, c);
				const result = await handler(prepared.ctx);
				return c.json(await finish(deps, prepared, result));
			} catch (error) {
				const r = refusal(deps, error, c.get("requestId"));
				const wait = r.body.error.detail?.retryAfterSeconds;
				return new Response(JSON.stringify(r.body), {
					status: r.status,
					headers: {
						"content-type": "application/json",
						...(r.status === 429 && typeof wait === "number"
							? { "retry-after": String(wait) }
							: {}),
					},
				});
			}
		});
	}

	// Where `@psi/notify`'s signed reminder links mount (/v1/public/reminders/:token/confirm|cancel) when it lands.
	options.extend?.(app);

	app.notFound((c) => {
		const r = refusal(deps, fail("not_found", "no such route"), c.get("requestId"));
		return new Response(JSON.stringify(r.body), {
			status: 404,
			headers: { "content-type": "application/json" },
		});
	});
	app.onError((error, c) => {
		const r = refusal(deps, error, c.get("requestId") ?? "none");
		return new Response(JSON.stringify(r.body), {
			status: r.status,
			headers: { "content-type": "application/json" },
		});
	});
	return app;
}
