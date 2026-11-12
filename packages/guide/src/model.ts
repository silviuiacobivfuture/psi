import { ModelIdSchema, readOpenRouterKey } from "@psi/engine";
import {
	type DataCollection,
	isProduction,
	ProductionGuardError,
	readDataCollection,
	readDemoKnowledge,
} from "@psi/knowledge";
import { z } from "zod";

/**
 * The default model, chosen by the owner (2026-11-11): `xiaomi/mimo-v2.6-flash` on OpenRouter
 * (checked against https://openrouter.ai/api/v1/models: 1M context, tool calling, $0.14 / $0.28 per
 * million input / output tokens). Override with `PSI_GUIDE_MODEL` or the `model` option.
 */
export const DEFAULT_MODEL = "xiaomi/mimo-v2.6-flash";

export { ModelIdSchema };

/** The environment the guide reads, parsed at the boundary. Unknown keys are ignored. */
const GuideEnvSchema = z.object({
	PSI_GUIDE_MODEL: ModelIdSchema.optional().catch(undefined),
	PSI_SCREENING_MODEL: ModelIdSchema.optional().catch(undefined),
});

const ScreeningSwitch = z
	.string()
	.optional()
	.transform((v) => {
		const t = v?.trim().toLowerCase() ?? "";
		return t === "" ? undefined : t;
	})
	.pipe(z.enum(["on", "off"]).default("on"));

export interface GuideEnv {
	apiKey: string | undefined;
	model: string | undefined;
	/** `PSI_SCREENING_MODEL`: the guardrails' model; the answering model when unset. */
	screeningModel: string | undefined;
	/** `PSI_MODEL_SCREENING=off` turns the model guardrails off (development only). */
	modelScreening: boolean;
	/** `PSI_OPENROUTER_DATA_COLLECTION`: `deny` unless set to `allow` outside production. */
	dataCollection: DataCollection;
	/** `PSI_DEMO_KNOWLEDGE=true`: demo-sourced passages may be served (development only). */
	demo: boolean;
	/** `PSI_OPENROUTER_SORT`: how OpenRouter orders providers; `latency` when unset or unknown. */
	sort: "latency" | "throughput" | "price";
}

/** `PSI_OPENROUTER_SORT`: an unknown value is the default, `latency`. */
const SortSchema = z.enum(["latency", "throughput", "price"]).catch("latency");

/**
 * Reads `OPENROUTER_API_KEY`, `PSI_GUIDE_MODEL`, `PSI_SCREENING_MODEL`, `PSI_MODEL_SCREENING`,
 * `PSI_OPENROUTER_DATA_COLLECTION`, `PSI_OPENROUTER_SORT` and `PSI_DEMO_KNOWLEDGE`. A malformed
 * model slug counts as unset. The development-only switches (`allow`, screening `off`, demo `true`) throw in production
 * (`NODE_ENV` or `SITE_ENV` = `production`), so a misconfigured deployment fails at startup.
 */
export function readGuideEnv(env: Readonly<Record<string, string | undefined>>): GuideEnv {
	const models = GuideEnvSchema.parse(env);
	const screening = ScreeningSwitch.safeParse(env.PSI_MODEL_SCREENING);
	if (!screening.success) throw new Error('PSI_MODEL_SCREENING must be "on" or "off"');
	if (screening.data === "off" && isProduction(env)) {
		throw new ProductionGuardError("PSI_MODEL_SCREENING=off");
	}
	return {
		apiKey: readOpenRouterKey(env),
		model: models.PSI_GUIDE_MODEL,
		screeningModel: models.PSI_SCREENING_MODEL,
		modelScreening: screening.data === "on",
		dataCollection: readDataCollection(env),
		demo: readDemoKnowledge(env),
		sort: SortSchema.parse(env.PSI_OPENROUTER_SORT),
	};
}
