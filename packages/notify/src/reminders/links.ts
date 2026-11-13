import type { AppKey } from "../apps";
import { type LinkAction, signToken } from "./token";

export interface IssueInput {
	secret: string;
	/** The scheduling API's public origin; the links are `<origin>/v1/public/reminders/<token>/<action>`. */
	publicOrigin: string;
	app: AppKey;
	appointmentId: string;
	locale: "ro" | "en";
	/** Appointment start, epoch ms: the confirm and cancel links stop working then. */
	startsAt: number;
	now: number;
	/** How long the calendar link outlives the appointment. Default 30 days. */
	icsGraceMs?: number;
}

export interface IssuedLinks {
	confirmUrl: string;
	cancelUrl: string;
	icsUrl: string;
}

/** Signs the three links the day-before reminder (and the confirmation mail) carries. */
export function issueLinks(input: IssueInput): IssuedLinks {
	const origin = input.publicOrigin.replace(/\/+$/, "");
	const url = (action: LinkAction, expiresAt: number): string =>
		`${origin}/v1/public/reminders/${signToken({ secret: input.secret, app: input.app, appointmentId: input.appointmentId, action, locale: input.locale, expiresAt })}/${action}`;
	if (input.startsAt <= input.now)
		throw new Error("cannot issue reminder links for an appointment in the past");
	return {
		confirmUrl: url("confirm", input.startsAt),
		cancelUrl: url("cancel", input.startsAt),
		icsUrl: url("ics", input.startsAt + (input.icsGraceMs ?? 30 * 86_400_000)),
	};
}
