import {
	getRequestHeader,
	getWebRequest,
	MastraAuthProvider,
	type MastraAuthRequest,
} from "@mastra/core/server";
import type { StudioAuthorizer, StudioRelation } from "./authorize";
import { type StudioUser, TokenRefused } from "./user";
import type { BearerVerifier } from "./verify-bearer";
import type { GateVerifier } from "./verify-gate";

/** The header Traefik copies from Authentik's outpost answer (the app's forward-auth Middleware). */
export const GATE_HEADER = "x-authentik-jwt";

/** Methods that only read. Anything else runs or writes, and needs `operate`. */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * `read-only`: nobody operates, whatever they hold — Studio shows agents, traces and threads but
 * runs nothing (the production default). `operate`: holders of `operate` may run agents, tools
 * and workflows.
 */
export type StudioMode = "read-only" | "operate";

export interface AuthentikAuthProviderOptions {
	/** Confirms the edge gate's `X-authentik-jwt` (verify-gate.ts). */
	gate?: GateVerifier;
	/** Verifies an `Authorization: Bearer` RS256 token against an OIDC provider's JWKS (verify-bearer.ts). */
	bearer?: BearerVerifier;
	authorizer: StudioAuthorizer;
	mode: StudioMode;
	/** Where refusals are reported (the reason never reaches the caller). */
	log: (message: string) => void;
}

/** The relation a request needs, from its method alone. */
export function relationFor(method: string): StudioRelation {
	return READ_METHODS.has(method.toUpperCase()) ? "view" : "operate";
}

/**
 * Mastra's server auth for Studio behind psi's Authentik: defence in depth behind the edge gate.
 * Every protected route (Mastra's default: `/api/*`, less `/api` and `/api/auth/*`) must carry an
 * identity Authentik vouches for — the gate's token, or an RS256 bearer — and the identity must
 * hold the route's relation. No identity → 401; an identity without the relation → 403.
 */
export class AuthentikAuthProvider extends MastraAuthProvider<StudioUser> {
	readonly #opts: AuthentikAuthProviderOptions;

	constructor(opts: AuthentikAuthProviderOptions) {
		super({ name: "authentik" });
		if (opts.gate === undefined && opts.bearer === undefined) {
			throw new Error("agent-studio auth: configure the gate, a bearer verifier, or both");
		}
		this.#opts = opts;
	}

	async authenticateToken(token: string, request: MastraAuthRequest): Promise<StudioUser | null> {
		const gateToken = getRequestHeader(request, GATE_HEADER)?.trim() ?? "";
		const bearer = token.replace(/^Bearer\s+/i, "").trim();
		try {
			if (gateToken !== "" && this.#opts.gate !== undefined)
				return await this.#opts.gate.verify(gateToken);
			if (bearer !== "" && this.#opts.bearer !== undefined)
				return await this.#opts.bearer.verify(bearer);
			return null;
		} catch (err) {
			if (err instanceof TokenRefused) {
				this.#opts.log(err.message);
				return null;
			}
			throw err;
		}
	}

	async authorizeUser(user: StudioUser, request: MastraAuthRequest): Promise<boolean> {
		const web = getWebRequest(request);
		if (web === undefined) return false;
		const relation = relationFor(web.method);
		if (relation === "operate" && this.#opts.mode === "read-only") return false;
		return this.#opts.authorizer.can(user, relation);
	}

	mapUserToResourceId(user: StudioUser): string {
		return user.id;
	}

	/**
	 * Who is signed in, for Studio's page (`/api/auth/capabilities`). Mastra consults this only in
	 * development or for a licensed deployment; unlicensed production never calls it, which is why
	 * the edge-guard surface exists (edge-guard.ts).
	 */
	async getCurrentUser(request: Request): Promise<StudioUser | null> {
		return this.authenticateToken(request.headers.get("authorization") ?? "", request);
	}
}
