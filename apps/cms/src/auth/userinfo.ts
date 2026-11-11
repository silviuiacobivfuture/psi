import { z } from "zod";

/** What the directory's userinfo endpoint answers for the openid, email and profile scopes. */
const UserInfo = z.object({
	sub: z.string().min(1),
	email: z.string().email(),
	email_verified: z.boolean().optional(),
	name: z.string().optional(),
	preferred_username: z.string().optional(),
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

/** The fields cms keeps of a person signed in through the directory. */
export function toUser(raw: unknown): { sub: string; email: string; name: string } {
	const u = UserInfo.parse(raw);
	return {
		sub: u.sub,
		email: u.email.toLowerCase(),
		name: u.name ?? u.preferred_username ?? u.email,
	};
}
