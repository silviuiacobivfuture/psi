import type { AuthzClient } from "@psi/account";
import type { StudioUser } from "./user";

/**
 * Studio's two permissions, declared in apps/agent-studio/authz.manifest.json on the object
 * `agent_studio:psi`: `view` (open Studio, read agents, traces, threads) and `operate` (anything
 * that runs or writes: an agent's generate/stream, a tool's execute, a workflow's run — which
 * spends OpenRouter money). Studio stores no role; who holds which is the estate's decision.
 */
export type StudioRelation = "view" | "operate";

export interface StudioAuthorizer {
	readonly kind: "openfga" | "groups";
	can(user: StudioUser, relation: StudioRelation): Promise<boolean>;
}

/** The OpenFGA object every Check is asked on: one Studio per estate. */
export const STUDIO_OBJECT = "agent_studio:psi";

/**
 * The decision as Polaris holds it: a Check on OpenFGA's read port (`@psi/account`'s client, the
 * SEB SDK contract). An OpenFGA that cannot answer is a refusal, never a pass.
 */
export function openFgaAuthorizer(
	client: AuthzClient,
	onError: (message: string) => void,
): StudioAuthorizer {
	return {
		kind: "openfga",
		async can(user, relation) {
			try {
				return await client.check({ user: `user:${user.id}`, relation, object: STUDIO_OBJECT });
			} catch (err) {
				onError(
					`agent-studio authz: OpenFGA check failed (${err instanceof Error ? err.message : "unknown"})`,
				);
				return false;
			}
		},
	};
}

export interface GroupBindings {
	/** Directory groups whose members hold `view`. */
	readonly view: ReadonlyArray<string>;
	/** Directory groups whose members hold `operate` (and so `view`). */
	readonly operate: ReadonlyArray<string>;
}

/**
 * INTERIM ADAPTER — isolated on purpose, deleted when psi's OpenFGA answers for agent_studio (as
 * apps/cms/src/authz/interim.ts is). It reads the bindings Polaris will hold — a directory group
 * bound to a manifest role — from configuration, and the person's groups from Authentik's own
 * answer (userinfo or a verified token), never from a request header. The groups are the
 * directory's (gitops/platform/authentik/blueprints-agent-studio.yaml); no role lives here.
 */
export function groupAuthorizer(bindings: GroupBindings): StudioAuthorizer {
	const view = new Set([...bindings.view, ...bindings.operate]);
	const operate = new Set(bindings.operate);
	return {
		kind: "groups",
		can(user, relation) {
			const allowed = relation === "operate" ? operate : view;
			return Promise.resolve(user.groups.some((g) => allowed.has(g)));
		},
	};
}
