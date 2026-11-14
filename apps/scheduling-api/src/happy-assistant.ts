import { BUILT_IN_CEILINGS } from "@psi/scheduling-sdk/contract";
import type { Populated } from "./testing/populate";
import type { Reply } from "./testing/world";

const A = "/v1/apps/psizone";

/** An organisation's assistant document edited from `revision`: a few settings, one skill, a role and a person. */
export const orgAt = (revision: number, over: Record<string, unknown> = {}) => ({
	doc: {
		revision,
		staff: { maxToolCalls: 6, prompt: { append: "Răspunde scurt." } },
		visitor: { tone: "formal" },
		skills: [
			{
				id: "intake",
				name: "Primire",
				description: "Cum primim un client nou",
				triggers: ["client nou"],
				instructions: "Întreabă de vârstă și de motiv.",
				surfaces: ["staff"],
				enabled: true,
			},
		],
		roles: {},
		people: {},
		...over,
	},
});

/** The estate's assistant document edited from `revision`. */
export const platformAt = (revision: number, over: Record<string, unknown> = {}) => ({
	doc: {
		revision,
		defaults: { staff: { tone: "neutral" }, visitor: {} },
		ceilings: BUILT_IN_CEILINGS,
		...over,
	},
});

/** A turn's use, as the console reports it. */
export const turnUse = {
	surface: "staff",
	inputTokens: 1_200,
	outputTokens: 300,
	cachedTokens: 800,
	costMicroUsd: 450,
	limitHit: false,
};

export const ASSISTANT_HAPPY = {
	"assistantPlatform.get": (w: Populated): Promise<Reply> =>
		w.call("root", "GET", "/v1/assistant/platform"),
	"assistantPlatform.put": async (w: Populated): Promise<Reply> => {
		const held = await w.call("root", "GET", "/v1/assistant/platform");
		return w.call("root", "PUT", "/v1/assistant/platform", platformAt(Number(held.json.revision)));
	},
	"assistantConfig.get": (w: Populated): Promise<Reply> =>
		w.call("olga", "GET", `${A}/assistant/config`),
	"assistantConfig.put": async (w: Populated): Promise<Reply> => {
		const held = await w.call("olga", "GET", `${A}/assistant/config`);
		return w.call("olga", "PUT", `${A}/assistant/config`, orgAt(Number(held.json.revision)));
	},
	"assistantUsage.get": (w: Populated): Promise<Reply> =>
		w.call("olga", "GET", `${A}/assistant/usage`),
	"me.assistant": (w: Populated): Promise<Reply> =>
		w.call("rita", "GET", `${A}/assistant/effective`),
	"me.assistantUsage": (w: Populated): Promise<Reply> =>
		w.call("rita", "POST", `${A}/assistant/usage`, turnUse),
};
