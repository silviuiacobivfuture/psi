import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { CardLine } from "./events";
import { StaffPageSchema } from "./events";
import {
	BaniSchema,
	DateSchema,
	IdSchema,
	LEAVE_KINDS,
	MinuteSchema,
	PAYMENT_METHODS,
	REMINDER_CHANNELS,
	VersionSchema,
} from "./model";
import type { StaffAction } from "./port";

/**
 * A write the assistant has prepared and nobody has done. The model's write tools only ever make
 * one of these; the console's Confirm button (an HTTP route, never a tool) executes it. Each
 * change carries everything execution needs and the versions it was prepared against, so a
 * confirmation after anything changed is refused.
 */
/** A version the change was not prepared against: read fresh when it runs (a notice about a move made in the same batch). */
export const ANY_VERSION = "*";

/**
 * Inside one batch, the client a `create_client` step made, for the steps after it (an appointment
 * for a person who is not a client yet). It is no id the service knows: execution swaps it for the
 * real one, and it is never asked about, audited or shown.
 */
export const NEW_CLIENT = "$new-client";

const Where = {
	date: DateSchema,
	startMin: MinuteSchema,
	durationMin: z.number().int().positive(),
	resourceIds: z.array(IdSchema).min(1).max(10),
};

const StepSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("create_client"),
		name: z.string().trim().min(1).max(120),
		phone: z.string().trim().max(40).optional(),
		email: z.string().trim().max(200).optional(),
		guardian: z.string().trim().max(120).optional(),
		birthYear: z.number().int().min(1900).max(2100).optional(),
	}),
	/** An action of the console's registry, run as the person; it is listed again when it runs. */
	z.object({
		kind: z.literal("run_action"),
		actionId: z.string().min(3).max(80),
		params: z.record(z.string(), z.unknown()),
		page: StaffPageSchema.optional(),
	}),
	z.object({
		kind: z.literal("create_appointment"),
		clientId: z.union([IdSchema, z.literal(NEW_CLIENT)]),
		serviceId: IdSchema,
		...Where,
	}),
	z.object({
		kind: z.literal("move_appointment"),
		id: IdSchema,
		expectedVersion: VersionSchema,
		...Where,
		/** Where it was, so the move can be undone. */
		before: z.object({
			date: DateSchema,
			startMin: MinuteSchema,
			resourceIds: z.array(IdSchema).min(1).max(10),
		}),
	}),
	z.object({
		kind: z.literal("cancel_appointment"),
		id: IdSchema,
		expectedVersion: VersionSchema,
	}),
	z.object({
		kind: z.literal("mark_attendance"),
		id: IdSchema,
		expectedVersion: VersionSchema,
		status: z.enum(["attended", "no-show"]),
	}),
	z.object({
		kind: z.literal("record_payment"),
		clientId: IdSchema,
		packageId: IdSchema,
		expectedVersion: VersionSchema,
		amountBani: BaniSchema.positive(),
		method: z.enum(PAYMENT_METHODS),
	}),
	z.object({
		kind: z.literal("request_leave"),
		personId: IdSchema,
		from: DateSchema,
		to: DateSchema,
		leaveKind: z.enum(LEAVE_KINDS),
	}),
	z.object({
		kind: z.literal("handle_request"),
		id: IdSchema,
		expectedVersion: VersionSchema,
	}),
	/** Any other route of the scheduling service (the generated parity tools): run as the person, as given. */
	z.object({
		kind: z.literal("route_call"),
		routeId: z.string().min(3).max(80),
		input: z.record(z.string(), z.unknown()),
	}),
	z.object({
		kind: z.literal("send_reminders"),
		items: z
			.array(
				z.object({
					/** `appointment`: about one appointment; `payment`: about a balance (needs the client). */
					about: z.enum(["appointment", "payment"]),
					appointmentId: IdSchema.optional(),
					clientId: IdSchema.optional(),
					expectedVersion: VersionSchema,
					channel: z.enum(REMINDER_CHANNELS),
					text: z.string().min(1).max(2000),
					name: z.string().max(300),
				}),
			)
			.min(1)
			.max(40),
	}),
]);
export type Step = z.infer<typeof StepSchema>;

/** One change, or several that the person confirms together and that run in order. */
export const ChangeSchema = z.union([
	StepSchema,
	z.object({
		kind: z.literal("batch"),
		steps: z.array(StepSchema).min(1).max(60),
	}),
]);
export type Change = z.infer<typeof ChangeSchema>;

function actionOfStep(step: Step): StaffAction | undefined {
	switch (step.kind) {
		case "create_client":
			return "clients.create";
		case "create_appointment":
			return "appointments.create";
		case "move_appointment":
			return "appointments.move";
		case "cancel_appointment":
			return "appointments.cancel";
		case "mark_attendance":
			return "attendance.mark";
		case "record_payment":
			return "payments.record";
		case "request_leave":
			return "leave.request";
		case "handle_request":
			return "requests.handle";
		case "send_reminders":
			return "reminders.send";
		case "route_call":
		case "run_action":
			return undefined;
		default: {
			const never: never = step;
			return never;
		}
	}
}

/** The permissions a change needs, each asked before a proposal exists. */
export function actionsOf(change: Change): ReadonlyArray<StaffAction> {
	const steps = change.kind === "batch" ? change.steps : [change];
	return [...new Set(steps.flatMap((step) => actionOfStep(step) ?? []))];
}

function subjectsOfStep(step: Step): ReadonlyArray<string> {
	switch (step.kind) {
		case "create_client":
			return [];
		case "run_action":
			return [
				step.actionId,
				...Object.entries(step.params).flatMap(([key, value]) =>
					typeof value === "string" && /(^id$|Id$)/.test(key) ? [value.slice(0, 120)] : [],
				),
			];
		case "create_appointment":
			return step.clientId === NEW_CLIENT ? [] : [step.clientId];
		case "move_appointment":
		case "cancel_appointment":
		case "mark_attendance":
		case "handle_request":
			return [step.id];
		case "record_payment":
			return [step.clientId, step.packageId];
		case "request_leave":
			return [step.personId];
		case "send_reminders":
			return step.items.map((item) => item.appointmentId ?? item.clientId ?? "");
		case "route_call":
			return Object.entries(step.input).flatMap(([key, value]) =>
				typeof value === "string" && /(^id$|Id$|^subject$)/.test(key) ? [value.slice(0, 120)] : [],
			);
		default: {
			const never: never = step;
			return never;
		}
	}
}

/** What a change touches, as ids: for the audit entry (at most 50). */
export function subjectsOf(change: Change): ReadonlyArray<string> {
	const steps = change.kind === "batch" ? change.steps : [change];
	return [...new Set(steps.flatMap(subjectsOfStep))].slice(0, 50);
}

export interface Proposal {
	id: string;
	/** The person it was prepared for, and the app: only they can confirm it. */
	sub: string;
	appId: string;
	createdAt: number;
	expiresAt: number;
	change: Change;
	title: string;
	lines: ReadonlyArray<CardLine>;
	destructive: boolean;
	state: "open" | "running" | "done" | "dismissed";
}

export type ClaimResult =
	| { ok: true; proposal: Proposal }
	| { ok: false; reason: "unknown" | "expired" | "already_done" };

/**
 * Where proposals wait for their confirmation. The in-memory one fits one process; several
 * instances need a shared store honouring the same `claim` (atomic open to running).
 */
export interface ProposalStore {
	put(proposal: Proposal): void | Promise<void>;
	/** Moves an open proposal of this person to running, once. */
	claim(id: string, sub: string, appId: string, now: number): ClaimResult | Promise<ClaimResult>;
	/** Records how a claimed proposal ended. */
	finish(id: string, state: "done" | "dismissed"): void | Promise<void>;
	/** Discards an open proposal of this person. */
	dismiss(id: string, sub: string, appId: string): boolean | Promise<boolean>;
}

/** How long a proposal can be confirmed. */
export const PROPOSAL_TTL_MS = 10 * 60_000;
const MAX_PROPOSALS = 2_000;

export function newProposalId(): string {
	return `prop_${randomBytes(16).toString("hex")}`;
}

export function createMemoryProposalStore(): ProposalStore {
	const proposals = new Map<string, Proposal>();
	return {
		put(proposal) {
			if (proposals.size >= MAX_PROPOSALS) {
				const oldest = proposals.keys().next();
				if (!oldest.done) proposals.delete(oldest.value);
			}
			proposals.set(proposal.id, proposal);
		},
		claim(id, sub, appId, now) {
			const found = proposals.get(id);
			if (found === undefined || found.sub !== sub || found.appId !== appId) {
				return { ok: false, reason: "unknown" };
			}
			if (found.state !== "open") return { ok: false, reason: "already_done" };
			if (now >= found.expiresAt) {
				proposals.delete(id);
				return { ok: false, reason: "expired" };
			}
			found.state = "running";
			return { ok: true, proposal: found };
		},
		finish(id, state) {
			const found = proposals.get(id);
			if (found !== undefined) found.state = state;
		},
		dismiss(id, sub, appId) {
			const found = proposals.get(id);
			if (found === undefined || found.sub !== sub || found.appId !== appId) return false;
			if (found.state !== "open") return false;
			found.state = "dismissed";
			return true;
		},
	};
}
