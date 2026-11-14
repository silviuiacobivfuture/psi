import {
	type CallbackMailCopy,
	createIntake,
	type Intake,
	type Mailer,
	SchedulingUnavailable,
} from "@psi/scheduling";
import { createPicker, type Picker } from "./picker";
import type { VisitorScheduling } from "./service";
import type { BookingSite } from "./types";

/**
 * What the booking routes and the chat's forms work with: one site, its scheduling store (absent
 * when scheduling is off), the calendar picker and the callback intake. The picker, the intake
 * and every call the routes make are built from `site.tenant`, so a site can only ever reach its
 * own calendar.
 */
export interface BookingDeps {
	site: BookingSite;
	scheduling: VisitorScheduling | undefined;
	picker: Picker;
	intake: Intake;
	/** Says a scheduling failure (never any visitor data). */
	failed: (error: unknown) => void;
}

export interface BookingDepsOptions {
	site: BookingSite;
	/** Absent: scheduling is off, the forms are the callback form and nothing is stored. */
	scheduling: VisitorScheduling | undefined;
	/** Absent: mail is not configured, requests are only stored. */
	mailer: Mailer | undefined;
	notifyTo: ReadonlyArray<string>;
	mailCopy: CallbackMailCopy;
	/** The site's host in the team's e-mail. */
	host: string;
	/** The practice's time zone, for the times in the e-mail. */
	zone: string;
	/** The CMS page listing the requests, when the CMS is known. */
	listUrl: string | undefined;
	now?: () => number;
	/** Where failures are said. Never passed a name, a phone, an address or a body. */
	log?: (line: string) => void;
	/** Where a scheduling failure is said; by default `log`, as `failureLine`. */
	failed?: (error: unknown) => void;
}

/** A scheduling failure for the log: the cause, never any visitor data. */
export function failureLine(error: unknown): string {
	const why = error instanceof SchedulingUnavailable ? error.message : "unexpected failure";
	return `scheduling: ${why}`;
}

export function createBookingDeps(options: BookingDepsOptions): BookingDeps {
	const now = options.now ?? Date.now;
	const log = options.log ?? ((line: string) => console.error(line));
	const failed = options.failed ?? ((error: unknown): void => log(failureLine(error)));
	return {
		site: options.site,
		scheduling: options.scheduling,
		picker: createPicker(options.scheduling, options.site.tenant, now, failed),
		intake: createIntake({
			tenant: options.site.tenant,
			store: options.scheduling,
			mailer: options.mailer,
			notifyTo: options.notifyTo,
			mailCopy: options.mailCopy,
			site: options.host,
			zone: options.zone,
			listUrl: options.listUrl,
			now,
			log,
		}),
		failed,
	};
}
