import { ASSISTANT_DEFAULT_MODEL } from "@psi/scheduling-sdk/contract";
import type { EngineFailure, EngineTranscript } from "../ask-context";
import { createEngine, type EngineOptions } from "../engine";
import type { Profile } from "../profile";
import {
	collect,
	FakeKnowledge,
	type FakeOpenRouter,
	type FakeReply,
	passage,
	source,
	startFakeOpenRouter,
} from "../testing";
import type { VisitorAssistantPort, VisitorUsageRecord } from "../visitor-governance";
import { BIKES } from "./consumer-profiles";

export const TENANT = "harbour";
export const FOUND = {
	kind: "passages",
	passages: [
		passage(source("rental", "Renting a bike"), "Bikes are rented by the hour, from 9 to 18."),
	],
} as const;
export const PAUSED = "The helper is resting for now; book at the desk form below.";
export const CONTACT = "+44 20 7946 0000";
const EN = BIKES.locales.en;
if (EN === undefined) throw new Error("the bikes profile has no English");

/** The bikes profile with a scheduling tenant (so the organisation's settings govern it) and its fallback copy. */
export const GOVERNED: Profile = {
	...BIKES,
	scheduling: { tenant: TENANT, services: [] },
	locales: {
		en: {
			...EN,
			fallback: {
				paused: PAUSED,
				person: (contact) => `A person can help you: ${contact}.`,
				contact: CONTACT,
				action: { label: "Book at the desk", href: "/book" },
			},
		},
	},
};

const ZERO: VisitorUsageRecord = {
	messages: 0,
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	costMicroUsd: 0,
	limitHits: 0,
};

/** The organisation's store as the port sees it: its documents (JSON text), its meters, and what was recorded. */
export class FakeVisitorStore implements VisitorAssistantPort {
	platform: string | undefined;
	org: string | undefined;
	month: VisitorUsageRecord = { ...ZERO };
	day: VisitorUsageRecord = { ...ZERO };
	failing = false;
	missing = false;
	readonly records: Array<{ tenant: string; usage: VisitorUsageRecord }> = [];
	readonly reads: Array<string> = [];

	/** The organisation's visitor patch (and, optionally, the estate's whole document). */
	set(visitor: object, extra: object = {}): this {
		this.org = JSON.stringify({
			revision: 1,
			staff: {},
			visitor,
			skills: [],
			roles: {},
			people: {},
			...extra,
		});
		return this;
	}

	async read(tenant: string): Promise<unknown> {
		this.reads.push(tenant);
		if (this.failing) throw new Error("store unreachable for visitor@example.com");
		if (this.missing) return undefined;
		return {
			...(this.platform === undefined ? {} : { platform: this.platform }),
			...(this.org === undefined ? {} : { org: this.org }),
			usage: { month: this.month, day: this.day },
		};
	}

	async record(tenant: string, usage: VisitorUsageRecord): Promise<void> {
		this.records.push({ tenant, usage });
	}
}

export interface Harness {
	server: FakeOpenRouter;
	store: FakeVisitorStore;
	failures: Array<EngineFailure>;
	transcripts: Array<EngineTranscript>;
	engine: ReturnType<typeof createEngine>;
	ask: (
		question: string,
		control?: Parameters<ReturnType<ReturnType<typeof createEngine>["guide"]>["ask"]>[1],
		more?: object,
	) => ReturnType<typeof collect>;
}

/** A governed engine on the fake OpenRouter; every answer is the same cited sentence unless scripted. */
export async function governed(
	store: FakeVisitorStore,
	script: ReadonlyArray<FakeReply> = Array.from(
		{ length: 40 },
		() => ({ kind: "text", chunks: ["Bikes are rented by the hour [1]."] }) as const,
	),
	extra: Partial<EngineOptions> = {},
): Promise<Harness> {
	const server = await startFakeOpenRouter(script);
	const failures: Array<EngineFailure> = [];
	const transcripts: Array<EngineTranscript> = [];
	const engine = createEngine({
		profiles: [GOVERNED],
		knowledge: new FakeKnowledge(Array.from({ length: 40 }, () => FOUND)),
		model: { id: "acme/small-model", apiKey: "test-key", baseURL: server.baseURL },
		screening: { model: false },
		onFailure: (f) => failures.push(f),
		onTranscript: (t) => transcripts.push(t),
		visitorAssistant: store,
		...extra,
	});
	return {
		server,
		store,
		failures,
		transcripts,
		engine,
		ask: (question, control, more = {}) =>
			collect(engine.guide("harbour-bikes").ask({ question, locale: "en", ...more }, control)),
	};
}

/** The models the organisation may use in these tests: the built-in default and two more. */
export const PLATFORM = JSON.stringify({
	revision: 1,
	defaults: { staff: {}, visitor: {} },
	ceilings: Object.fromEntries(
		(["staff", "visitor"] as const).map((s) => [
			s,
			{
				models: [ASSISTANT_DEFAULT_MODEL, "acme/primary", "acme/backup"],
				temperature: 1,
				maxOutputTokens: 8_192,
				maxToolCalls: 12,
				pageSize: 100,
				totalMs: 180_000,
				ratePerMinute: 120,
				messagesPerDay: 2_000,
				tokensPerRequest: 200_000,
				tokensPerMonth: 1_000_000_000,
				budgetMonthlyMicroUsd: 200_000_000,
				retentionDays: 90,
				forceRedaction: false,
			},
		]),
	),
});
