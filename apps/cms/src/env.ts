import { z } from "zod";

/**
 * Everything cms reads from its environment, parsed once. A missing or blank value stops the
 * process with the key's name: the pod's assert-secrets initContainer says the same thing earlier.
 */
const Env = z.object({
	PAYLOAD_SECRET: z.string().min(32),
	DATABASE_URI: z.string().startsWith("postgres"),
	/** The public origin, no trailing slash: https://cms.psizone.ro */
	SERVER_URL: z
		.string()
		.url()
		.refine((u) => !u.endsWith("/"), "no trailing slash"),
	S3_BUCKET: z.string().min(1),
	S3_REGION: z.string().min(1),
	S3_ENDPOINT: z.string().url(),
	S3_ACCESS_KEY_ID: z.string().min(1),
	S3_SECRET_ACCESS_KEY: z.string().min(1),
	/** The directory's issuer: https://sso.psizone.ro/application/o/cms/ */
	OIDC_ISSUER: z
		.string()
		.url()
		.refine((u) => u.endsWith("/"), "trailing slash, as the directory publishes it"),
	OIDC_CLIENT_ID: z.string().min(1),
	OIDC_CLIENT_SECRET: z.string().min(1),
	/** The break-glass local administrator, created once on an empty database. */
	BREAKGLASS_EMAIL: z.string().email(),
	BREAKGLASS_PASSWORD: z.string().min(16),
});
export type Env = z.infer<typeof Env>;

export function parseEnv(source: Readonly<Record<string, string | undefined>>): Env {
	const r = Env.safeParse(source);
	if (r.success) return r.data;
	const keys = [...new Set(r.error.issues.map((i) => String(i.path[0])))].sort();
	throw new Error(`MISSING OR INVALID ENV: ${keys.join(", ")}`);
}
