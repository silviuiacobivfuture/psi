import { z } from "zod";
import { emailKey } from "../domain/clients";
import { normalizedIdentifiers, normalizeName, normalizePhone } from "./identifiers";

/**
 * The blacklist ("with reason"), per app. An entry names who it is about by a client record
 * and/or a phone (E.164) and/or an e-mail (lower-cased), optionally with a name for the people
 * reading the list; a name alone never matches (two people share a name). It carries WHY (free
 * text, staff-only, never shown to a visitor), a category, and how hard it bites:
 *   warn         staff see a banner and acknowledge it; online booking is allowed;
 *   block_online web and chat bookings and requests are refused, neutrally; staff may book with
 *                an override and a reason;
 *   block_all    even staff are refused, unless the elevated (admin) override is used.
 * Everything here is pure: the store loads the entries, these functions decide.
 */

export const BLACKLIST_CATEGORIES = [
	"no_show_repeated",
	"unpaid",
	"abusive",
	"duplicate",
	"other",
] as const;
export type BlacklistCategory = (typeof BLACKLIST_CATEGORIES)[number];

export const BLACKLIST_SEVERITIES = ["warn", "block_online", "block_all"] as const;
export type BlacklistSeverity = (typeof BLACKLIST_SEVERITIES)[number];

export const REASON_MAX = 2_000;
export const OVERRIDE_REASON_MAX = 500;
export const NAME_MAX = 120;
/** The most active entries one app keeps: matching reads them all in one transaction. */
export const MAX_ACTIVE_ENTRIES = 2_000;

const SEVERITY_RANK: Readonly<Record<BlacklistSeverity, number>> = {
	warn: 1,
	block_online: 2,
	block_all: 3,
};

export function severityRank(severity: BlacklistSeverity): number {
	return SEVERITY_RANK[severity];
}

const reasonSchema = z.string().trim().min(1).max(REASON_MAX);
const phoneSchema = z
	.string()
	.trim()
	.transform((text, ctx) => {
		const phone = normalizePhone(text);
		if (phone === undefined) ctx.addIssue({ code: "custom", message: "phone" });
		return phone ?? "";
	});
const emailSchema = z
	.string()
	.trim()
	.transform((text, ctx) => {
		const email = emailKey(text);
		if (email === undefined) ctx.addIssue({ code: "custom", message: "email" });
		return email ?? "";
	});

const FIELDS = {
	/** The client record it is about (the store's id). */
	client: z.string().min(1).max(100).optional(),
	phone: phoneSchema.optional(),
	email: emailSchema.optional(),
	name: z.string().trim().min(1).max(NAME_MAX).optional(),
	reason: reasonSchema,
	category: z.enum(BLACKLIST_CATEGORIES),
	severity: z.enum(BLACKLIST_SEVERITIES),
	/** An instant; from then on the entry no longer applies. Absent: until switched off. */
	expiresAt: z.number().int().positive().optional(),
};

/** What a caller gives to flag someone; phone and e-mail come out normalised. */
export const blacklistInputSchema = z
	.object(FIELDS)
	.refine((e) => e.client !== undefined || e.phone !== undefined || e.email !== undefined, {
		message: "identifier",
		path: ["client"],
	});
export type BlacklistInput = z.infer<typeof blacklistInputSchema>;

/** Fields an edit may take away. */
export const CLEARABLE_FIELDS = ["client", "phone", "email", "name", "expiresAt"] as const;
export type ClearableField = (typeof CLEARABLE_FIELDS)[number];

/** An edit: any of the fields, normalised the same way, and the switch. */
export const blacklistPatchSchema = z
	.object({
		...FIELDS,
		reason: reasonSchema.optional(),
		category: FIELDS.category.optional(),
		severity: FIELDS.severity.optional(),
		active: z.boolean().optional(),
	})
	.strict();
export type BlacklistPatch = z.infer<typeof blacklistPatchSchema>;

/** A stored entry, as the matching needs it (phone and e-mail already normalised). */
export interface BlacklistEntry {
	id: string;
	client?: string;
	phone?: string;
	email?: string;
	name?: string;
	reason: string;
	category: BlacklistCategory;
	severity: BlacklistSeverity;
	active: boolean;
	expiresAt?: number;
	createdAt: number;
}

/** Who is booking, as the path knows them: a client record and/or what they typed or have on file. */
export interface BlacklistCandidate {
	/** Client records the candidate is: a staff booking names one; an online one may match several by contact. */
	clients?: ReadonlyArray<string>;
	phones?: ReadonlyArray<string | undefined>;
	emails?: ReadonlyArray<string | undefined>;
	name?: string;
}

export const IDENTIFIERS = ["client", "phone", "email"] as const;
export type MatchedIdentifier = (typeof IDENTIFIERS)[number];

export interface BlacklistHit {
	entry: BlacklistEntry;
	/** Every identifier of the entry the candidate shares, strongest first. */
	matched: ReadonlyArray<MatchedIdentifier>;
	/** The strongest of them: client record, then phone, then e-mail. */
	via: MatchedIdentifier;
	/** True when the entry names the person and so does the candidate (informational only). */
	nameAgrees: boolean;
}

/** True when the entry applies at `now`: switched on and not past its expiry. */
export function applies(entry: BlacklistEntry, now: number): boolean {
	return entry.active && (entry.expiresAt === undefined || entry.expiresAt > now);
}

/**
 * The strongest entry that applies to the candidate, or undefined. Strongest: the harshest
 * severity; then the surest identifier (client record, phone, e-mail); then the newest entry,
 * then the smallest id, so the answer never depends on the order the store listed them in.
 */
export function blacklistMatch(
	candidate: BlacklistCandidate,
	entries: ReadonlyArray<BlacklistEntry>,
	now: number,
): BlacklistHit | undefined {
	const { phones, emails } = normalizedIdentifiers(candidate);
	const name = candidate.name === undefined ? undefined : normalizeName(candidate.name);
	let best: BlacklistHit | undefined;
	for (const entry of entries) {
		if (!applies(entry, now)) continue;
		const matched: MatchedIdentifier[] = [];
		if (entry.client !== undefined && candidate.clients?.includes(entry.client) === true)
			matched.push("client");
		if (entry.phone !== undefined && phones.includes(entry.phone)) matched.push("phone");
		if (entry.email !== undefined && emails.includes(entry.email)) matched.push("email");
		const via = matched[0];
		if (via === undefined) continue;
		const hit: BlacklistHit = {
			entry,
			matched,
			via,
			nameAgrees:
				entry.name !== undefined && name !== undefined && normalizeName(entry.name) === name,
		};
		if (best === undefined || stronger(hit, best)) best = hit;
	}
	return best;
}

function stronger(a: BlacklistHit, b: BlacklistHit): boolean {
	const bySeverity = severityRank(a.entry.severity) - severityRank(b.entry.severity);
	if (bySeverity !== 0) return bySeverity > 0;
	const byVia = IDENTIFIERS.indexOf(b.via) - IDENTIFIERS.indexOf(a.via);
	if (byVia !== 0) return byVia > 0;
	if (a.entry.createdAt !== b.entry.createdAt) return a.entry.createdAt > b.entry.createdAt;
	return a.entry.id < b.entry.id;
}

/** How much a staff override is worth: acknowledge a warning, override a block_online, override a block_all. */
export const OVERRIDE_AUTHORITIES = ["ack", "staff", "admin"] as const;
export type OverrideAuthority = (typeof OVERRIDE_AUTHORITIES)[number];

/** The authority an entry of this severity needs from staff who book anyway. */
export const AUTHORITY_NEEDED: Readonly<Record<BlacklistSeverity, OverrideAuthority>> = {
	warn: "ack",
	block_online: "staff",
	block_all: "admin",
};

/** The reason a staff member gives for booking anyway; required, short. */
export const overrideSchema = z.object({
	reason: z.string().trim().min(1).max(OVERRIDE_REASON_MAX),
	/** What the caller (the API, after checking the permission) vouches the person may do. */
	authority: z.enum(OVERRIDE_AUTHORITIES),
});
export type Override = z.infer<typeof overrideSchema>;

export type Channel = "online" | "staff";

export type GateOutcome =
	| { outcome: "allow" }
	/** Online and refused: neutral to the visitor, recorded for the team. */
	| { outcome: "unavailable_online"; hit: BlacklistHit }
	/** Staff, a warn entry, not acknowledged. */
	| { outcome: "warning"; hit: BlacklistHit; needs: OverrideAuthority }
	/** Staff, a blocking entry, no override or too weak a one. */
	| { outcome: "blocked"; hit: BlacklistHit; needs: OverrideAuthority }
	/** Staff, overridden with a reason that is stored. */
	| { outcome: "overridden"; hit: BlacklistHit; override: Override };

/**
 * What the booking path does with a hit. Online: warn is allowed; the two blocking severities
 * refuse. Staff: nothing proceeds past a hit without an override at least as strong as the entry
 * needs and a reason. A weak override on a block says `blocked` (not `warning`).
 */
export function blacklistGate(
	channel: Channel,
	hit: BlacklistHit | undefined,
	override?: Override,
): GateOutcome {
	if (hit === undefined) return { outcome: "allow" };
	const severity = hit.entry.severity;
	if (channel === "online") {
		return severity === "warn" ? { outcome: "allow" } : { outcome: "unavailable_online", hit };
	}
	const needs = AUTHORITY_NEEDED[severity];
	const parsed = override === undefined ? undefined : overrideSchema.safeParse(override);
	if (parsed?.success !== true) {
		return severity === "warn"
			? { outcome: "warning", hit, needs }
			: { outcome: "blocked", hit, needs };
	}
	if (OVERRIDE_AUTHORITIES.indexOf(parsed.data.authority) < OVERRIDE_AUTHORITIES.indexOf(needs)) {
		return { outcome: "blocked", hit, needs };
	}
	return { outcome: "overridden", hit, override: parsed.data };
}

/** Whether the person may create or raise an entry at this severity: warn_only callers may not exceed warn. */
export function severityAllowed(severity: BlacklistSeverity, limit: "any" | "warn_only"): boolean {
	return limit === "any" || severity === "warn";
}
