import { APP_DEFAULTS, type AppKey, entryFor, PAYLOADS, render } from "@psi/notify";
import { signInviteToken } from "@psi/notify/invites";
import { SITE_URLS } from "../ports/novu-env";
import type { ClientRow } from "../store/types";

/** How long an invitation works. A week is long enough for a person who reads their mail on the weekend. */
export const INVITE_DAYS = 7;
export const INVITE_MS = INVITE_DAYS * 86_400_000;

export type InviteContactKind = "client" | "guardian";

/** The one address and name an invitation goes to, from the client's own record. */
export function inviteRecipient(
	client: Pick<ClientRow, "name" | "contact" | "guardian">,
	contact: InviteContactKind,
): { name: string; email: string; forClient: string | undefined } | undefined {
	if (contact === "client") {
		const email = client.contact?.email;
		return email === undefined ? undefined : { name: client.name, email, forClient: undefined };
	}
	const email = client.guardian?.email;
	return email === undefined || client.guardian === undefined
		? undefined
		: { name: client.guardian.name, email, forClient: client.name };
}

/** `a***@gmail.com`: enough to recognise the address, not enough to read it. */
export function maskEmail(email: string): string {
	const at = email.lastIndexOf("@");
	if (at < 1) return "***";
	return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** The link an invitation e-mail carries. */
export function inviteUrl(input: {
	publicOrigin: string;
	secret: string;
	app: AppKey;
	clientId: string;
	tokenId: string;
	locale: "ro" | "en";
	expiresAt: number;
}): string {
	const { publicOrigin, ...rest } = input;
	return `${publicOrigin.replace(/\/+$/, "")}/v1/public/invites/${signInviteToken(rest)}`;
}

/** The typed payload of the invitation e-mail (what `@psi/notify` validates and renders). */
export function invitePayload(input: {
	existing: boolean;
	clientId: string;
	name: string;
	forClient: string | undefined;
	url: string;
	expiresAt: number;
}): Record<string, unknown> {
	return {
		clientId: input.clientId,
		clientName: input.name,
		...(input.forClient === undefined ? {} : { forClient: input.forClient }),
		...(input.existing ? { signInUrl: input.url } : { inviteUrl: input.url }),
		expiresAt: new Date(input.expiresAt).toISOString(),
	};
}

/** The e-mail as it would go, rendered by the same templates the sender uses, with the link a caller supplies. */
export function renderInvite(input: {
	app: AppKey;
	existing: boolean;
	locale: "ro" | "en";
	consoleUrl: string;
	payload: Record<string, unknown>;
}): { subject: string; html: string; text: string } {
	const event = input.existing ? "account.invite_existing" : "account.invite";
	const entry = entryFor(event, "client");
	if (entry === undefined) throw new Error(`the catalogue has no ${event} for a client`);
	const settings = APP_DEFAULTS[input.app];
	const rendered = render(entry, PAYLOADS[event].parse(input.payload), input.locale, {
		event,
		audience: "client",
		channels: { in_app: false, push: false, email: true },
		brandName: settings.brandName,
		theme: settings.theme,
		timeZone: settings.timeZone,
		siteUrl: SITE_URLS[input.app],
		consoleUrl: input.consoleUrl,
		place: settings.place,
	});
	return { subject: rendered.subject, html: rendered.html, text: rendered.text };
}
