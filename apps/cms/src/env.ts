import { z } from "zod";

const Origin = z
	.string()
	.url()
	.refine((u) => !u.endsWith("/"), "no trailing slash");

const Secret32 = z.string().min(32);

/** A comma-separated list of origins (the blogs the CMS notifies on publish). */
const Origins = z
	.string()
	.optional()
	.transform((v) =>
		(v ?? "")
			.split(",")
			.map((s) => s.trim())
			.filter((s) => s !== ""),
	)
	.pipe(z.array(Origin));

const S3_KEYS = [
	"S3_BUCKET",
	"S3_REGION",
	"S3_ENDPOINT",
	"S3_ACCESS_KEY_ID",
	"S3_SECRET_ACCESS_KEY",
] as const;

/**
 * Everything cms reads from its environment, parsed once. A missing or blank value stops the
 * process with the key's name: the pod's assert-secrets initContainer says the same thing earlier.
 */
const Env = z
	.object({
		PAYLOAD_SECRET: z.string().min(32),
		DATABASE_URI: z.string().startsWith("postgres"),
		/** The public origin, no trailing slash: https://cms.psizone.ro */
		SERVER_URL: Origin,
		/** Object storage: all five or none. None (local development only) stores media on disk. */
		S3_BUCKET: z.string().min(1).optional(),
		S3_REGION: z.string().min(1).optional(),
		S3_ENDPOINT: z.string().url().optional(),
		S3_ACCESS_KEY_ID: z.string().min(1).optional(),
		S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
		/** The directory's issuer: https://auth.psizone.ro/application/o/cms/ */
		OIDC_ISSUER: z
			.string()
			.url()
			.refine((u) => u.endsWith("/"), "trailing slash, as the directory publishes it"),
		OIDC_CLIENT_ID: z.string().min(1),
		OIDC_CLIENT_SECRET: z.string().min(1),
		/** The break-glass local administrator, created once on an empty database. */
		BREAKGLASS_EMAIL: z.string().email(),
		BREAKGLASS_PASSWORD: z.string().min(16),
		/**
		 * Who answers "may this person do X on brand Y": `openfga` (psi's OpenFGA, through its
		 * read-only filter) or `interim` (role assignments from CMS_ROLE_ASSIGNMENTS, evaluated
		 * against authz.manifest.json) until psi's OpenFGA is reachable from the CMS.
		 */
		AUTHZ_ADAPTER: z.enum(["interim", "openfga"]).default("interim"),
		/** `email=role+role;email=role`, roles from authz.manifest.json (interim adapter only). */
		CMS_ROLE_ASSIGNMENTS: z.string().default(""),
		/** OpenFGA's read filter, in-cluster: http://openfga.openfga.svc:8081 */
		OPENFGA_API_URL: Origin.optional(),
		OPENFGA_STORE_ID: z.string().min(1).optional(),
		OPENFGA_MODEL_ID: z.string().min(1).optional(),
		OPENFGA_API_TOKEN: z.string().min(1).optional(),
		/** The blog the live preview renders through: https://blog.psizone.ro (staging for drafts). */
		BLOG_PREVIEW_URL: Origin.optional(),
		/** Shared with blog-web: signs preview links. */
		PREVIEW_SECRET: Secret32.optional(),
		/**
		 * The four sites (comma-separated origins), told through `<site>/__cms/revalidate` when an
		 * article is published, changed or withdrawn, or a brand's AI settings change.
		 */
		SITE_WEBHOOK_URLS: Origins,
		/** Shared with the four sites: signs the revalidation webhook (HMAC-SHA256). */
		CMS_REVALIDATE_SECRET: Secret32.optional(),
		/** Shared with blog-web's collector: the only key that may write reading counters. */
		ANALYTICS_INGEST_TOKEN: Secret32.optional(),
		/** The guide's knowledge store; unset = publishing a knowledge entry does not index it. */
		PSI_KNOWLEDGE_DB_URL: z.string().min(1).optional(),
	})
	.superRefine((e, ctx) => {
		const s3: Record<(typeof S3_KEYS)[number], string | undefined> = {
			S3_BUCKET: e.S3_BUCKET,
			S3_REGION: e.S3_REGION,
			S3_ENDPOINT: e.S3_ENDPOINT,
			S3_ACCESS_KEY_ID: e.S3_ACCESS_KEY_ID,
			S3_SECRET_ACCESS_KEY: e.S3_SECRET_ACCESS_KEY,
		};
		const unset = S3_KEYS.filter((k) => s3[k] === undefined);
		if (unset.length !== 0 && unset.length !== S3_KEYS.length) {
			for (const k of unset) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: "S3_*: all or none" });
			}
		}
		if (e.AUTHZ_ADAPTER === "openfga") {
			for (const k of ["OPENFGA_API_URL", "OPENFGA_STORE_ID", "OPENFGA_API_TOKEN"] as const) {
				if (e[k] === undefined) {
					ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: "needed by openfga" });
				}
			}
		}
	});
export type Env = z.infer<typeof Env>;

/** Whether media goes to object storage (every S3_* set) or to local disk. */
export function s3Of(env: Env): {
	bucket: string;
	region: string;
	endpoint: string;
	accessKeyId: string;
	secretAccessKey: string;
} | null {
	const { S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
	if (!S3_BUCKET || !S3_REGION || !S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
		return null;
	}
	return {
		bucket: S3_BUCKET,
		region: S3_REGION,
		endpoint: S3_ENDPOINT,
		accessKeyId: S3_ACCESS_KEY_ID,
		secretAccessKey: S3_SECRET_ACCESS_KEY,
	};
}

export function parseEnv(source: Readonly<Record<string, string | undefined>>): Env {
	// A blank value is an unset value (Kubernetes renders absent optional keys as "").
	const present = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ""));
	const r = Env.safeParse(present);
	if (r.success) return r.data;
	const keys = [...new Set(r.error.issues.map((i) => String(i.path[0])))].sort();
	throw new Error(`MISSING OR INVALID ENV: ${keys.join(", ")}`);
}

let cached: Env | undefined;

/** This process's environment, parsed on first use. */
export function env(): Env {
	cached ??= parseEnv(process.env);
	return cached;
}
