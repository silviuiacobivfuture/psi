import { createHmac } from "node:crypto";
import type { AppKey } from "./apps";
import type { Audience } from "./catalogue";

/** A client of an app: not an SSO account, so their Novu subscriber id is app-scoped. */
export function clientSubscriberId(app: AppKey, clientId: string): string {
	return `${app}:client:${clientId}`;
}

/** The topics of an app's teams. */
export type TeamAudience = Extract<Audience, "team" | "reception" | "owners">;
export function topicKey(app: AppKey, team: TeamAudience): string {
	return `${app}:${team}`;
}

/**
 * Novu's secure-mode `subscriberHash` for the inbox: HMAC-SHA256 of the subscriber id with the
 * environment's secret key, hex. The console's server computes it; the browser never sees the key.
 */
export function subscriberHash(secretKey: string, subscriberId: string): string {
	return createHmac("sha256", secretKey).update(subscriberId).digest("hex");
}
