import { createAuthzClient, StaticTokenSource } from "@psi/account";
import type { StudioConfig } from "../config";
import { AuthentikAuthProvider } from "./authentik-provider";
import { groupAuthorizer, openFgaAuthorizer, type StudioAuthorizer } from "./authorize";
import { createBearerVerifier } from "./verify-bearer";
import { createGateVerifier } from "./verify-gate";

/** OpenFGA when it is configured; the interim group bindings otherwise. */
export function authorizerFor(config: StudioConfig, log: (m: string) => void): StudioAuthorizer {
	if (config.openfga !== null) {
		const client = createAuthzClient({
			endpoint: config.openfga.endpoint,
			storeId: config.openfga.storeId,
			modelId: config.openfga.modelId,
			token: new StaticTokenSource(config.openfga.token),
		});
		return openFgaAuthorizer(client, log);
	}
	return groupAuthorizer(config.groups);
}

/** The server auth the configuration asks for; `undefined` only when auth is off (never in production). */
export function studioAuthFor(
	config: StudioConfig,
	log: (m: string) => void,
): AuthentikAuthProvider | undefined {
	if (config.auth.kind === "off") return undefined;
	const { gate, bearer } = config.auth;
	return new AuthentikAuthProvider({
		...(gate === null ? {} : { gate: createGateVerifier(gate) }),
		...(bearer === null ? {} : { bearer: createBearerVerifier(bearer) }),
		authorizer: authorizerFor(config, log),
		mode: config.mode,
		log,
	});
}
