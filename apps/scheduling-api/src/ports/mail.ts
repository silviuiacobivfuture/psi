import { z } from "zod";

export interface Mail {
	to: string;
	subject: string;
	text: string;
}

/** The mail port. A send that did not happen throws; the caller never records a reminder as sent on a failure. */
export interface Mailer {
	send(mail: Mail): Promise<void>;
}

export class MailUnavailable extends Error {
	override readonly name = "MailUnavailable";
}

export interface MemoryMailer extends Mailer {
	outbox: Mail[];
}

export function createMemoryMailer(): MemoryMailer {
	const outbox: Mail[] = [];
	return {
		outbox,
		send(mail) {
			outbox.push(mail);
			return Promise.resolve();
		},
	};
}

/** The estate's mail service (Plunk-style: POST {to, subject, body} with a bearer key). */
export function createHttpMailer(options: {
	url: string;
	key: string;
	from: string;
	fromName: string;
	fetch?: typeof globalThis.fetch;
}): Mailer {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	return {
		async send(mail) {
			let res: Response;
			try {
				res = await doFetch(options.url, {
					method: "POST",
					headers: { "content-type": "application/json", authorization: `Bearer ${options.key}` },
					body: JSON.stringify({
						to: mail.to,
						subject: mail.subject,
						body: mail.text,
						from: options.from,
						name: options.fromName,
					}),
					signal: AbortSignal.timeout(8000),
				});
			} catch {
				throw new MailUnavailable("the mail service is unreachable");
			}
			if (!res.ok) throw new MailUnavailable(`the mail service answered ${res.status}`);
			z.unknown().parse(await res.json().catch(() => ({})));
		},
	};
}
