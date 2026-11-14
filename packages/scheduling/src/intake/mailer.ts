import { createTransport } from "nodemailer";
import type { MailConfig } from "./mail-config";

/** A plain-text message to the team. */
export interface Mail {
	to: ReadonlyArray<string>;
	subject: string;
	text: string;
}

/** The port the site sends mail through. A failure throws `MailFailed`. */
export interface Mailer {
	send(mail: Mail): Promise<void>;
}

/** The mail could not be sent. `code` is the transport's error code ("ECONNECTION", "EAUTH"): never an address or a body. */
export class MailFailed extends Error {
	override readonly name = "MailFailed";
	constructor(readonly code: string) {
		super(`mail could not be sent (${code})`);
	}
}

function codeOf(error: unknown): string {
	if (typeof error === "object" && error !== null && "code" in error) {
		const code = error.code;
		if (typeof code === "string" && /^[A-Z0-9_]{2,30}$/.test(code)) return code;
	}
	return "UNKNOWN";
}

/** SMTP through nodemailer, with deadlines: a visitor never waits on a mail server for long. */
export function createSmtpMailer(config: MailConfig): Mailer {
	const transport = createTransport({
		host: config.host,
		port: config.port,
		secure: config.security === "tls",
		requireTLS: config.security === "starttls",
		...(config.auth === undefined ? {} : { auth: config.auth }),
		connectionTimeout: 5_000,
		greetingTimeout: 5_000,
		socketTimeout: 10_000,
	});
	return {
		async send(mail) {
			try {
				await transport.sendMail({
					from: config.from,
					to: [...mail.to],
					subject: mail.subject,
					text: mail.text,
				});
			} catch (error) {
				throw new MailFailed(codeOf(error));
			}
		},
	};
}
