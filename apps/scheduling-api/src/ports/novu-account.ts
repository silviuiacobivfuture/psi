import { createHash } from "node:crypto";
import { APP_DEFAULTS, type Recipient } from "@psi/notify";
import { invitePayload, inviteRecipient, inviteUrl } from "../engagement/invite-mail";
import { type NotifyEnv, num, SITE_URLS, str, type Translate } from "./novu-env";

const reception: Recipient = { audience: "reception" };
const owners = (except: string | undefined): Recipient => ({
	audience: "owners",
	...(except === undefined ? {} : { except }),
});

/** The client's invitation: the address and name come from the record NOW, the link is signed from the row's token. */
export const accountInvite: Translate = async (n, app, env) => {
	const clientId = str(n.payload, "clientId");
	const tokenId = str(n.payload, "tokenId");
	const expiresAt = num(n.payload, "expiresAt");
	const { links } = env.options;
	if (
		clientId === undefined ||
		tokenId === undefined ||
		expiresAt === undefined ||
		links === undefined
	)
		return;
	const client = await env.store.c.clients.get(n.app, clientId);
	if (client === undefined) return;
	const to = inviteRecipient(
		client,
		str(n.payload, "contact") === "guardian" ? "guardian" : "client",
	);
	if (to === undefined) return;
	const locale = str(n.payload, "locale") === "en" ? "en" : "ro";
	const existing = n.event === "account.invite_existing";
	const url = inviteUrl({
		publicOrigin: links.publicOrigin,
		secret: links.secret,
		app,
		clientId,
		tokenId,
		locale,
		expiresAt,
	});
	return env.send(
		app,
		existing ? "account.invite_existing" : "account.invite",
		invitePayload({ existing, clientId, name: to.name, forClient: to.forClient, url, expiresAt }),
		[{ audience: "client", clientId, email: to.email, name: to.name, locale }],
		n.idempotencyKey,
	);
};

/** "Your account is active": to the address that was invited, once. */
export const accountActivated: Translate = async (n, app, env) => {
	const clientId = str(n.payload, "clientId");
	if (clientId === undefined) return;
	const client = await env.store.c.clients.get(n.app, clientId);
	if (client === undefined) return;
	const to = inviteRecipient(
		client,
		str(n.payload, "contact") === "guardian" ? "guardian" : "client",
	);
	if (to === undefined) return;
	const locale = str(n.payload, "locale") === "en" ? "en" : "ro";
	return env.send(
		app,
		"account.activated",
		{ clientId, clientName: to.name, accountUrl: `${SITE_URLS[app]}/cont` },
		[{ audience: "client", clientId, email: to.email, name: to.name, locale }],
		n.idempotencyKey,
	);
};

/** A package nearly used up: the desk sees it in the bell, the client is told by e-mail. */
export const packageLow: Translate = async (n, app, env) => {
	const pkg = await env.store.c.packages.get(n.app, str(n.payload, "packageId") ?? "");
	const who = pkg === undefined ? undefined : await env.store.c.clients.get(n.app, pkg.clientId);
	if (pkg === undefined || who === undefined) return;
	return env.send(
		app,
		"package.running_low",
		{
			packageId: pkg.id,
			clientId: who.id,
			clientName: who.name,
			remaining: Math.max(0, num(n.payload, "sessionsRemaining") ?? 0),
		},
		[reception, await env.client(n.app, who.id)],
		n.idempotencyKey,
	);
};

export const paymentRecorded: Translate = async (n, app, env) => {
	const clientId = str(n.payload, "clientId");
	const who = clientId === undefined ? undefined : await env.client(n.app, clientId);
	const cents = num(n.payload, "amountCents") ?? 0;
	return env.send(
		app,
		"payment.recorded",
		{
			paymentId: str(n.payload, "paymentId") ?? n.idempotencyKey,
			serviceName: str(n.payload, "what") ?? "Plată",
			amount: `${(cents / 100).toFixed(2)} RON`,
		},
		[who],
		n.idempotencyKey,
	);
};

/** After a session: a one-time link to say how it went. */
export const feedbackRequested: Translate = async (n, app, env) => {
	const id = str(n.payload, "appointmentId");
	if (id === undefined) return;
	// Switched off for the app: no link is issued for a message that will not be sent.
	if (APP_DEFAULTS[app].off.includes("feedback.requested")) return;
	const facts = await env.appointment(app, id);
	if (facts === undefined || facts.row.clientId === undefined) return;
	const to = await env.client(n.app, facts.row.clientId);
	const link = await env.store.feedback.issueLink(n.app, { visit: id }, undefined);
	return env.send(
		app,
		"feedback.requested",
		{
			...facts.payload,
			feedbackUrl: `${SITE_URLS[app]}/feedback?token=${encodeURIComponent(link.token)}`,
		},
		[to],
		n.idempotencyKey,
	);
};

export const feedbackNegative: Translate = async (n, app, env) =>
	env.send(
		app,
		"feedback.negative",
		{
			feedbackId: str(n.payload, "feedbackId") ?? n.idempotencyKey,
			rating: Math.min(5, Math.max(1, num(n.payload, "rating") ?? 1)),
		},
		[owners(undefined)],
		n.idempotencyKey,
	);

/** A message that never got through: which event and how many tries, for the people who run the account. */
export const deliveryFailed: Translate = async (n, app, env) =>
	env.send(
		app,
		"delivery.failed",
		{
			deliveryId: createHash("sha256")
				.update(str(n.payload, "key") ?? n.idempotencyKey)
				.digest("hex")
				.slice(0, 16),
			failedEvent: (str(n.payload, "event") ?? "unknown").slice(0, 60),
			attempts: Math.max(1, num(n.payload, "attempts") ?? 1),
		},
		[owners(undefined)],
		n.idempotencyKey,
	);

const ACTIONS = ["export", "delete", "roles", "members", "settings"] as const;

/** Something that cannot be taken back, or that changes who may do what: the owners hear who did it (never the person themselves). */
export const securityAction: Translate = async (n, app, env: NotifyEnv) => {
	const actor = str(n.payload, "actor");
	const action = ACTIONS.find((a) => a === str(n.payload, "action"));
	if (action === undefined) return;
	const target = str(n.payload, "target");
	return env.send(
		app,
		"security.action",
		{
			securityId: createHash("sha256").update(n.idempotencyKey).digest("hex").slice(0, 16),
			action,
			by: (await env.actorName(n.app, actor)) ?? "—",
			...(target === undefined ? {} : { target: target.slice(0, 200) }),
		},
		[owners(actor)],
		n.idempotencyKey,
	);
};
