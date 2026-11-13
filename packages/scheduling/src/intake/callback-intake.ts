import type { CallbackRequester } from "../callbacks-client";
import { SchedulingUnavailable } from "../transport";
import { type CallbackMailCopy, type CallbackRequest, callbackMail } from "./callback-mail";
import { type Mailer, MailFailed } from "./mailer";

/**
 * What happened to a visitor's callback request. The visitor is thanked when EITHER copy exists
 * (stored in the scheduling store, or e-mailed to the team), and told honestly when neither does.
 */
export interface Intake {
	take(request: CallbackRequest & { consent: true }): Promise<{ stored: boolean; mailed: boolean }>;
}

export interface IntakeDeps {
	/** The app (tenant) on the store: `psizone`, `hemisync`. */
	tenant: string;
	/** Absent: the store is off for this site. */
	store: CallbackRequester | undefined;
	/** Absent: mail is not configured for this site. */
	mailer: Mailer | undefined;
	notifyTo: ReadonlyArray<string>;
	/** The team e-mail's words (the site's own). */
	mailCopy: CallbackMailCopy;
	/** The site's name in the team's e-mail. */
	site: string;
	/** The practice's time zone, for the times in the e-mail. */
	zone: string;
	/** The CMS page listing the requests, when the CMS is known. */
	listUrl: string | undefined;
	now: () => number;
	/** Where failures are said. Never passed a name, a phone, an address or a body. */
	log: (line: string) => void;
}

/** A failure's cause, with nothing of the visitor's in it. */
function causeOf(error: unknown): string {
	if (error instanceof SchedulingUnavailable) return error.message;
	if (error instanceof MailFailed) return error.message;
	return "unexpected failure";
}

/**
 * Store first, then mail (the mail says whether the store has the request). A failure of either is
 * logged and never stops the other; the request is lost only when both fail.
 */
export function createIntake(deps: IntakeDeps): Intake {
	return {
		async take(request) {
			const received = deps.now();
			let stored = false;
			if (deps.store === undefined) {
				deps.log("callbacks: not stored (scheduling is off)");
			} else {
				try {
					const result = await deps.store.requestCallback({
						tenant: deps.tenant,
						contact: {
							name: request.name,
							...(request.email === "" ? {} : { email: request.email }),
							...(request.phone === "" ? {} : { phone: request.phone }),
							...(request.age === undefined ? {} : { age: request.age }),
							...(request.details === undefined ? {} : { details: request.details }),
						},
						audience: request.forWhom,
						when: request.when,
						...(request.preferredStart === undefined
							? {}
							: { preferredStart: request.preferredStart }),
						...(request.service === undefined ? {} : { service: request.service }),
						locale: request.locale,
						channel: request.channel,
						page: request.page,
						consent: request.consent,
					});
					stored = result.ok;
					if (!result.ok) deps.log(`callbacks: the store refused the request (${result.reason})`);
				} catch (error) {
					deps.log(`callbacks: not stored (${causeOf(error)})`);
				}
			}
			let mailed = false;
			if (deps.mailer === undefined) {
				deps.log("callbacks: team not e-mailed (mail is not configured)");
			} else {
				const mail = callbackMail({
					copy: deps.mailCopy,
					request,
					site: deps.site,
					zone: deps.zone,
					received,
					stored,
					listUrl: deps.listUrl,
				});
				try {
					await deps.mailer.send({ to: deps.notifyTo, ...mail });
					mailed = true;
				} catch (error) {
					deps.log(`callbacks: team not e-mailed (${causeOf(error)})`);
				}
			}
			if (!stored && !mailed) deps.log("callbacks: REQUEST LOST, neither stored nor e-mailed");
			return { stored, mailed };
		},
	};
}
