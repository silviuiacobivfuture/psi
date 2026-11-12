import { z } from "zod";

/** The environment the flags read; unknown keys are ignored. */
export type Env = Readonly<Record<string, string | undefined>>;

/** A development-only setting was switched on in production. Thrown at startup, never later. */
export class ProductionGuardError extends Error {
	constructor(setting: string) {
		super(
			`${setting} is refused in production (NODE_ENV or SITE_ENV is "production"): it is for local development only`,
		);
		this.name = "ProductionGuardError";
	}
}

/** True when `NODE_ENV` or `SITE_ENV` is `production` (case and whitespace ignored). */
export function isProduction(env: Env): boolean {
	const is = (value: string | undefined): boolean => value?.trim().toLowerCase() === "production";
	return is(env.NODE_ENV) || is(env.SITE_ENV);
}

export const DATA_COLLECTION_POLICIES = ["deny", "allow"] as const;
export type DataCollection = (typeof DATA_COLLECTION_POLICIES)[number];

const Blank = z
	.string()
	.optional()
	.transform((v) => {
		const t = v?.trim().toLowerCase() ?? "";
		return t === "" ? undefined : t;
	});

const DataCollectionEnv = Blank.pipe(z.enum(DATA_COLLECTION_POLICIES).default("deny"));

/**
 * `PSI_OPENROUTER_DATA_COLLECTION`: OpenRouter's `provider.data_collection` for the chat model,
 * the screening models and the embedder alike. `deny` (the default) routes only to providers that
 * do not store or train on requests. `allow` is what OpenRouter's `:free` models require; it is for
 * local development with dummy data only, and is refused in production. Any other value is a
 * configuration error.
 */
export function readDataCollection(env: Env): DataCollection {
	const parsed = DataCollectionEnv.safeParse(env.PSI_OPENROUTER_DATA_COLLECTION);
	if (!parsed.success) {
		throw new Error('PSI_OPENROUTER_DATA_COLLECTION must be "deny" or "allow"');
	}
	if (parsed.data === "allow" && isProduction(env)) {
		throw new ProductionGuardError("PSI_OPENROUTER_DATA_COLLECTION=allow");
	}
	return parsed.data;
}

const BooleanEnv = Blank.pipe(z.enum(["true", "false"]).default("false")).transform(
	(v) => v === "true",
);

/**
 * `PSI_DEMO_KNOWLEDGE=true`: the fictional demo entries (`src/demo`) may be ingested and served.
 * Off by default; refused in production. Anything but `true`, `false` or unset is an error.
 */
export function readDemoKnowledge(env: Env): boolean {
	const parsed = BooleanEnv.safeParse(env.PSI_DEMO_KNOWLEDGE);
	if (!parsed.success) throw new Error('PSI_DEMO_KNOWLEDGE must be "true" or "false"');
	if (parsed.data && isProduction(env)) {
		throw new ProductionGuardError("PSI_DEMO_KNOWLEDGE=true");
	}
	return parsed.data;
}
