import { MASTRA_RESOURCE_ID_KEY, RequestContext } from "@mastra/core/request-context";
import type { MiddlewareHandler } from "@mastra/core/server";
import type { AuthentikAuthProvider } from "./authentik-provider";

/**
 * The same decision as `server.auth`, run as Mastra server middleware instead — for a Studio whose
 * UI must work without a Mastra Enterprise licence.
 *
 * Why it exists: with `server.auth` set, Studio's page asks `/api/auth/capabilities` who is signed
 * in, and in production Mastra answers that only for a licensed deployment (or its own SimpleAuth /
 * Cloud auth) — @mastra/core `buildCapabilities`. Unlicensed, the page stops at "Authentication
 * Required" even though every API call it makes is authorised (measured, docs/plans/agent-studio.md).
 * Without `server.auth` the page renders, and this middleware is the server-side check: every path
 * but the framework's public ones (and `/health`, registered before it) needs an identity
 * Authentik vouches for and the route's relation, using the provider's own, tested methods. It
 * calls nothing the licence gates. The person's id becomes the memory resource id, as
 * `mapUserToResourceId` would have made it.
 */
export function edgeGuard(provider: AuthentikAuthProvider): MiddlewareHandler {
	return async (c, next) => {
		const request = c.req.raw;
		const user = await provider.authenticateToken(
			request.headers.get("authorization") ?? "",
			request,
		);
		if (user === null) return c.json({ error: "Invalid or expired token" }, 401);
		if (!(await provider.authorizeUser(user, request)))
			return c.json({ error: "Access denied" }, 403);
		// Without the request context the person's memory could not be scoped to them: refuse.
		const context: unknown = c.get("requestContext");
		if (!(context instanceof RequestContext)) return c.json({ error: "Authorization error" }, 500);
		context.set(MASTRA_RESOURCE_ID_KEY, provider.mapUserToResourceId(user));
		context.set("user", user);
		await next();
	};
}
