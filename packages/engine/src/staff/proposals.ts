import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { CardLine } from "./events";
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
export const ChangeSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("create_appointment"),
		clientId: IdSchema,
		serviceId: IdSchema,
		date: DateSchema,
		startMin: MinuteSchema,
		durationMin: z.number().int().positive(),
		resourceIds: z.array(IdSchema).min(1).max(10),
	}),
	z.object({
		kind: z.literal("move_appointment"),
		id: IdSchema,
		expectedVersion: VersionSchema,
		date: DateSchema,
		startMin: MinuteSchema,
		durationMin: z.number().int().positive(),
		resourceIds: z.array(IdSchema).min(1).max(10),
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
	z.object({
		kind: z.literal("send_reminders"),
		items: z
			.array(
				z.object({
					appointmentId: IdSchema,
					expectedVersion: VersionSchema,
					channel: z.enum(REMINDER_CHANNELS),
					text: z.string().min(1).max(2000),
					name: z.string().max(300),
				}),
			)
			.min(1)
			.max(25),
	}),
]);
export type Change = z.infer<typeof ChangeSchema>;

/** The permission a change needs: what `can` is asked before a proposal exists. */
export function actionOf(change: Change): StaffAction {
	switch (change.kind) {
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
		default: {
			const never: never = change;
			return never;
		}
	}
}

/** What a change touches, as ids: for the audit entry. */
export function subjectsOf(change: Change): ReadonlyArray<string> {
	switch (change.kind) {
		case "create_appointment":
			return [change.clientId];
		case "move_appointment":
		case "cancel_appointment":
		case "mark_attendance":
		case "handle_request":
			return [change.id];
		case "record_payment":
			return [change.clientId, change.packageId];
		case "request_leave":
			return [change.personId];
		case "send_reminders":
			return change.items.map((item) => item.appointmentId);
		default: {
			const never: never = change;
			return never;
		}
	}
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
