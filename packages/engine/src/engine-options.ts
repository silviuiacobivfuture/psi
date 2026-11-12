import type { IMastraLogger } from "@mastra/core/logger";
import type { ObservabilityEntrypoint } from "@mastra/core/observability";
import type { ServerConfig } from "@mastra/core/server";
import type { MastraCompositeStore } from "@mastra/core/storage";
import type { MastraVector } from "@mastra/core/vector";
import { z } from "zod";
import type { EngineFailure } from "./ask-context";
import { EngineKnowledgeSchema } from "./contract";
import type { EngineScore } from "./grounding/faithfulness";
import type { EngineIngest } from "./ingest-workflow";
import { LanguagePackSchema } from "./language/pack";
import { ModelIdSchema } from "./model";
import { ProfileSchema } from "./profile";
import { SchedulingPortSchema } from "./scheduling/port";
import type { RateLimiter } from "./screening/rate-limit";
import type { SettingsProvider } from "./settings";
import type { EngineTiming } from "./timing";

const Millis = z.number().int().positive().max(600_000);

function hasMethods(value: unknown, names: ReadonlyArray<string>): boolean {
	if (typeof value !== "object" || value === null) return false;
	const record: object = value;
	return names.every((name) => name in record && typeof Reflect.get(record, name) === "function");
}

const fn = <T>(what: string): z.ZodType<T> =>
	z.custom<T>((value) => typeof value === "function", { message: `${what} must be a function` });

const VectorSchema: z.ZodType<MastraVector> = z.custom<MastraVector>(
	(value) => hasMethods(value, ["query", "upsert", "createIndex", "listIndexes"]),
	{ message: "a vector store must be a Mastra vector (query, upsert, createIndex, listIndexes)" },
);

/** The options of `createEngine`, parsed at the boundary: a misconfiguration fails at startup. */
export const EngineOptionsSchema = z.object({
	profiles: z.array(ProfileSchema).min(1).readonly(),
	knowledge: EngineKnowledgeSchema,
	settings: fn<SettingsProvider>("settings").optional(),
	ingest: z
		.custom<EngineIngest>(
			(value) =>
				hasMethods(value, ["ingest"]) &&
				(Reflect.get(Object(value), "sets") === undefined ||
					typeof Reflect.get(Object(value), "sets") === "object"),
			{ message: "ingest must have an ingest function (and optional named sets)" },
		)
		.optional(),
	vectors: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/), VectorSchema).optional(),
	model: z
		.object({
			id: ModelIdSchema,
			apiKey: z.string().trim().min(1).optional(),
			baseURL: z.string().url().optional(),
			screeningId: ModelIdSchema.optional(),
			dataCollection: z.enum(["deny", "allow"]).optional(),
			sort: z.enum(["latency", "throughput", "price"]).optional(),
		})
		.strict(),
	screening: z
		.object({
			model: z.boolean().optional(),
			rateLimiter: z
				.custom<RateLimiter>((value) => hasMethods(value, ["take"]), {
					message: "rateLimiter must have a take function",
				})
				.optional(),
			exchangeLimiter: z
				.custom<RateLimiter>((value) => hasMethods(value, ["take"]), {
					message: "exchangeLimiter must have a take function",
				})
				.optional(),
		})
		.strict()
		.optional(),
	memory: z.object({ url: z.string().trim().min(1) }).optional(),
	observability: z
		.custom<ObservabilityEntrypoint>((value) => typeof value === "object" && value !== null)
		.optional(),
	storage: z
		.custom<MastraCompositeStore>((value) => typeof value === "object" && value !== null)
		.optional(),
	logger: z
		.custom<IMastraLogger>((value) => hasMethods(value, ["info", "warn", "error", "debug"]))
		.optional(),
	server: z.custom<ServerConfig>((value) => typeof value === "object" && value !== null).optional(),
	languages: z.array(LanguagePackSchema).readonly().optional(),
	timeouts: z
		.object({ retrievalMs: Millis, screeningMs: Millis, idleMs: Millis, totalMs: Millis })
		.partial()
		.optional(),
	idPrefix: z
		.string()
		.regex(/^[a-z0-9][a-z0-9-]{0,40}$/)
		.optional(),
	scorerId: z
		.string()
		.regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
		.optional(),
	onFailure: fn<(failure: EngineFailure) => void>("onFailure").optional(),
	onScore: fn<(score: EngineScore) => void>("onScore").optional(),
	onTiming: fn<(timing: EngineTiming) => void>("onTiming").optional(),
	scheduling: SchedulingPortSchema.optional(),
});
