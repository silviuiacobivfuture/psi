import { z } from "zod/v4";
import { route } from "../define";
import { AssistantEffective, AssistantVisitorUsageRecord } from "../entities-assistant";
import { AppParam } from "../primitives";

/**
 * A public site's visitor assistant, governed by its organisation (Setări → Asistent, the site's surface): the site's
 * server reads what governs its next turn and reports what a turn used, with its own service key (a signed-in visitor
 * reaches neither: 403). No store credentials are needed on the site.
 */
export const VISITOR_ASSISTANT_ROUTES = [
	route({
		id: "visitor.assistant",
		method: "GET",
		path: "/v1/apps/:app/book/assistant",
		side: "visitor",
		summary:
			"What governs the site's next visitor-assistant turn: the organisation's merged settings over the estate's, the skills, a limit that already stops it, and the meters (the site's server only)",
		params: AppParam,
		response: AssistantEffective,
	}),
	route({
		id: "visitor.assistantUsage",
		method: "POST",
		path: "/v1/apps/:app/book/assistant/usage",
		side: "visitor",
		summary:
			"Add what one visitor-assistant turn used (its screening's model calls included) to the organisation's visitor meters (the site's server only)",
		params: AppParam,
		body: AssistantVisitorUsageRecord,
		response: z.object({ stop: AssistantEffective.shape.stop }),
	}),
] as const;
