import { z } from "zod/v4";
import { route } from "../define";
import {
	AssistantEffective,
	AssistantOrgConfig,
	AssistantOrgPut,
	AssistantPlatformConfig,
	AssistantPlatformPut,
	AssistantUsage,
	AssistantUsageRecord,
} from "../entities-assistant";
import { AppParam } from "../primitives";

/**
 * The assistants' configuration and meters. The platform tier is the estate administrator's; an organisation's tier is
 * read and saved with its settings permissions (Owner and Admin); every member reads what governs their own next turn
 * and reports what a turn of theirs used.
 */
export const ASSISTANT_ROUTES = [
	route({
		id: "assistantPlatform.get",
		method: "GET",
		path: "/v1/assistant/platform",
		side: "team",
		summary:
			"The estate's assistant defaults and ceilings with their revision (revision 0: the built-in ones)",
		response: AssistantPlatformConfig,
		platform: true,
	}),
	route({
		id: "assistantPlatform.put",
		method: "PUT",
		path: "/v1/assistant/platform",
		side: "team",
		summary:
			"Save the estate's assistant defaults and ceilings edited from `revision`; 409 stale when it moved on, 422 when a default passes a ceiling",
		body: AssistantPlatformPut,
		response: AssistantPlatformConfig,
		platform: true,
		audit: "assistant.platform.put",
	}),
	route({
		id: "assistantConfig.get",
		method: "GET",
		path: "/v1/apps/:app/assistant/config",
		side: "team",
		summary:
			"The organisation's assistant settings, skills and overrides, the ceilings it is held to, what applies now and the meters",
		params: AppParam,
		response: AssistantOrgConfig,
		permission: { key: "app_settings_view", target: { kind: "app" } },
	}),
	route({
		id: "assistantConfig.put",
		method: "PUT",
		path: "/v1/apps/:app/assistant/config",
		side: "team",
		summary:
			"Save the organisation's assistant settings edited from `revision`; 409 stale when it moved on, 422 naming each value past a ceiling",
		params: AppParam,
		body: AssistantOrgPut,
		response: AssistantOrgConfig,
		permission: { key: "app_settings_edit", target: { kind: "app" } },
		audit: "assistant.config.put",
	}),
	route({
		id: "me.assistant",
		method: "GET",
		path: "/v1/apps/:app/assistant/effective",
		side: "team",
		summary:
			"What governs the caller's next staff-assistant turn: the merged settings for their roles and themselves, their skills, and a limit that already stops it",
		params: AppParam,
		response: AssistantEffective,
	}),
	route({
		id: "assistantUsage.get",
		method: "GET",
		path: "/v1/apps/:app/assistant/usage",
		side: "team",
		summary: "The organisation's assistant meters for this month and today",
		params: AppParam,
		response: AssistantUsage,
		permission: { key: "app_settings_view", target: { kind: "app" } },
	}),
	route({
		id: "me.assistantUsage",
		method: "POST",
		path: "/v1/apps/:app/assistant/usage",
		side: "team",
		summary:
			"Add what one of the caller's staff-assistant turns used to the organisation's meters and to the caller's own",
		params: AppParam,
		body: AssistantUsageRecord,
		response: z.object({ stop: AssistantEffective.shape.stop }),
	}),
] as const;
