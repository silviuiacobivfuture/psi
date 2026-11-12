import { z } from "zod";
import { SiteSchema } from "../ai-settings";

/**
 * What a site answers the control plane (the CMS's /admin/platform views), route by route. Every
 * answer is read-only facts about the service or the result of one staff action; none carries a
 * secret, a visitor's question or anything clinical. Parsed on both sides.
 */

/** A part of a site that may be absent: on, deliberately off, or never configured. */
export const PartState = z.enum(["on", "off", "not_configured", "error"]);
export type PartState = z.infer<typeof PartState>;

export const KnowledgeIndex = z.object({
	/** `kb_<brand>_<locale>_<space>` */
	name: z.string(),
	locale: z.string(),
	space: z.string(),
	chunks: z.number().int().nonnegative(),
	dimension: z.number().int().nonnegative().nullable(),
});
export type KnowledgeIndex = z.infer<typeof KnowledgeIndex>;

export const LastIngest = z.object({
	at: z.string().datetime(),
	entries: z.number().int().nonnegative(),
	chunks: z.number().int().nonnegative(),
	skipped: z.number().int().nonnegative(),
	embedder: z.string(),
	/** The CMS user id who asked for it. */
	actor: z.string(),
});
export type LastIngest = z.infer<typeof LastIngest>;

export const KnowledgeStatus = z.object({
	state: PartState,
	/** `chroma (http://…/default_tenant/default_database)`; never a token. */
	store: z.string().nullable(),
	embedder: z.object({ kind: z.string(), model: z.string() }).nullable(),
	indexes: z.array(KnowledgeIndex),
	/** The last rebuild through the control plane since this site started; null when none. */
	lastIngest: LastIngest.nullable(),
	error: z.string().optional(),
});
export type KnowledgeStatus = z.infer<typeof KnowledgeStatus>;

export const SiteStatus = z.object({
	brand: SiteSchema,
	startedAt: z.string().datetime(),
	guide: z.object({
		state: PartState,
		model: z.string().nullable(),
		/** An OpenRouter key is configured (its value never leaves the site). */
		hasKey: z.boolean(),
		screeningLevel: z.enum(["standard", "strict"]).nullable(),
		/** Today (UTC), in this process: questions asked, and refused for lack of content. */
		today: z.object({ asked: z.number().int(), unanswered: z.number().int() }),
	}),
	knowledge: KnowledgeStatus,
	scheduling: z.object({ state: PartState, reason: z.string().optional() }),
	accounts: z.object({
		state: PartState,
		storage: z.string().nullable(),
		missing: z.array(z.string()),
	}),
	push: z.object({
		state: PartState,
		storage: z.string().nullable(),
		reason: z.string().optional(),
	}),
});
export type SiteStatus = z.infer<typeof SiteStatus>;

/** The brand's guide as Mastra registered it: what Studio shows, summarised. */
export const AgentInfo = z.object({
	id: z.string(),
	name: z.string(),
	model: z.string(),
	hasKey: z.boolean(),
	/** The instructions' first lines (the voice), and their full length. */
	instructionsSummary: z.string(),
	instructionsLength: z.number().int().nonnegative(),
	tools: z.array(z.object({ id: z.string(), description: z.string() })),
	locales: z.array(z.string()),
	screeningLevel: z.enum(["standard", "strict"]),
	scheduling: z.boolean(),
	workflows: z.array(z.string()),
});
export type AgentInfo = z.infer<typeof AgentInfo>;

/** POST /__control/guide/ingest: the brand's knowledge entries from the CMS, published only. */
export const IngestRequest = z.object({
	/** Entries in @psi/knowledge's shape (published, approved), as the CMS plans them. */
	entries: z.array(z.record(z.unknown())).max(5000),
	/** Knowledge ids no longer published or approved (withdrawn locales, unpublished entries). */
	remove: z.array(z.string().min(1).max(200)).max(20_000),
	/** Also the repository's seed entries for this brand. */
	includeSeed: z.boolean(),
});
export type IngestRequest = z.infer<typeof IngestRequest>;

export const IngestResult = z.discriminatedUnion("ok", [
	z.object({
		ok: z.literal(true),
		workflow: z.string(),
		runId: z.string(),
		indexed: z.number().int(),
		removed: z.number().int(),
		skipped: z.number().int(),
		chunks: z.number().int(),
		embedder: z.string(),
		store: z.string(),
	}),
	z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type IngestResult = z.infer<typeof IngestResult>;

/** POST /__control/guide/ask: a staff test question (never stored, never counted). */
export const TestQuestion = z.object({
	question: z.string().trim().min(3).max(500),
	locale: z.enum(["ro", "en"]),
});
export type TestQuestion = z.infer<typeof TestQuestion>;

/** One line of the test answer's NDJSON stream. */
export const TestAnswerLine = z.discriminatedUnion("type", [
	z.object({ type: z.literal("text"), text: z.string() }),
	z.object({
		type: z.literal("sources"),
		sources: z.array(z.object({ title: z.string(), url: z.string() })),
	}),
	z.object({ type: z.literal("refusal"), reason: z.string() }),
	z.object({ type: z.literal("done") }),
]);
export type TestAnswerLine = z.infer<typeof TestAnswerLine>;

export const PushStats = z.object({
	state: PartState,
	/** Subscriptions held by this site's worker, by purpose (topic). */
	byTopic: z.array(z.object({ topic: z.string(), subscribers: z.number().int() })),
	total: z.number().int(),
	signedIn: z.number().int(),
	/** Subscriptions whose last send failed (they are dropped at the fifth failure). */
	failing: z.number().int(),
	/** Articles announced (one push per article, ever). */
	announced: z.number().int(),
	reason: z.string().optional(),
});
export type PushStats = z.infer<typeof PushStats>;

/** POST /__control/push/test: to every device of the acting staff member's own account. */
export const PushTestRequest = z.object({ subject: z.string().min(1).max(200) });
export const PushTestResult = z.object({
	recipients: z.number().int(),
	sent: z.number().int(),
	failed: z.number().int(),
});
export type PushTestResult = z.infer<typeof PushTestResult>;

export const AccountSearch = z.object({ email: z.string().trim().toLowerCase().email().max(320) });
export const AccountHit = z.object({
	subject: z.string(),
	email: z.string().nullable(),
	name: z.string().nullable(),
	createdAt: z.string().datetime(),
	lastSeenAt: z.string().datetime(),
});
export type AccountHit = z.infer<typeof AccountHit>;
export const AccountHits = z.object({ accounts: z.array(AccountHit) });

export const AccountRef = z.object({ subject: z.string().min(1).max(200) });

/** One person, as a privacy officer sees them: no conversation text, nothing clinical. */
export const PersonView = z.object({
	account: AccountHit,
	consents: z.array(
		z.object({
			purpose: z.string(),
			wordingVersion: z.string(),
			grantedAt: z.string().datetime(),
			withdrawnAt: z.string().datetime().nullable(),
		}),
	),
	savedArticles: z.array(z.object({ slug: z.string(), savedAt: z.string().datetime() })),
	/** Reservations without contact details or practitioner notes: reference, status, time. */
	reservations: z.union([
		z.array(
			z.object({
				reference: z.string(),
				status: z.string(),
				mode: z.string(),
				start: z.string().datetime(),
			}),
		),
		z.literal("unavailable"),
		z.literal("not_applicable"),
	]),
	/** How many remembered guide conversations exist (their text is never shown here). */
	conversations: z.number().int(),
});
export type PersonView = z.infer<typeof PersonView>;

export const EraseResult = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), sessionsEnded: z.number().int() }),
	z.object({ ok: z.literal(false), reason: z.enum(["not_found", "unavailable"]) }),
]);
export type EraseResult = z.infer<typeof EraseResult>;

/** Site → CMS: may this signed-in person see the "Administrare" link? */
export const StaffQuery = z.object({
	subject: z.string().min(1).max(200),
	email: z.string().email().max(320).nullable(),
});
export const StaffAnswer = z.object({ staff: z.boolean() });
