import { PortError } from "./port";
import type { AppSlug, Client, Invite, InvitePick, InvitePreview } from "./schema";

const WEEK_MS = 7 * 86_400_000;
const MINUTE_MS = 60_000;

interface Held {
	invite: Invite;
	lastSentAt: number;
}

export interface FakeInviteHost {
	/** Throws `unavailable` for a method the test switched off. */
	guard(method: "invite" | "previewInvite" | "sendInvite" | "resendInvite" | "revokeInvite"): void;
	client(app: AppSlug, id: string): Client | undefined;
	now(): number;
	log(app: AppSlug, action: string, target: string): void;
}

/** `a***@gmail.com`: enough to recognise the address, not enough to read it. */
const mask = (email: string): string =>
	`${email.slice(0, 1)}***${email.slice(email.lastIndexOf("@"))}`;

/**
 * The invitation as the in-memory port plays it: the same states and refusals as the service (an active client, an
 * invitation already waiting, a contact with no e-mail, a resend inside a minute), so a screen is built against the same
 * answers until the real service stands behind it.
 */
export function createFakeInvites(host: FakeInviteHost) {
	const held = new Map<string, Held>();
	const key = (app: AppSlug, id: string): string => `${app}/${id}`;
	const statusOf = (h: Held): Invite["status"] =>
		h.invite.status === "invited" && host.now() >= h.invite.expiresAt ? "expired" : h.invite.status;
	const view = (h: Held): Invite => ({ ...h.invite, status: statusOf(h) });
	const addressOf = (client: Client, contact: InvitePick["contact"]): string => {
		const email =
			contact === "client"
				? client.email
				: client.guardian === null
					? null
					: "guardian@example.test";
		if (email === null || email === "") throw new PortError("invalid", "no e-mail", [], "no_email");
		return email;
	};
	const live = (app: AppSlug, id: string): Client => {
		const client = host.client(app, id);
		if (client === undefined) throw new PortError("not-found", id);
		if (client.status !== "current")
			throw new PortError("conflict", "not active", [], "client_not_active");
		return client;
	};
	return {
		async invite(app: AppSlug, clientId: string): Promise<Invite | null> {
			host.guard("invite");
			const found = held.get(key(app, clientId));
			return found === undefined ? null : view(found);
		},
		async previewInvite(app: AppSlug, clientId: string, pick: InvitePick): Promise<InvitePreview> {
			host.guard("previewInvite");
			const to = addressOf(live(app, clientId), pick.contact);
			return {
				to,
				subject: pick.locale === "en" ? "Create your online account" : "Creează-ți contul online",
				html: `<p>${pick.locale === "en" ? "Set your password" : "Setează parola"}</p>`,
				text: pick.locale === "en" ? "Set your password" : "Setează parola",
				expiresAt: host.now() + WEEK_MS,
				existingAccount: false,
			};
		},
		async sendInvite(app: AppSlug, clientId: string, pick: InvitePick): Promise<Invite> {
			host.guard("sendInvite");
			const to = addressOf(live(app, clientId), pick.contact);
			const before = held.get(key(app, clientId));
			if (before !== undefined) {
				const status = statusOf(before);
				if (status === "active") throw new PortError("conflict", "active", [], "already_active");
				if (status === "invited") throw new PortError("conflict", "waiting", [], "already_invited");
			}
			const now = host.now();
			const next: Held = {
				lastSentAt: now,
				invite: {
					status: "invited",
					contact: pick.contact,
					sentTo: mask(to),
					locale: pick.locale,
					invitedAt: now,
					expiresAt: now + WEEK_MS,
					sends: 1,
					existingAccount: false,
				},
			};
			held.set(key(app, clientId), next);
			host.log(app, "client.invite", clientId);
			return view(next);
		},
		async resendInvite(app: AppSlug, clientId: string): Promise<Invite> {
			host.guard("resendInvite");
			live(app, clientId);
			const before = held.get(key(app, clientId));
			if (before === undefined) throw new PortError("not-found", clientId);
			const status = statusOf(before);
			if (status === "active") throw new PortError("conflict", "active", [], "already_active");
			if (status === "revoked") throw new PortError("conflict", "revoked", [], "revoked");
			if (host.now() - before.lastSentAt < MINUTE_MS)
				throw new PortError("conflict", "too soon", [], "too_soon");
			const now = host.now();
			const next: Held = {
				lastSentAt: now,
				invite: {
					...before.invite,
					status: "invited",
					expiresAt: now + WEEK_MS,
					sends: before.invite.sends + 1,
				},
			};
			held.set(key(app, clientId), next);
			host.log(app, "client.invite_resend", clientId);
			return view(next);
		},
		async revokeInvite(app: AppSlug, clientId: string): Promise<Invite> {
			host.guard("revokeInvite");
			const before = held.get(key(app, clientId));
			if (before === undefined) throw new PortError("not-found", clientId);
			if (before.invite.status === "revoked")
				throw new PortError("conflict", "revoked", [], "revoked");
			const next: Held = { ...before, invite: { ...before.invite, status: "revoked" } };
			held.set(key(app, clientId), next);
			host.log(app, "client.invite_revoke", clientId);
			return view(next);
		},
	};
}
