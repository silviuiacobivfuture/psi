import { createHash } from "node:crypto";
import type { AppKey, EventId } from "./apps";
import { type Audience, type Channel, DOMAIN_FIELDS } from "./catalogue";
import { clientSubscriberId, type TeamAudience, topicKey } from "./identity";
import type { SubscriberFields, Target } from "./novu-http";

/** A person of a team, as the service resolved them: their sign-in subject and what the mail needs. */
export interface TeamPerson {
	subject: string;
	email?: string;
	name?: string;
	locale?: "ro" | "en";
}

/** Who a notification goes to: a client, a person of the app, or a team (a permission's holders, resolved at send time). */
export type Recipient =
	| {
			audience: "client";
			clientId: string;
			email?: string;
			phone?: string;
			name?: string;
			locale?: "ro" | "en";
	  }
	| {
			audience: "practitioner" | "requester" | "actor";
			/** The estate sign-in subject. */
			subject: string;
			email?: string;
			name?: string;
			locale?: "ro" | "en";
	  }
	| {
			audience: TeamAudience;
			/** One person of the team (already resolved); absent, the whole team is resolved from the entry's permission. */
			subject?: string;
			email?: string;
			name?: string;
			locale?: "ro" | "en";
			/** Left out when the team is resolved: the person who did it needs no notice of their own action. */
			except?: string;
			/** Resolve by this permission instead of the entry's (a digest's money line goes to those who may read revenue). */
			needs?: string;
			/** Leave out the holders of this permission (the other half of that split). */
			without?: string;
	  };

export type TeamRecipient = Extract<Recipient, { audience: TeamAudience }>;
export type PersonRecipient =
	| Exclude<Recipient, TeamRecipient>
	| (TeamRecipient & { subject: string });

export const isTeam = (r: Recipient): r is TeamRecipient =>
	r.audience === "team" || r.audience === "reception" || r.audience === "owners";

/** A team recipient that names one person. */
export const isPerson = (r: Recipient): r is PersonRecipient =>
	!isTeam(r) || r.subject !== undefined;

export function shortHash(text: string): string {
	return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/** The Novu subscriber (or topic) a recipient is. */
export function recipientKey(app: AppKey, r: Recipient): string {
	switch (r.audience) {
		case "client":
			return clientSubscriberId(app, r.clientId);
		case "practitioner":
		case "requester":
		case "actor":
			return r.subject;
		case "team":
		case "reception":
		case "owners":
			return r.subject ?? topicKey(app, r.audience);
		default: {
			const never: never = r;
			return never;
		}
	}
}

export function target(app: AppKey, r: Recipient, locale: "ro" | "en" | undefined): Target {
	if (!isPerson(r)) return { topicKey: topicKey(app, r.audience) };
	const fields: SubscriberFields = { subscriberId: recipientKey(app, r) };
	if (r.email !== undefined) fields.email = r.email;
	if (r.name !== undefined) fields.firstName = r.name;
	if (locale !== undefined) fields.locale = locale;
	if (r.audience === "client" && r.phone !== undefined) fields.phone = r.phone;
	return { subscriberId: fields.subscriberId, fields };
}

/** The ids that say WHICH object an event is about, joined: two objects never share a delivery's key. */
function domainKey(payload: Record<string, unknown>): string {
	const parts: string[] = [];
	for (const field of DOMAIN_FIELDS) {
		const v = payload[field];
		if (typeof v === "string") parts.push(v);
	}
	return parts.join("+");
}

/** The first id a payload names (what a delivery log keeps to say what a failure was about). */
export function refOf(payload: Record<string, unknown>): string | undefined {
	for (const field of DOMAIN_FIELDS) {
		const v = payload[field];
		if (typeof v === "string") return v;
	}
	return undefined;
}

/** The idempotency key of one delivery: the same event, object, time and recipient is sent once. */
export function idempotencyKey(
	app: AppKey,
	event: EventId,
	audience: Audience,
	payload: Record<string, unknown>,
	recipient: string,
	occurrence = "",
): string {
	const startsAt = typeof payload.startsAt === "string" ? payload.startsAt : "";
	const raw = [app, event, audience, domainKey(payload), startsAt, occurrence, recipient].join("|");
	return `${app}:${event}:${shortHash(raw)}${shortHash(`${raw}#`)}`;
}

export const NO_CHANNELS: Readonly<Record<Channel, boolean>> = {
	in_app: false,
	push: false,
	email: false,
};
