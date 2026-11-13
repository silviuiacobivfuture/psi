import { createHash, randomBytes } from "node:crypto";
import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Ctx } from "../http/context";
import { fail, forbidden } from "../http/errors";
import { type ClientRow, StoreRefused } from "../store/types";
import {
	INVITE_MS,
	type InviteContactKind,
	invitePayload,
	inviteRecipient,
	maskEmail,
	renderInvite,
} from "./invite-mail";
import { type Held, hashOfSubject, type InviteRow, invites, isStale, statusOf } from "./records";

type C = Ctx<RouteSpec>;
type Locale = "ro" | "en";

/** The shortest time between two sends to the same person: a double click, or a mailbox being flooded, is refused. */
const RESEND_AFTER_MS = 60_000;

const sha = (text: string): string =>
	createHash("sha256").update(text.trim().toLowerCase()).digest("hex");
const newToken = (): string => randomBytes(18).toString("base64url");

/** What the contract's `Invite` says of a stored row. */
export function viewOf(row: InviteRow, now: number) {
	return {
		clientId: row.clientId,
		status: statusOf(row, now),
		contact: row.contact,
		sentTo: row.sentTo,
		locale: row.locale,
		invitedAt: row.invitedAt,
		invitedBy: row.invitedBy,
		expiresAt: row.expiresAt,
		sends: row.sends,
		existingAccount: row.existingAccount,
		...(row.activatedAt === undefined ? {} : { activatedAt: row.activatedAt }),
		...(row.revokedAt === undefined ? {} : { revokedAt: row.revokedAt }),
	};
}

/** What a send needs that the deployment may not have: the sign-in, and the means to sign the link. */
function need(ctx: C) {
	const { sso, links } = ctx.deps;
	if (sso === undefined || links === undefined)
		throw fail("unavailable", "online accounts are not configured", { reason: "not_configured" });
	return { sso, links };
}

async function liveClient(ctx: C, clientId: string): Promise<ClientRow> {
	const client = await ctx.deps.store.c.clients.get(ctx.app, clientId);
	if (client === undefined) throw fail("not_found", "client not found");
	if (client.status !== "active")
		throw fail("conflict", "only an active client can be invited", {
			reason: "client_not_active",
			status: client.status,
		});
	return client;
}

/**
 * The address the invitation goes to. The person inviting must be allowed to SEE that contact (the client's own or the
 * guardian's): `clients_invite` lets them act on the client, not read what they could not read before.
 */
async function addressOf(
	ctx: C,
	client: ClientRow,
	contact: InviteContactKind,
): Promise<{ name: string; email: string; forClient: string | undefined }> {
	const group = contact === "client" ? "contact" : "guardian";
	if (!(await ctx.canOn(`clients_view_${group}`, "sched_client", client.id)))
		throw forbidden("not allowed to read this contact", { group });
	const to = inviteRecipient(client, contact);
	if (to === undefined)
		throw fail("invalid", "this contact has no e-mail address", { reason: "no_email", contact });
	return { ...to, email: to.email.trim().toLowerCase() };
}

const held = (ctx: C, clientId: string) => invites(ctx.deps.store.keyed).get(ctx.app, clientId);

export async function inviteState(ctx: C, clientId: string) {
	const found = await held(ctx, clientId);
	return { invite: found === undefined ? null : viewOf(found.row, ctx.now) };
}

export async function previewInvite(
	ctx: C,
	clientId: string,
	pick: { contact: InviteContactKind; locale: Locale },
) {
	const { sso, links } = need(ctx);
	const client = await liveClient(ctx, clientId);
	const to = await addressOf(ctx, client, pick.contact);
	const account = await sso.findByEmail(to.email);
	const existing = account !== undefined;
	const expiresAt = ctx.now + INVITE_MS;
	const app = ctx.app;
	if (app !== "psizone" && app !== "hemisync") throw fail("not_found", "app not found");
	const mail = renderInvite({
		app,
		existing,
		locale: pick.locale,
		consoleUrl: links.consoleUrl,
		payload: invitePayload({
			existing,
			clientId,
			name: to.name,
			forClient: to.forClient,
			// The real link is signed when the invitation is sent; the preview shows where it will be.
			url: `${links.publicOrigin.replace(/\/+$/, "")}/v1/public/invites/PREVIEW`,
			expiresAt,
		}),
	});
	return { to: to.email, ...mail, expiresAt, existingAccount: existing };
}

/** Queues the invitation e-mail: the translator signs the link from the row's token. */
async function notifyInvite(ctx: C, row: InviteRow): Promise<void> {
	await ctx.notify(
		row.existingAccount ? "account.invite_existing" : "account.invite",
		{ kind: "client", clientId: row.clientId },
		{
			clientId: row.clientId,
			contact: row.contact,
			tokenId: row.tokenId,
			expiresAt: row.expiresAt,
			locale: row.locale,
		},
		row.tokenId,
	);
}

export async function sendInvite(
	ctx: C,
	clientId: string,
	pick: { contact: InviteContactKind; locale: Locale },
) {
	const { sso } = need(ctx);
	const client = await liveClient(ctx, clientId);
	const to = await addressOf(ctx, client, pick.contact);
	const store = invites(ctx.deps.store.keyed);
	const before = await store.get(ctx.app, clientId);
	if (before !== undefined) {
		const status = statusOf(before.row, ctx.now);
		if (status === "active")
			throw fail("conflict", "the client already has an active account", {
				reason: "already_active",
			});
		if (status === "invited")
			throw fail("conflict", "an invitation is already waiting: send it again instead", {
				reason: "already_invited",
			});
	}
	const emailHash = sha(to.email);
	const found = await sso.findByEmail(to.email);
	if (found !== undefined && !found.active)
		throw fail("conflict", "that account is switched off", { reason: "account_disabled" });
	// An account WE made for this client's earlier invitation, never used, is still ours: the person must set their password.
	const earlier =
		before !== undefined &&
		found !== undefined &&
		before.row.ssoUserId === found.userId &&
		before.row.createdAccount &&
		before.row.emailHash === emailHash;
	const account = found ?? (await sso.create({ email: to.email, name: to.name }));
	const created = found === undefined || earlier;
	const hash = hashOfSubject(account.subject);
	const row: InviteRow = {
		v: 1,
		clientId,
		contact: pick.contact,
		emailHash,
		sentTo: maskEmail(to.email),
		locale: pick.locale,
		ssoUserId: account.userId,
		accountHash: hash,
		existingAccount: !created,
		createdAccount: created,
		tokenId: newToken(),
		invitedAt: ctx.now,
		invitedBy: ctx.subject,
		expiresAt: ctx.now + INVITE_MS,
		lastSentAt: ctx.now,
		sends: 1,
		status: "invited",
	};
	try {
		await store.put(ctx.app, row, before?.revision ?? 0);
		await store.link(ctx.app, hash, clientId, ctx.now);
	} catch (error) {
		// The account we just made must not outlive an invitation nobody can see.
		if (found === undefined) await sso.deactivate(account.userId).catch(() => undefined);
		if (isStale(error))
			throw fail("conflict", "the invitation changed while it was being sent", { reason: "stale" });
		throw error;
	}
	await notifyInvite(ctx, row);
	ctx.auditTarget(clientId);
	ctx.note({ contact: pick.contact, existingAccount: !created, sends: 1 });
	return viewOf(row, ctx.now);
}

export async function resendInvite(ctx: C, clientId: string, locale: Locale | undefined) {
	need(ctx);
	const client = await liveClient(ctx, clientId);
	const store = invites(ctx.deps.store.keyed);
	const before: Held<InviteRow> | undefined = await store.get(ctx.app, clientId);
	if (before === undefined) throw fail("not_found", "this client was never invited");
	const status = statusOf(before.row, ctx.now);
	if (status === "active")
		throw fail("conflict", "the client already has an active account", {
			reason: "already_active",
		});
	if (status === "revoked")
		throw fail("conflict", "the invitation was withdrawn: send a new one", { reason: "revoked" });
	if (ctx.now - before.row.lastSentAt < RESEND_AFTER_MS)
		throw fail("conflict", "an invitation was sent a moment ago", { reason: "too_soon" });
	const to = await addressOf(ctx, client, before.row.contact);
	if (sha(to.email) !== before.row.emailHash)
		throw fail(
			"conflict",
			"the address changed since the invitation: withdraw it and send a new one",
			{
				reason: "contact_changed",
			},
		);
	const row: InviteRow = {
		...before.row,
		locale: locale ?? before.row.locale,
		tokenId: newToken(),
		expiresAt: ctx.now + INVITE_MS,
		lastSentAt: ctx.now,
		sends: before.row.sends + 1,
		status: "invited",
	};
	try {
		await store.put(ctx.app, row, before.revision);
	} catch (error) {
		if (isStale(error))
			throw fail("conflict", "the invitation changed while it was being sent", { reason: "stale" });
		throw error;
	}
	await notifyInvite(ctx, row);
	ctx.auditTarget(clientId);
	ctx.note({ contact: row.contact, sends: row.sends });
	return viewOf(row, ctx.now);
}

/**
 * Withdraws the invitation: the link stops working and the account no longer shows this client's appointments. The sign-in
 * account itself is never touched (it may be the person's own, from before), so a later invitation can reuse it.
 */
export async function revokeInvite(ctx: C, clientId: string) {
	const store = invites(ctx.deps.store.keyed);
	const before = await store.get(ctx.app, clientId);
	if (before === undefined) throw fail("not_found", "this client was never invited");
	if (before.row.status === "revoked")
		throw fail("conflict", "the invitation is already withdrawn", { reason: "revoked" });
	const row: InviteRow = { ...before.row, status: "revoked", revokedAt: ctx.now };
	try {
		await store.put(ctx.app, row, before.revision);
	} catch (error) {
		if (isStale(error))
			throw fail("conflict", "the invitation changed meanwhile", { reason: "stale" });
		throw error;
	}
	await store.unlink(ctx.app, before.row.accountHash, clientId);
	ctx.auditTarget(clientId);
	ctx.note({ wasActive: before.row.status === "active" });
	return viewOf(row, ctx.now);
}

/** The clients an account may see: linked, and whose invitation names this very account and was not withdrawn. */
export async function clientsOfAccount(ctx: C, subject: string): Promise<InviteRow[]> {
	const store = invites(ctx.deps.store.keyed);
	const hash = hashOfSubject(subject);
	const rows: InviteRow[] = [];
	for (const clientId of await store.clientsOf(ctx.app, hash)) {
		const found = await store.get(ctx.app, clientId);
		if (found !== undefined && found.row.accountHash === hash && found.row.status !== "revoked")
			rows.push(found.row);
	}
	return rows;
}

/**
 * First sign-in of an invited account: the invitation becomes `active`, once (a compare-and-set, so two requests racing
 * activate it once), with an audit event and the "your account is active" e-mail. A call that finds nothing to activate
 * writes nothing.
 */
export async function activateOnSignIn(ctx: C, subject: string): Promise<void> {
	const store = invites(ctx.deps.store.keyed);
	const hash = hashOfSubject(subject);
	for (const clientId of await store.clientsOf(ctx.app, hash)) {
		const found = await store.get(ctx.app, clientId);
		if (found === undefined || found.row.accountHash !== hash || found.row.status !== "invited")
			continue;
		try {
			await store.put(
				ctx.app,
				{ ...found.row, status: "active", activatedAt: ctx.now },
				found.revision,
			);
		} catch (error) {
			if (isStale(error) || error instanceof StoreRefused) continue;
			throw error;
		}
		await ctx.auditNow(
			"client.invite_activated",
			{ type: "client", id: clientId },
			{ contact: found.row.contact },
		);
		await ctx.notify(
			"account.activated",
			{ kind: "client", clientId },
			{ clientId, contact: found.row.contact, locale: found.row.locale },
			found.row.tokenId,
		);
	}
}
