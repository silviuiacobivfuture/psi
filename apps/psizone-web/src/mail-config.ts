import { z } from "zod";

/**
 * The site's outgoing mail, read from its environment (docs/plans/clinic.md slice 0). Optional by
 * design: a site without it still stores every request and logs that nobody was e-mailed. The keys
 * come from the optional `psizone-web-mail` Secret (gitops); the password is the only secret one.
 *
 * `BOOKING_NOTIFY_TO` is the team's inbox for THIS site (each site names its own).
 */
const Address = z.string().trim().email().max(200);

const MailEnv = z.object({
	SMTP_HOST: z.string().trim().min(1).max(200),
	SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
	/** `starttls` upgrades a plain connection (port 587); `tls` is implicit TLS (port 465). */
	SMTP_SECURITY: z.enum(["starttls", "tls"]).default("starttls"),
	SMTP_USER: z.string().trim().min(1).max(200).optional(),
	SMTP_PASSWORD: z.string().min(1).max(500).optional(),
	MAIL_FROM: Address,
	BOOKING_NOTIFY_TO: z
		.string()
		.transform((list) =>
			list
				.split(",")
				.map((a) => a.trim())
				.filter((a) => a !== ""),
		)
		.pipe(z.array(Address).min(1).max(10)),
});

export interface MailConfig {
	host: string;
	port: number;
	security: "starttls" | "tls";
	auth: { user: string; pass: string } | undefined;
	from: string;
	notifyTo: ReadonlyArray<string>;
}

export type MailSetup =
	| { ok: true; config: MailConfig }
	| { ok: false; problem: "not_configured" }
	/** `keys` are the variables that are wrong: names only, never their values. */
	| { ok: false; problem: "invalid"; keys: ReadonlyArray<string> };

/** Reads the mail settings; absent host and recipients mean "not configured", anything else wrong is named. */
export function readMailEnv(env: Readonly<Record<string, string | undefined>>): MailSetup {
	const present = Object.fromEntries(
		Object.entries(env).filter(([, v]) => v !== undefined && v !== ""),
	);
	if (present.SMTP_HOST === undefined && present.BOOKING_NOTIFY_TO === undefined) {
		return { ok: false, problem: "not_configured" };
	}
	const parsed = MailEnv.safeParse(present);
	if (!parsed.success) {
		const keys = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
		return { ok: false, problem: "invalid", keys };
	}
	const e = parsed.data;
	// A user without a password (or the reverse) would send unauthenticated: refused by name.
	if ((e.SMTP_USER === undefined) !== (e.SMTP_PASSWORD === undefined)) {
		return {
			ok: false,
			problem: "invalid",
			keys: e.SMTP_USER === undefined ? ["SMTP_USER"] : ["SMTP_PASSWORD"],
		};
	}
	return {
		ok: true,
		config: {
			host: e.SMTP_HOST,
			port: e.SMTP_PORT,
			security: e.SMTP_SECURITY,
			auth:
				e.SMTP_USER !== undefined && e.SMTP_PASSWORD !== undefined
					? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD }
					: undefined,
			from: e.MAIL_FROM,
			notifyTo: e.BOOKING_NOTIFY_TO,
		},
	};
}
