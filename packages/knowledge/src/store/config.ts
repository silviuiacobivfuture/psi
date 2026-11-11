import { z } from "zod";

/** How the Chroma token travels: `Authorization: Bearer <key>` (Chroma's default) or `X-Chroma-Token`. */
export const CHROMA_AUTH_HEADERS = ["authorization", "x-chroma-token"] as const;
export const ChromaAuthHeaderSchema = z.enum(CHROMA_AUTH_HEADERS);
export type ChromaAuthHeader = z.infer<typeof ChromaAuthHeaderSchema>;

/** Chroma's own defaults, stated so the store can report where it writes. */
export const CHROMA_DEFAULT_TENANT = "default_tenant";
export const CHROMA_DEFAULT_DATABASE = "default_database";

/** The existing store: a libsql database (`file:…` locally, `libsql://…` remotely). */
export interface LibSQLConfig {
	kind: "libsql";
	url: string;
	authToken?: string;
}

/** A Chroma server (self-hosted), e.g. `http://localhost:8000` or `https://chroma.psizone.ro`. */
export interface ChromaConfig {
	kind: "chroma";
	/** `http(s)://host[:port]`, no path, no credentials. */
	url: string;
	/** The token, sent in `authHeader`. A secret: never logged, never reported. */
	apiKey?: string;
	/** Defaults to `authorization` (Bearer). */
	authHeader?: ChromaAuthHeader;
	/** Defaults to `default_tenant`. */
	tenant?: string;
	/** Defaults to `default_database`. The database must exist on the server. */
	database?: string;
}

export type VectorConfig = LibSQLConfig | ChromaConfig;

const Text = z.string().trim().min(1);

export const LibSQLConfigSchema = z.object({
	kind: z.literal("libsql"),
	url: Text,
	authToken: z.string().min(1).optional(),
});

export const ChromaConfigSchema = z.object({
	kind: z.literal("chroma"),
	url: Text,
	apiKey: Text.optional(),
	authHeader: ChromaAuthHeaderSchema.default("authorization"),
	tenant: Text.default(CHROMA_DEFAULT_TENANT),
	database: Text.default(CHROMA_DEFAULT_DATABASE),
});

export const VectorConfigSchema = z.discriminatedUnion("kind", [
	LibSQLConfigSchema,
	ChromaConfigSchema,
]);

export type ParsedChromaConfig = z.infer<typeof ChromaConfigSchema>;
export type ParsedVectorConfig = z.infer<typeof VectorConfigSchema>;

/** Unset and blank are the same: an empty variable configures nothing. */
const EnvValue = z
	.string()
	.optional()
	.transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()));

const ChromaEnv = z.object({
	CHROMA_URL: EnvValue,
	CHROMA_API_KEY: EnvValue,
	CHROMA_AUTH_HEADER: EnvValue.pipe(ChromaAuthHeaderSchema.optional()),
	CHROMA_TENANT: EnvValue,
	CHROMA_DATABASE: EnvValue,
});

/**
 * The Chroma store when `CHROMA_URL` is set (`CHROMA_API_KEY`, `CHROMA_AUTH_HEADER`,
 * `CHROMA_TENANT` and `CHROMA_DATABASE` refine it); null otherwise. A Chroma setting without
 * `CHROMA_URL` is refused, so a half-configured Chroma never quietly becomes LibSQL.
 */
export function chromaFromEnv(
	env: Record<string, string | undefined> = process.env,
): ChromaConfig | null {
	const e = ChromaEnv.parse({
		CHROMA_URL: env.CHROMA_URL,
		CHROMA_API_KEY: env.CHROMA_API_KEY,
		CHROMA_AUTH_HEADER: env.CHROMA_AUTH_HEADER,
		CHROMA_TENANT: env.CHROMA_TENANT,
		CHROMA_DATABASE: env.CHROMA_DATABASE,
	});
	if (e.CHROMA_URL === undefined) {
		const stray = (
			["CHROMA_API_KEY", "CHROMA_AUTH_HEADER", "CHROMA_TENANT", "CHROMA_DATABASE"] as const
		).filter((name) => e[name] !== undefined);
		if (stray.length > 0) throw new Error(`${stray.join(", ")} set without CHROMA_URL`);
		return null;
	}
	return {
		kind: "chroma",
		url: e.CHROMA_URL,
		...(e.CHROMA_API_KEY === undefined ? {} : { apiKey: e.CHROMA_API_KEY }),
		...(e.CHROMA_AUTH_HEADER === undefined ? {} : { authHeader: e.CHROMA_AUTH_HEADER }),
		...(e.CHROMA_TENANT === undefined ? {} : { tenant: e.CHROMA_TENANT }),
		...(e.CHROMA_DATABASE === undefined ? {} : { database: e.CHROMA_DATABASE }),
	};
}

/**
 * Picks the vector store: an explicit `vector` first; else Chroma when `CHROMA_URL` is set;
 * else LibSQL at `url` (the approved default). With none of the three there is no store.
 */
export function resolveVectorConfig(
	opts: { url?: string; authToken?: string; vector?: VectorConfig },
	env: Record<string, string | undefined> = process.env,
): ParsedVectorConfig {
	if (opts.vector !== undefined) return VectorConfigSchema.parse(opts.vector);
	const chroma = chromaFromEnv(env);
	if (chroma !== null) return ChromaConfigSchema.parse(chroma);
	if (opts.url !== undefined) {
		return LibSQLConfigSchema.parse({ kind: "libsql", url: opts.url, authToken: opts.authToken });
	}
	throw new Error("no vector store: pass `vector` or `url`, or set CHROMA_URL");
}
