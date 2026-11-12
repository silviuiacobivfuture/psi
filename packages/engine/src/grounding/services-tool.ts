import type { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { GuideAction } from "../events";
import type { Profile } from "../profile";
import { fold } from "../text/normalize";
import type { AnswerTurn } from "./agent-tools";

export const RECOMMEND_SERVICES_TOOL = "recommendServices";
/** Services one call returns at most. */
export const SERVICES_PER_CALL = 4;
/** Buttons one reply carries at most. */
export const ACTIONS_PER_REPLY = 2;

/**
 * One service, programme or contact route as the guide may recommend it: who it is for, what
 * happens, the first step, the price when the owner has published one, and where to take it. The
 * consumer writes every field from its own reviewed content; a field it has no source for is left
 * out, never invented.
 */
export interface ServiceFact {
	id: string;
	name: string;
	/** The brand that offers it ("psizone"), for the guide to name the right place. */
	brand: string;
	/** Other names a reply may say it by ("evaluare" for "Evaluarea"): they earn the same button. */
	aka?: ReadonlyArray<string>;
	forWhom?: string;
	whatHappens?: string;
	firstStep?: string;
	/** As the owner published it ("Preț: de la 200 RON."); absent when no price is published. */
	price?: string;
	/** Where to read more or start, absolute. */
	url?: string;
	/** The button that takes the first step. */
	action?: GuideAction;
}

/** A kind of need the visitor may describe, which the consumer's routing maps to services. */
export interface ServiceNeed {
	id: string;
	/** What the model reads to pick it: "a child who is late to talk, or autism concerns". */
	description: string;
}

export interface ServiceQuery {
	/** The asking profile: the consumer's routing decides which brands' services it may offer. */
	profile: string;
	locale: string;
	need: string;
}

export interface ServiceFinding {
	services: ReadonlyArray<ServiceFact>;
	/** Said to the model beside the services (nothing fits here, the price is not published…). */
	note?: string;
}

/**
 * The consumer's services (the sites' own content and the CMS offerings). The engine knows
 * nothing of where they come from or which brand may offer what: `find` applies the routing for
 * the asking profile.
 */
export interface EngineServices {
	needs: ReadonlyArray<ServiceNeed>;
	find(query: ServiceQuery): ServiceFinding | Promise<ServiceFinding>;
}

const Action: z.ZodType<GuideAction> = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("ask"), label: z.string().min(1), text: z.string().min(1) }),
	z.object({ kind: z.literal("link"), label: z.string().min(1), href: z.string().min(1) }),
]);

/** What the model reads: the facts without their ids, which it would otherwise cite as sources. */
const Read = z.object({
	name: z.string().min(1),
	brand: z.string().min(1),
	forWhom: z.string().optional(),
	whatHappens: z.string().optional(),
	firstStep: z.string().optional(),
	price: z.string().optional(),
	url: z.string().optional(),
	action: Action.optional(),
});
const Output = z.object({
	services: z.array(Read),
	note: z.string().optional(),
});

/** The note a lookup that failed returns: the model carries on without mentioning it. */
export const SERVICES_UNAVAILABLE_NOTE =
	"The list could not be read just now. Do not tell the visitor so. Recommend from what you already know of the team (the contact facts in your rules) and offer the phone as the next step.";

function plain(text: string): string {
	return ` ${fold(text)
		.replace(/[^a-z0-9]+/g, " ")
		.trim()} `;
}

/**
 * The buttons a reply earns: for each service the tool returned this turn that has an action and
 * whose name the reply says. Deterministic and grounded (no service the tool did not return),
 * each action once, at most `ACTIONS_PER_REPLY`, in the order the tool returned them.
 */
export function mentionedServices(
	reply: string,
	returned: ReadonlyArray<ServiceFact>,
): ReadonlyArray<GuideAction> {
	const said = plain(reply);
	const seen = new Set<string>();
	const labels = new Set<string>();
	const out: Array<GuideAction> = [];
	for (const s of returned) {
		if (
			s.action === undefined ||
			![s.name, ...(s.aka ?? [])].some((n) => said.includes(plain(n)))
		) {
			continue;
		}
		const key = s.action.kind === "link" ? s.action.href : s.action.text;
		// One button per label: two services both saying "Start booking" would only confuse.
		if (seen.has(key) || labels.has(s.action.label)) continue;
		seen.add(key);
		labels.add(s.action.label);
		out.push(s.action);
		if (out.length >= ACTIONS_PER_REPLY) break;
	}
	return out;
}

/**
 * The reply without "[Service name]" marks: a model that was handed services sometimes cites them
 * like sources, but they are not numbered passages and a mark names nothing the visitor can open.
 */
export function withoutServiceMarks(reply: string, returned: ReadonlyArray<ServiceFact>): string {
	// "[serviciu]" and "[service]": the model citing the field it read, not a source.
	const names = returned.flatMap((s) => [s.id, s.name, "serviciu", "service"]);
	return names.reduce(
		(text, name) =>
			text
				.split(`[${name}]`)
				.join("")
				.replace(/[ \t]{2,}/g, " "),
		reply,
	);
}

export interface ServicesToolOptions {
	profile: Profile;
	services: EngineServices;
	turnFor: (ctx: { requestContext?: RequestContext }) => AnswerTurn;
}

function enumOf(values: ReadonlyArray<string>): z.ZodEnum<[string, ...string[]]> | undefined {
	const [first, ...rest] = [...new Set(values)];
	return first === undefined ? undefined : z.enum([first, ...rest]);
}

/** Everything a fact says, as the evidence a reply's claims are checked against. */
function evidence(s: ServiceFact): ReadonlyArray<string> {
	return [s.name, s.forWhom, s.whatHappens, s.firstStep, s.price, s.url, s.action?.label].filter(
		(x): x is string => x !== undefined,
	);
}

/**
 * `recommendServices`: what the asking profile may recommend for a need the visitor described, as short
 * facts (who it is for, what happens, the first step, the price when published, where to start).
 * Everything it returns is registered as shown, so the reply may say it and nothing else; the
 * reply's buttons are the actions of the services it names. A failing lookup answers with a note
 * that keeps the failure from the visitor, never with an error.
 */
export function createServicesTool(opts: ServicesToolOptions) {
	const need = enumOf(opts.services.needs.map((n) => n.id));
	if (need === undefined) return undefined;
	return createTool({
		id: RECOMMEND_SERVICES_TOOL,
		description: `What ${opts.profile.name} can recommend for what the visitor needs: services, programmes or the way to book, each with who it is for, what happens, the first step, the price when one is published, and where to start. Call it as soon as you understand what the visitor needs (or when they ask what we offer, what to do, how to start, or what it costs), then recommend ONE of the results, two at most: say why it fits, what the first step is, the price only if returned, and one clear next step. Needs: ${opts.services.needs
			.map((n) => `${n.id} (${n.description})`)
			.join(
				"; ",
			)}. Name only services it returns; never invent a price. These are not numbered passages: write no [n] or [id] after them.`,
		inputSchema: z.object({
			need: need.describe("The kind of need that best fits what the visitor described"),
		}),
		outputSchema: Output,
		execute: async (input, ctx) => {
			const turn = opts.turnFor(ctx);
			if (!turn.take()) {
				return { services: [], note: "Tool call limit reached: answer from what you have." };
			}
			const started = Date.now();
			let found: ServiceFinding;
			try {
				found = await opts.services.find({
					profile: opts.profile.id,
					locale: turn.locale,
					need: input.need,
				});
			} catch {
				turn.timings.push({ tool: RECOMMEND_SERVICES_TOOL, ms: Date.now() - started, passages: 0 });
				return { services: [], note: SERVICES_UNAVAILABLE_NOTE };
			}
			const services = found.services.slice(0, SERVICES_PER_CALL);
			turn.services.push(...services);
			turn.shown.push(...services.flatMap(evidence));
			turn.timings.push({
				tool: RECOMMEND_SERVICES_TOOL,
				ms: Date.now() - started,
				passages: services.length,
			});
			return Output.parse({
				services: services.map(({ id: _id, aka: _aka, ...read }) => read),
				...(found.note === undefined ? {} : { note: found.note }),
			});
		},
	});
}
