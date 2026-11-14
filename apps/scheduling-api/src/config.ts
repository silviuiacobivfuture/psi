import { z } from "zod";

const Hex64 = z.string().regex(/^[0-9a-f]{64}$/, "64 lowercase hex characters");
const Url = z.string().url();

/** One Authentik application: its tokens carry this issuer; a token is for us only when its audience is listed. */
const IssuerSchema = z.object({
	issuer: Url,
	audiences: z.array(z.string().min(1)).min(1),
	jwksUrl: Url.optional(),
});
export type IssuerConfig = z.infer<typeof IssuerSchema>;

const CallerSchema = z.object({
	id: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
	app: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
});
export type CallerConfig = z.infer<typeof CallerSchema>;

/** `psizone-web=psizone,hemisync-web=hemisync`: one service key per caller, each scoped to one app. */
const Callers = z.string().transform((raw, ctx) => {
	const out = raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s !== "")
		.map((pair) => {
			const [id, app] = pair.split("=");
			return CallerSchema.safeParse({ id, app });
		});
	if (out.some((r) => !r.success))
		ctx.addIssue({ code: "custom", message: "SERVICE_CALLERS is `caller=app,caller=app`" });
	return out.flatMap((r) => (r.success ? [r.data] : []));
});

const Json = <T extends z.ZodTypeAny>(schema: T) =>
	z.string().transform((raw, ctx): z.infer<T> => {
		try {
			return schema.parse(JSON.parse(raw));
		} catch {
			ctx.addIssue({ code: "custom", message: "not valid JSON of the expected shape" });
			return z.NEVER;
		}
	});

const Common = z.object({
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
	PORT: z.coerce.number().int().min(1).max(65535).default(4380),
	PUBLIC_URL: Url.default("http://localhost:4380"),
	OIDC_ISSUERS: Json(z.array(IssuerSchema).min(1)),
	SERVICE_CALLERS: Callers.default(""),
	CLINIC_MASTER_KEY: Hex64,
	/**
	 * `hold`: nothing leaves the service for a person (no Novu notice, no scheduled pass, no reminder e-mail); every
	 * notice is logged by id instead. For an instance whose data is real but whose people are still served by another
	 * system (production before the cut-over), so nobody is told twice.
	 */
	NOTIFY_DELIVERY: z.enum(["send", "hold"]).default("send"),
});

const Memory = z.object({
	SCHEDULING_STORE: z.literal("memory"),
	AUTHZ: z.enum(["memory", "openfga"]).default("memory"),
});
const Convex = z.object({
	SCHEDULING_STORE: z.literal("convex"),
	AUTHZ: z.literal("openfga").default("openfga"),
	CONVEX_URL: Url,
	PSI_SCHEDULING_KEY: z.string().min(32),
});
const OpenFga = z.object({
	OPENFGA_ENDPOINT: Url,
	OPENFGA_WRITE_ENDPOINT: Url,
	OPENFGA_STORE_ID: z.string().min(1),
	OPENFGA_MODEL_ID: z
		.string()
		.min(1)
		.refine((v) => v !== "latest", "pinned, never latest"),
	OPENFGA_TOKEN: z.string().min(1),
	/** Scopes this instance's `sched_app` objects in a shared store (`prod-` -> `sched_app:prod-psizone`). */
	OPENFGA_APP_PREFIX: z
		.string()
		.regex(/^[a-z0-9-]*$/, "lowercase letters, digits and dashes")
		.default(""),
});
const Mail = z.object({
	MAIL_API_URL: Url,
	MAIL_API_KEY: z.string().min(1),
	MAIL_FROM: z.string().min(3),
	MAIL_FROM_NAME: z.string().min(1).default("Psizone"),
});
/** Novu (the estate's notification service) and the key that signs the links in reminder messages. */
const Notify = z.object({
	NOVU_API_URL: Url,
	NOVU_SECRET_KEY: z.string().min(1),
	REMINDER_LINK_SECRET: z.string().min(32),
	/** The team console's public origin: where a notification's console links lead (differs per environment). */
	CONSOLE_URL: Url,
});
/**
 * The estate's sign-in (Authentik) as the invitation flow reaches it: an API token that may create users and read the
 * customers group. Optional as a set: without it the invitation routes answer 503 and nothing else changes.
 */
const Sso = z.object({
	AUTHENTIK_URL: Url,
	AUTHENTIK_API_TOKEN: z.string().min(1),
	/** The group the site accounts live in (customers, never staff). */
	AUTHENTIK_CUSTOMERS_GROUP: z.string().min(1).default("customers"),
	/**
	 * The group whose members reach the console (`app-clinic-member` on dev, `app-clinic-prod-member` in production): the
	 * one the team's search reads and an invited member's account is made in. Absent: those two routes answer 503.
	 */
	AUTHENTIK_STAFF_GROUP: z.string().min(1).optional(),
	/** The subject a site sees for a user: Authentik's provider setting, `hashed_user_id` by default. */
	AUTHENTIK_SUB_MODE: z
		.enum(["hashed_user_id", "user_id", "user_username", "user_email"])
		.default("hashed_user_id"),
});
const Objects = z.object({
	S3_ENDPOINT: Url,
	S3_BUCKET: z.string().min(1),
	S3_REGION: z.string().min(1).default("eu-central-1"),
	S3_ACCESS_KEY_ID: z.string().min(1),
	S3_SECRET_ACCESS_KEY: z.string().min(1),
});

export interface Config {
	env: "development" | "test" | "production";
	port: number;
	publicUrl: string;
	issuers: IssuerConfig[];
	callers: CallerConfig[];
	masterKey: string;
	/** `hold`: notices are logged, never delivered, and the scheduled pass does not run. */
	delivery: "send" | "hold";
	store: { kind: "memory" } | { kind: "convex"; url: string; serverKey: string };
	authz:
		| { kind: "memory" }
		| {
				kind: "openfga";
				readUrl: string;
				writeUrl: string;
				storeId: string;
				modelId: string;
				token: string;
				appPrefix: string;
		  };
	mail: { url: string; key: string; from: string; fromName: string } | undefined;
	objects:
		| {
				endpoint: string;
				bucket: string;
				region: string;
				accessKeyId: string;
				secretAccessKey: string;
		  }
		| undefined;
	/** Absent: notifications are logged and none is delivered (development and tests). Production requires it. */
	notify:
		| { novuApiUrl: string; novuSecretKey: string; reminderLinkSecret: string; consoleUrl: string }
		| undefined;
	/** Absent: the invitation routes answer 503 (the set is optional by design). */
	sso:
		| {
				url: string;
				token: string;
				customersGroup: string;
				/** Absent: the team's search and invitation answer 503 (the client invitation is unaffected). */
				staffGroup: string | undefined;
				subMode: "hashed_user_id" | "user_id" | "user_username" | "user_email";
		  }
		| undefined;
	/** The sha-256 hex of each caller's key secret, by caller id. */
	callerHashes: Map<string, string>;
}

export class ConfigError extends Error {
	override readonly name = "ConfigError";
}

const problems = (error: z.ZodError): string =>
	error.issues.map((i) => `${i.path.join(".") || "(env)"}: ${i.message}`).join("; ");

/** The environment variable that holds a caller's key hash: `SERVICE_KEY_HASH_PSIZONE_WEB`. */
export const hashVariable = (callerId: string): string =>
	`SERVICE_KEY_HASH_${callerId.toUpperCase().replace(/-/g, "_")}`;

/**
 * Parses the environment once. A production start refuses anything missing, by name, and refuses the in-memory
 * adapters outright; a service that boots half-configured answers, and its answers are wrong.
 */
export function loadConfig(env: Record<string, string | undefined>): Config {
	const common = Common.safeParse(env);
	if (!common.success) throw new ConfigError(problems(common.error));
	const production = common.data.NODE_ENV === "production";
	const backing = z
		.discriminatedUnion("SCHEDULING_STORE", [Memory, Convex])
		.safeParse({ ...env, SCHEDULING_STORE: env.SCHEDULING_STORE ?? "memory" });
	if (!backing.success) throw new ConfigError(problems(backing.error));
	const storeKind: "memory" | "convex" = backing.data.SCHEDULING_STORE;
	const authzKind: "memory" | "openfga" = backing.data.AUTHZ;
	if (production && (storeKind === "memory" || authzKind === "memory"))
		throw new ConfigError(
			"production runs on the convex store and OpenFGA: the in-memory adapters are for tests and the local run",
		);

	let authz: Config["authz"] = { kind: "memory" };
	if (authzKind === "openfga") {
		const fga = OpenFga.safeParse(env);
		if (!fga.success) throw new ConfigError(problems(fga.error));
		authz = {
			kind: "openfga",
			readUrl: fga.data.OPENFGA_ENDPOINT,
			writeUrl: fga.data.OPENFGA_WRITE_ENDPOINT,
			storeId: fga.data.OPENFGA_STORE_ID,
			modelId: fga.data.OPENFGA_MODEL_ID,
			token: fga.data.OPENFGA_TOKEN,
			appPrefix: fga.data.OPENFGA_APP_PREFIX,
		};
	}
	const mail = Mail.safeParse(env);
	const objects = Objects.safeParse(env);
	if (production && !mail.success) throw new ConfigError(problems(mail.error));
	if (production && !objects.success) throw new ConfigError(problems(objects.error));
	// Half of it is a mistake in any environment (a link secret without a Novu to send through delivers nothing);
	// all of it is required in production.
	const notify = Notify.safeParse(env);
	const anyNotify = ["NOVU_API_URL", "NOVU_SECRET_KEY", "REMINDER_LINK_SECRET", "CONSOLE_URL"].some(
		(name) => (env[name] ?? "") !== "",
	);
	if ((production || anyNotify) && !notify.success) throw new ConfigError(problems(notify.error));

	// Optional as a set: half of it is a mistake in any environment (a token without an address reaches nothing).
	const sso = Sso.safeParse(env);
	const anySso = ["AUTHENTIK_URL", "AUTHENTIK_API_TOKEN"].some((name) => (env[name] ?? "") !== "");
	if (anySso && !sso.success) throw new ConfigError(problems(sso.error));
	// A client made staff, or staff made a client, by one mistyped group: refused at boot.
	if (sso.success && sso.data.AUTHENTIK_STAFF_GROUP === sso.data.AUTHENTIK_CUSTOMERS_GROUP)
		throw new ConfigError("AUTHENTIK_STAFF_GROUP: must not be the customers group");

	const callerHashes = new Map<string, string>();
	for (const caller of common.data.SERVICE_CALLERS) {
		const hash = Hex64.safeParse(env[hashVariable(caller.id)]);
		if (!hash.success) throw new ConfigError(`${hashVariable(caller.id)}: ${problems(hash.error)}`);
		callerHashes.set(caller.id, hash.data);
	}
	return {
		env: common.data.NODE_ENV,
		port: common.data.PORT,
		publicUrl: common.data.PUBLIC_URL,
		issuers: common.data.OIDC_ISSUERS,
		callers: common.data.SERVICE_CALLERS,
		masterKey: common.data.CLINIC_MASTER_KEY,
		delivery: common.data.NOTIFY_DELIVERY,
		store:
			backing.data.SCHEDULING_STORE === "convex"
				? {
						kind: "convex",
						url: backing.data.CONVEX_URL,
						serverKey: backing.data.PSI_SCHEDULING_KEY,
					}
				: { kind: "memory" },
		authz,
		mail: mail.success
			? {
					url: mail.data.MAIL_API_URL,
					key: mail.data.MAIL_API_KEY,
					from: mail.data.MAIL_FROM,
					fromName: mail.data.MAIL_FROM_NAME,
				}
			: undefined,
		objects: objects.success
			? {
					endpoint: objects.data.S3_ENDPOINT,
					bucket: objects.data.S3_BUCKET,
					region: objects.data.S3_REGION,
					accessKeyId: objects.data.S3_ACCESS_KEY_ID,
					secretAccessKey: objects.data.S3_SECRET_ACCESS_KEY,
				}
			: undefined,
		notify: notify.success
			? {
					novuApiUrl: notify.data.NOVU_API_URL,
					novuSecretKey: notify.data.NOVU_SECRET_KEY,
					reminderLinkSecret: notify.data.REMINDER_LINK_SECRET,
					consoleUrl: notify.data.CONSOLE_URL,
				}
			: undefined,
		sso: sso.success
			? {
					url: sso.data.AUTHENTIK_URL.replace(/\/+$/, ""),
					token: sso.data.AUTHENTIK_API_TOKEN,
					customersGroup: sso.data.AUTHENTIK_CUSTOMERS_GROUP,
					staffGroup: sso.data.AUTHENTIK_STAFF_GROUP,
					subMode: sso.data.AUTHENTIK_SUB_MODE,
				}
			: undefined,
		callerHashes,
	};
}

/** Whether this instance tells people anything: notifications configured, and delivery not held. */
export const deliversNotices = (config: Config): boolean =>
	config.notify !== undefined && config.delivery === "send";
