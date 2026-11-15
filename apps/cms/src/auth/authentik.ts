import { type PayloadRequest, parseCookies } from "payload";
import { OAuth2Plugin } from "payload-oauth2";
import type { Env } from "../env";
import { returnToFrom } from "../platform/return-to";
import { DIRECTORY_TOKEN, endpoints, tokenReply, toUser } from "./userinfo";

/**
 * Sign-in through the estate's Authentik: authorization code with PKCE (the verifier cookie also
 * binds the callback to the browser that started it). Who may sign in is the directory's decision
 * (the cms application's policy bindings); a person is matched on their e-mail, so the break-glass
 * administrator's account is the same account when it signs in through the directory.
 *
 * offline_access: the directory also hands back a refresh token, kept on the person
 * (`directoryToken`, never shown, never spent): it is how directory-check.ts learns that the
 * directory disabled them, so a sign-in that lasts the estate's SESSION_LIFETIME still ends then.
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
		scopes: ["openid", "email", "profile", "offline_access"],
		pkceEnabled: true,
		getToken: async (code: string, req: PayloadRequest): Promise<string> => {
			const params = new URLSearchParams({
				code,
				client_id: env.OIDC_CLIENT_ID,
				client_secret: env.OIDC_CLIENT_SECRET,
				redirect_uri: `${env.SERVER_URL}/api/users/oauth/callback`,
				grant_type: "authorization_code",
			});
			const verifier = parseCookies(req.headers).get("pkce_verifier");
			if (verifier !== undefined) params.append("code_verifier", verifier);
			const r = await fetch(e.token, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					accept: "application/json",
				},
				body: params.toString(),
			});
			const reply = tokenReply(await r.json());
			req.context[DIRECTORY_TOKEN] = reply.refreshToken;
			return reply.accessToken;
		},
		getUserInfo: async (
			accessToken: string,
			req: PayloadRequest,
		): Promise<Record<string, unknown>> => {
			const r = await fetch(e.userinfo, {
				headers: { authorization: `Bearer ${accessToken}` },
			});
			if (!r.ok) throw new Error(`userinfo answered ${r.status}`);
			const refresh = req.context[DIRECTORY_TOKEN];
			return {
				...toUser(await r.json()),
				directoryToken: typeof refresh === "string" ? refresh : null,
			};
		},
		successRedirect: (req: PayloadRequest): string =>
			returnToFrom(req.headers.get("cookie")) ?? "/admin",
		failureRedirect: (_req: PayloadRequest, error?: unknown): string => {
			_req.payload.logger.error({ err: error }, "sign-in through the directory failed");
			return "/admin/login?sso=failed";
		},
	});
}
