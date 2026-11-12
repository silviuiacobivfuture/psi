import { createRemoteJWKSet, jwtVerify } from "jose";
import * as client from "openid-client";
import { z } from "zod";
import type { IdentityConfig } from "./config";
import { safeReturn } from "./guard";
import type { Identity } from "./stores/types";

/**
 * A site as an OpenID Connect relying party of the estate's Authentik: authorization code + PKCE S256, state and
 * nonce, a confidential client. Everything comes from discovery, so the same code serves Authentik directly
 * (`https://auth.psizone.ro/application/o/<slug>/`) or, later, the estate's hub — only OIDC_ISSUER and the client
 * pair change. ID-token verification is the library's, never hand-rolled.
 *
 * Discovery is lazy and retried: a site boots and serves its public pages while the issuer is away, and sign-in
 * answers "unavailable" instead.
 */

export interface LoginTransaction {
	state: string;
	nonce: string;
	verifier: string;
	returnTo: string;
}

export const LoginTransactionSchema = z.object({
	state: z.string().min(16),
	nonce: z.string().min(16),
	verifier: z.string().min(43),
	// Sealed, so it came from `safeReturn`; checked again here so a path is never trusted for being sealed alone.
	returnTo: z.string().refine((path) => safeReturn(path, "") === path),
});

export interface SignedInTokens {
	identity: Identity;
	sid: string | null;
	idToken: string;
}

/** What a verified logout token asks: end the sessions of one Authentik session, or of one subject. */
export type LogoutRequest =
	| { kind: "sid"; issuer: string; sid: string }
	| { kind: "subject"; issuer: string; subject: string };

const IdClaims = z.object({
	iss: z.string().url(),
	sub: z.string().min(1),
	sid: z.string().min(1).optional(),
	email: z.string().email().optional(),
	name: z.string().optional(),
	preferred_username: z.string().optional(),
});

const LogoutClaims = z.object({
	iss: z.string().min(1),
	sub: z.string().min(1).optional(),
	sid: z.string().min(1).optional(),
	iat: z.number(),
	nonce: z.undefined({ message: "a logout token never carries a nonce" }),
	events: z.record(z.string(), z.unknown()),
});
const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";

export interface RelyingParty {
	/** `silent`: `prompt=none` — signs in only if the provider already has a session, never shows a screen. */
	begin(
		redirectUri: string,
		returnTo: string,
		silent?: boolean,
	): Promise<{ url: URL; tx: LoginTransaction }>;
	finish(callbackUrl: URL, tx: LoginTransaction): Promise<SignedInTokens>;
	/** The provider's end-session URL, so signing out here signs out of Authentik and, through it, every site. */
	endSession(
		idTokenHint: string,
		postLogoutRedirectUri: string,
	): Promise<URL | null>;
	/** Verifies an OIDC Back-Channel Logout token against the issuer's keys. Throws on anything invalid. */
	verifyLogout(logoutToken: string): Promise<LogoutRequest>;
	issuer: string;
}

export function createRelyingParty(cfg: IdentityConfig): RelyingParty {
	let discovered: Promise<client.Configuration> | null = null;
	const configuration = (): Promise<client.Configuration> => {
		if (discovered === null) {
			discovered = client
				.discovery(
					new URL(cfg.issuer),
					cfg.clientId,
					cfg.clientSecret,
					undefined,
					{
						execute: cfg.allowInsecureLoopback
							? [client.allowInsecureRequests]
							: [],
						timeout: 10,
					},
				)
				.catch((err: unknown) => {
					discovered = null;
					throw err;
				});
		}
		return discovered;
	};
	let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

	return {
		issuer: cfg.issuer,

		async begin(redirectUri, returnTo, silent = false) {
			const config = await configuration();
			const tx: LoginTransaction = {
				state: client.randomState(),
				nonce: client.randomNonce(),
				verifier: client.randomPKCECodeVerifier(),
				returnTo,
			};
			const url = client.buildAuthorizationUrl(config, {
				redirect_uri: redirectUri,
				scope: "openid email profile",
				response_type: "code",
				code_challenge: await client.calculatePKCECodeChallenge(tx.verifier),
				code_challenge_method: "S256",
				state: tx.state,
				nonce: tx.nonce,
				...(silent ? { prompt: "none" } : {}),
			});
			return { url, tx };
		},

		async finish(callbackUrl, tx) {
			const config = await configuration();
			const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
				pkceCodeVerifier: tx.verifier,
				expectedState: tx.state,
				expectedNonce: tx.nonce,
				idTokenExpected: true,
			});
			const idToken = tokens.id_token;
			if (idToken === undefined)
				throw new Error("account: the provider returned no id_token");
			const claims = IdClaims.parse(tokens.claims());
			return {
				identity: {
					issuer: claims.iss,
					subject: claims.sub,
					email: claims.email ?? null,
					name: claims.name ?? claims.preferred_username ?? null,
				},
				sid: claims.sid ?? null,
				idToken,
			};
		},

		async endSession(idTokenHint, postLogoutRedirectUri) {
			const config = await configuration();
			if (config.serverMetadata().end_session_endpoint === undefined)
				return null;
			return client.buildEndSessionUrl(config, {
				id_token_hint: idTokenHint,
				post_logout_redirect_uri: postLogoutRedirectUri,
			});
		},

		async verifyLogout(logoutToken) {
			const config = await configuration();
			const meta = config.serverMetadata();
			if (meta.jwks_uri === undefined)
				throw new Error("account: the provider publishes no JWKS");
			jwks ??= createRemoteJWKSet(new URL(meta.jwks_uri));
			const { payload } = await jwtVerify(logoutToken, jwks, {
				issuer: meta.issuer,
				audience: cfg.clientId,
				maxTokenAge: "5m",
			});
			const claims = LogoutClaims.parse(payload);
			if (!(BACKCHANNEL_EVENT in claims.events))
				throw new Error("account: not a back-channel logout event");
			if (claims.sid !== undefined)
				return { kind: "sid", issuer: claims.iss, sid: claims.sid };
			if (claims.sub !== undefined)
				return { kind: "subject", issuer: claims.iss, subject: claims.sub };
			throw new Error("account: a logout token names neither sid nor sub");
		},
	};
}
