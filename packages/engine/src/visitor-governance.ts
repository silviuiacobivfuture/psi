import {
	AssistantOrgDocument,
	AssistantPlatformDocument,
	type AssistantSettingsType,
	type AssistantStopName,
	BUILT_IN_SETTINGS,
	orgSettings,
	stopFor,
} from "@psi/scheduling-sdk/contract";
import { z } from "zod";
import { within } from "./deadline";

/**
 * The visitor assistant's settings as the organisation stored them (Setări → Asistent, the site's surface), over the
 * estate's defaults and within its ceilings, read once per turn from the scheduling store through the app's port.
 *
 * Precedence against the CMS's `ai-settings` (`RetrievalSettings`): on a site the store governs, THE STORE WINS for
 * whether the assistant runs (`enabled`; the CMS's `guideEnabled` no longer switches it), its model and fallbacks, its
 * temperature (the CMS's `behaviour.model` and `behaviour.creativity` are superseded), the longest answer
 * (`maxOutputTokens`, capped by `tokens.perRequest`), the tool calls, the time limits, the rate per minute, the messages
 * per visitor per day (in place of the CMS's `exchangeLimit`/`exchangeWindowHours`) and per conversation, the
 * organisation's tokens per day and month and its monthly budget, booking in the chat (`booking.*`), the hand-over to a
 * person (`handoff.*`), the history read back and the conversation memory's retention (`memory.historyMessages`,
 * `memory.retentionDays`) and what is logged (`logging.*`). THE CMS KEEPS the content: the conversation style, the team's
 * notes, the topics, the copy, retrieval (`embeddings`, `embedModel`, `deepSearch`) and the screening level. A site the
 * store does not govern (no scheduling tenant, or no port) runs on the CMS's settings and the engine's own limits, as
 * before.
 *
 * When the store cannot be read (unreachable, slow, an unreadable document), the last good read holds, its stop
 * re-judged on the meters it carried; before any good read, the built-in visitor settings, with no stop (no meter is
 * known). The failure is reported as a `settings` failure.
 */

const Count = z.number().int().min(0);
const Meter = z.object({
	messages: Count,
	inputTokens: Count,
	outputTokens: Count,
	cachedTokens: Count,
	costMicroUsd: Count,
	limitHits: Count,
});
export type VisitorUsageRecord = z.infer<typeof Meter>;

/** What the port answers for an organisation: its tiers as stored (JSON text) and its visitor meters. */
export const VisitorStoreReadSchema = z.object({
	platform: z.string().optional(),
	org: z.string().optional(),
	usage: z.object({ month: Meter, day: Meter }),
});
export type VisitorStoreRead = z.infer<typeof VisitorStoreReadSchema>;

/**
 * The app's way to the scheduling store for the visitor assistant (`@psi/guide`'s `visitorAssistantPort` over
 * `@psi/scheduling`). `read` answers `VisitorStoreRead` (parsed here), or undefined when the organisation is not
 * there; `record` adds one turn's use to its meters.
 */
export interface VisitorAssistantPort {
	read(tenant: string): Promise<unknown>;
	record(tenant: string, usage: VisitorUsageRecord): Promise<void>;
}

export const VisitorAssistantPortSchema: z.ZodType<VisitorAssistantPort> =
	z.custom<VisitorAssistantPort>(
		(value) =>
			typeof value === "object" &&
			value !== null &&
			typeof Reflect.get(value, "read") === "function" &&
			typeof Reflect.get(value, "record") === "function",
		{ message: "visitorAssistant must have read and record functions" },
	);

/** What governs one visitor turn: the merged settings, and a limit of the organisation that already stops it. */
export interface Governance {
	settings: AssistantSettingsType;
	stop: AssistantStopName | undefined;
}

export interface GovernanceSource {
	readonly tenant: string;
	current(): Promise<Governance>;
	/** Adds one turn's use; a failing store is reported, never failing the turn. */
	record(usage: VisitorUsageRecord): Promise<void>;
	/** The retention of the last good read (the built-in one before any). */
	retentionDays(): number;
}

/** A stored document, parsed with the contract's own schema; one that does not parse is a failed read. */
function parsed<T>(
	parse: (v: unknown) => { success: true; data: T } | { success: false },
	body: string | undefined,
	what: string,
): T | undefined {
	if (body === undefined) return undefined;
	const doc = parse(JSON.parse(body));
	if (!doc.success) throw new Error(`the stored ${what} cannot be read`);
	return doc.data;
}

/** The governance of one organisation's visitor turns, read through `port`. */
export function createGovernance(
	port: VisitorAssistantPort,
	tenant: string,
	timeoutMs: number,
	onError: (error: unknown, stage: "settings" | "usage") => void,
): GovernanceSource {
	let last: { settings: AssistantSettingsType; usage: VisitorStoreRead["usage"] } | undefined;
	return {
		tenant,
		async current() {
			try {
				const raw = await within(
					Promise.resolve().then(() => port.read(tenant)),
					timeoutMs,
					"assistant settings",
				);
				if (raw === undefined) throw new Error(`the store has no app ${tenant}`);
				const read = VisitorStoreReadSchema.parse(raw);
				const settings = orgSettings(
					{
						platform: parsed(
							(v) => AssistantPlatformDocument.safeParse(v),
							read.platform,
							"estate document",
						),
						org: parsed(
							(v) => AssistantOrgDocument.safeParse(v),
							read.org,
							"organisation document",
						),
					},
					"visitor",
				);
				last = { settings, usage: read.usage };
			} catch (error) {
				onError(error, "settings");
			}
			if (last === undefined) return { settings: BUILT_IN_SETTINGS.visitor, stop: undefined };
			return { settings: last.settings, stop: stopFor(last.settings, last.usage) };
		},
		async record(usage) {
			try {
				await within(
					Promise.resolve().then(() => port.record(tenant, usage)),
					timeoutMs,
					"assistant meters",
				);
			} catch (error) {
				onError(error, "usage");
			}
		},
		retentionDays: () => (last?.settings ?? BUILT_IN_SETTINGS.visitor).memory.retentionDays,
	};
}
