import { ModelIdSchema, readOpenRouterKey } from "@psi/engine";
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
});

export interface GuideEnv {
	apiKey: string | undefined;
	model: string | undefined;
}

/** Reads `OPENROUTER_API_KEY` and `PSI_GUIDE_MODEL`; a malformed value counts as unset. */
export function readGuideEnv(env: Readonly<Record<string, string | undefined>>): GuideEnv {
	return { apiKey: readOpenRouterKey(env), model: GuideEnvSchema.parse(env).PSI_GUIDE_MODEL };
}
