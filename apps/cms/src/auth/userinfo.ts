import { z } from "zod";

/** What the directory's userinfo endpoint answers for the openid, email and profile scopes. */
const UserInfo = z.object({
	sub: z.string().min(1),
	email: z.string().email(),
	email_verified: z.boolean().optional(),
	name: z.string().optional(),
	preferred_username: z.string().optional(),
	/** Directory group names (Authentik puts them in the `profile` scope): the interim authorizer's input. */
	groups: z.array(z.string()).optional(),
});

/** Authentik's fixed endpoints, derived from the application's issuer. */
export function endpoints(issuer: string): {
	authorize: string;
	token: string;
	userinfo: string;
} {
	const origin = new URL(issuer).origin;
	return {
		authorize: `${origin}/application/o/authorize/`,
		token: `${origin}/application/o/token/`,
		userinfo: `${origin}/application/o/userinfo/`,
	};
}

/**
 * The fields cms keeps of a person signed in through the directory, refreshed at every sign-in.
 * The groups are a mirror of the directory's answer, never edited in the CMS.
 */
export function toUser(raw: unknown): {
	sub: string;
	email: string;
	name: string;
	directoryGroups: string[];
} {
	const u = UserInfo.parse(raw);
	return {
		sub: u.sub,
		email: u.email.toLowerCase(),
		name: u.name ?? u.preferred_username ?? u.email,
		directoryGroups: u.groups ?? [],
	};
}

/** Where the sign-in carries the directory's refresh token from the code exchange to the user. */
export const DIRECTORY_TOKEN = "psiDirectoryToken";

const TokenReply = z.object({
	access_token: z.string().min(1),
	refresh_token: z.string().optional(),
});

/**
 * The directory's answer to the code exchange: the access token (for userinfo, then dropped) and
 * the refresh token offline_access asks for (null when the directory gave none: that person's
 * sessions are then not checked against the directory until their next sign-in). Anything without
 * an access token refuses the sign-in, naming only what came back, never a token.
 */
export function tokenReply(raw: unknown): {
	accessToken: string;
	refreshToken: string | null;
} {
	const r = TokenReply.safeParse(raw);
	if (!r.success) {
		const keys =
			typeof raw === "object" && raw !== null ? Object.keys(raw).sort().join(",") : typeof raw;
		throw new Error(`the directory's token reply has no access token (keys: ${keys})`);
	}
	return {
		accessToken: r.data.access_token,
		refreshToken: r.data.refresh_token || null,
	};
}
