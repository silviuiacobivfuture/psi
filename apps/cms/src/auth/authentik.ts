import type { PayloadRequest } from "payload";
import { OAuth2Plugin } from "payload-oauth2";
import type { Env } from "../env";
import { endpoints, toUser } from "./userinfo";

/**
 * Sign-in through the estate's Authentik: authorization code with PKCE (the verifier cookie also
 * binds the callback to the browser that started it). Who may sign in is the directory's decision
 * (the cms application's policy bindings); a person is matched on their e-mail, so the break-glass
 * administrator's account is the same account when it signs in through the directory.
 */
export function authentikSignIn(env: Env): ReturnType<typeof OAuth2Plugin> {
	const e = endpoints(env.OIDC_ISSUER);
	return OAuth2Plugin({
		enabled: true,
		strategyName: "authentik",
		useEmailAsIdentity: true,
		serverURL: env.SERVER_URL,
		authCollection: "users",
		clientId: env.OIDC_CLIENT_ID,
		clientSecret: env.OIDC_CLIENT_SECRET,
		providerAuthorizationUrl: e.authorize,
		tokenEndpoint: e.token,
		scopes: ["openid", "email", "profile"],
		pkceEnabled: true,
		getUserInfo: async (accessToken: string): Promise<Record<string, unknown>> => {
			const r = await fetch(e.userinfo, { headers: { authorization: `Bearer ${accessToken}` } });
			if (!r.ok) throw new Error(`userinfo answered ${r.status}`);
			return toUser(await r.json());
		},
		successRedirect: (): string => "/admin",
		failureRedirect: (_req: PayloadRequest, error?: unknown): string => {
			_req.payload.logger.error({ err: error }, "sign-in through the directory failed");
			return "/admin/login?sso=failed";
		},
	});
}
