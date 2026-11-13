import { serve } from "@hono/node-server";
import { createAccount, memoryStores } from "@psi/account";
import { type MockIssuer, type MockPerson, startMockIssuer } from "@psi/account/dev/mock-issuer";
import { type Browser, createBrowser } from "@psi/account/dev/test-browser";
import { createStaffEngine, type StaffEngine } from "@psi/engine/staff";
import { createApp } from "../app";
import { accountAuth, DEV_SUBJECT, devAuth } from "../auth";
import { createFakeNotifications } from "../notifications/fake";
import { createFakePort, type FakeOptions } from "../port/fake";
import type { Membership } from "../port/schema";
import { fixedPort } from "../port/source";
import { createConsolePwa } from "../pwa";

const SECRET = "x".repeat(40);
export const ORIGIN = "http://clinic.test";

export const MEMBER: MockPerson = {
	sub: "mock-ana-7f3c",
	email: "ana@psizone.test",
	name: "Ana Test",
};
export const OUTSIDER: MockPerson = {
	sub: "mock-bogdan-91a2",
	email: "bogdan@psizone.test",
	name: "Bogdan Test",
};

export interface ConsoleOptions {
	/** The staff assistant is switched on (without a model: it renders, and answers "unavailable"). */
	assistant?: boolean;
}

/** A staff engine whose model cannot be reached (nothing listens there), for pages that only render the assistant. */
function idleAssistant(): StaffEngine {
	return createStaffEngine({
		model: { id: "fake/model", apiKey: "test", baseURL: "http://127.0.0.1:9/v1" },
	});
}

export interface Console {
	origin: string;
	browser: Browser;
	port: ReturnType<typeof createFakePort>;
	/** Signs the browser in through the Authentik-shaped issuer, returning to `path`. */
	signIn(path?: string): Promise<Response>;
	get(path: string, init?: RequestInit): Promise<Response>;
	/** One request, redirects not followed, no cookies: what the server first answers. */
	raw(path: string, init?: RequestInit): Promise<Response>;
	post(path: string, body?: BodyInit, headers?: Record<string, string>): Promise<Response>;
	close(): Promise<void>;
}

/**
 * The real console against the real sign-in: an Authentik-shaped mock issuer, @psi/account with in-memory
 * stores, the fake clinic behind the port. `person` is who the issuer signs in (its first person).
 */
export async function startConsole(
	person: MockPerson,
	fake: Partial<FakeOptions> = {},
	members?: Record<string, ReadonlyArray<Membership>>,
	options: ConsoleOptions = {},
): Promise<Console> {
	let app: ReturnType<typeof createApp> | undefined;
	const mock: MockIssuer = await startMockIssuer({
		clients: [
			{
				slug: "clinic",
				clientId: "clinic-test",
				clientSecret: "clinic-secret",
				redirectUris: [`${ORIGIN}/auth/callback`],
				postLogoutRedirectUris: [`${ORIGIN}/`],
				logoutUri: `${ORIGIN}/auth/backchannel-logout`,
			},
		],
		people: [person],
		deliverLogout: async (uri, body) => {
			await app?.fetch(new Request(uri, { method: "POST", body }));
		},
	});
	const account = createAccount({
		site: { slug: "clinic", key: "clinic", origin: ORIGIN, home: "/calendar" },
		stores: memoryStores(),
		onWarn: () => {},
		env: {
			OIDC_ISSUER: mock.issuer("clinic"),
			OIDC_CLIENT_ID: "clinic-test",
			OIDC_CLIENT_SECRET: "clinic-secret",
			SESSION_SECRET: SECRET,
			OIDC_ALLOW_INSECURE_LOOPBACK: "true",
		},
	});
	const port = createFakePort({
		members: members ?? {
			[MEMBER.sub]: [
				{ app: "psizone", roles: ["owner"] },
				{ app: "hemisync", roles: ["reception"] },
			],
		},
		...fake,
	});
	const pwa = createConsolePwa(ORIGIN, account);
	app = createApp({
		ports: fixedPort(port),
		notifications: createFakeNotifications(),
		viewAsSecret: SECRET,
		...(options.assistant === true ? { assistant: idleAssistant() } : {}),
		auth: accountAuth(account),
		origin: ORIGIN,
		pwa,
		mount: (h) => {
			account.mount(h);
			pwa.mount(h);
		},
	});
	const served = app;
	const browser = createBrowser({ [ORIGIN]: (req) => served.fetch(req) });
	const send = async (path: string, init?: RequestInit): Promise<Response> =>
		(await browser.go(`${ORIGIN}${path}`, init)).res;
	return {
		origin: ORIGIN,
		browser,
		port,
		signIn: async (path = "/calendar") =>
			(await browser.go(`${ORIGIN}/auth/sign-in?return=${encodeURIComponent(path)}`)).res,
		get: (path, init) => send(path, init),
		raw: async (path, init) => await served.fetch(new Request(`${ORIGIN}${path}`, init)),
		post: (path, body, headers) =>
			send(path, {
				method: "POST",
				...(body === undefined ? {} : { body }),
				headers: { origin: ORIGIN, "sec-fetch-site": "same-origin", ...headers },
			}),
		close: () => mock.close(),
	};
}

export interface LiveConsole {
	url: string;
	port: ReturnType<typeof createFakePort>;
	close(): Promise<void>;
}

/** A listening console for a real browser: development sign-in (the demo person), the fake clinic. */
export async function serveConsole(
	fake: Partial<FakeOptions> = {},
	options: ConsoleOptions = {},
): Promise<LiveConsole> {
	const port = createFakePort({
		members: {
			[DEV_SUBJECT]: [
				{ app: "psizone", roles: ["owner"] },
				{ app: "hemisync", roles: ["reception"] },
			],
		},
		...fake,
	});
	const holder: { fetch?: (r: Request) => Response | Promise<Response> } = {};
	const server = serve({
		fetch: (r) => holder.fetch?.(r) ?? new Response("starting", { status: 503 }),
		port: 0,
		hostname: "127.0.0.1",
	});
	await new Promise<void>((resolve) => server.once("listening", () => resolve()));
	const address = server.address();
	if (address === null || typeof address === "string")
		throw new Error("the test server has no address");
	const origin = `http://127.0.0.1:${address.port}`;
	// The development console has no sign-in configured: its account never finds a session.
	const idle = createAccount({
		site: { slug: "clinic", key: "clinic", origin, home: "/calendar" },
		stores: memoryStores(),
		onWarn: () => {},
		env: {},
	});
	const pwa = createConsolePwa(origin, idle);
	const app = createApp({
		ports: fixedPort(port),
		notifications: createFakeNotifications(),
		viewAsSecret: "v".repeat(40),
		...(options.assistant === true ? { assistant: idleAssistant() } : {}),
		auth: devAuth(),
		origin,
		pwa,
		mount: (h) => pwa.mount(h),
	});
	holder.fetch = (r) => app.fetch(r);
	return {
		url: origin,
		port,
		close: () => new Promise((resolve) => server.close(() => resolve())),
	};
}
