import { z } from "zod";

/**
 * Who is using Studio, as Authentik vouched for them. Deliberately carries no `isAdmin` and no
 * `role`: Mastra's default rules read those two fields (@mastra/server `defaultAuthConfig`), and a
 * Studio user is never decided by them — every decision is `authorizeUser`'s (authorize.ts).
 */
export interface StudioUser {
	/** Authentik's subject for this application (the provider's `sub_mode`). */
	readonly id: string;
	readonly email: string | null;
	readonly username: string | null;
	/** The person's Authentik group names, as the token or userinfo listed them. */
	readonly groups: ReadonlyArray<string>;
	/** Which path vouched: the edge gate's token, or a bearer token checked against a JWKS. */
	readonly via: "gate" | "bearer";
}

/** The claims every path reads. `groups` is required: a token without it cannot be authorized. */
export const IdentityClaimsSchema = z.object({
	sub: z.string().min(1),
	email: z.string().optional(),
	preferred_username: z.string().optional(),
	groups: z.array(z.string()),
});
export type IdentityClaims = z.infer<typeof IdentityClaimsSchema>;

/** A verified token's or userinfo's claims as a Studio user. */
export function toStudioUser(claims: IdentityClaims, via: StudioUser["via"]): StudioUser {
	return {
		id: claims.sub,
		email: claims.email ?? null,
		username: claims.preferred_username ?? null,
		groups: [...claims.groups],
		via,
	};
}

/** Why a token was refused; logged, never sent to the caller. */
export class TokenRefused extends Error {
	constructor(reason: string) {
		super(`agent-studio auth: ${reason}`);
		this.name = "TokenRefused";
	}
}
