import { z } from "zod";
import { api } from "../convex/_generated/api";
import { type CallbackRequester, callbackRequesterOn } from "./callbacks-client";
import type { SchedulingConfig } from "./config";
import type { Audience, Mode } from "./domain/catalog";
import { type Contact, cleanContact, contactProblem } from "./domain/contact";
import { canonicalCode, makeReference, makeToken } from "./domain/tokens";
import {
	LocaleSchema,
	ModeSchema,
	RawCancelSchema,
	RawHoldSchema,
	RawReleaseSchema,
	RawServicesSchema,
	RawSlotsSchema,
	RawSubmitSchema,
} from "./results";
import { encodeSlot } from "./slot-id";
import { createTransport, sha256, type Transport } from "./transport";

/** A free slot, as an app or a tool shows it. `id` is what a form or a tool sends back. */
export interface OfferedSlot {
	id: string;
	practitioner: string;
	practitionerName: string;
	start: number;
	end: number;
	modes: ReadonlyArray<Mode>;
}

export type SlotsResult =
	| {
			ok: true;
			timeZone: string;
			service: { slug: string; durationMinutes: number; holdMinutes: number };
			slots: ReadonlyArray<OfferedSlot>;
	  }
	| { ok: false; reason: "unknown_service" };

export const SlotSearchSchema = z
	.object({
		tenant: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
		service: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
		from: z.number().int().nonnegative(),
		to: z.number().int().nonnegative(),
		mode: ModeSchema.optional(),
		limit: z.number().int().min(1).max(200).optional(),
		/** Defaults to the server's clock. */
		now: z.number().int().nonnegative().optional(),
	})
	.strict();
export type SlotSearch = z.infer<typeof SlotSearchSchema>;

export const HoldInputSchema = z
	.object({
		tenant: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
		service: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
		practitioner: z.string().regex(/^[a-z0-9]{10,64}$/),
		start: z.number().int().nonnegative(),
		mode: ModeSchema,
		locale: LocaleSchema,
		channel: z.enum(["form", "guide"]),
	})
	.strict();
export type HoldInput = z.infer<typeof HoldInputSchema>;

/** A hold: the slot is kept until `expiresAt`. `holdToken` goes into the confirm form, nowhere else. */
export type HoldResult =
	| {
			ok: true;
			reference: string;
			holdToken: string;
			start: number;
			end: number;
			mode: Mode;
			expiresAt: number;
			practitionerName: string;
			timeZone: string;
	  }
	| { ok: false; reason: "invalid" | "unknown_service" | "slot_taken" | "not_offered" };

export interface SubmitInput {
	reference: string;
	holdToken: string;
	contact: Contact;
	audience?: Audience;
	/** The signed-in visitor's `accountHashOf(subject)`; absent for an anonymous request. */
	accountHash?: string;
}

/** A request: `cancelCode` is shown to the visitor once and never stored in clear. */
export type SubmitResult =
	| {
			ok: true;
			reference: string;
			cancelCode: string;
			start: number;
			end: number;
			mode: Mode;
			timeZone: string;
	  }
	| {
			ok: false;
			/** `unavailable_online`: neutral on purpose; say "call us", never why. */
			reason: "invalid" | "not_found" | "hold_expired" | "not_allowed" | "unavailable_online";
	  };

export type ReleaseResult =
	| { ok: true }
	| { ok: false; reason: "not_found" | "hold_expired" | "not_allowed" };

export type CancelResult =
	| { ok: true; start: number }
	| { ok: false; reason: "not_found" | "hold_expired" | "not_allowed" };

export interface ServiceInfo {
	slug: string;
	/** The name the team gave it, in both languages (absent on services seeded before names). */
	name?: { ro: string; en: string };
	durationMinutes: number;
	modes: ReadonlyArray<Mode>;
	location?: string;
	practitioners: ReadonlyArray<{ id: string; name: string }>;
}

/** What a visitor-facing server does with the scheduling store. */
export interface SchedulingClient extends CallbackRequester {
	services(
		tenant: string,
	): Promise<{ timeZone: string; services: ReadonlyArray<ServiceInfo> } | undefined>;
	findSlots(search: SlotSearch): Promise<SlotsResult>;
	hold(input: HoldInput): Promise<HoldResult>;
	submit(input: SubmitInput): Promise<SubmitResult>;
	release(input: { reference: string; holdToken: string }): Promise<ReleaseResult>;
	cancel(input: { reference: string; cancelCode: string }): Promise<CancelResult>;
}

const ReferenceSchema = z.string().transform((value, ctx) => {
	const code = canonicalCode(value, 8);
	if (code === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "reference" });
	return code ?? "";
});

const SubmitInputSchema = z
	.object({
		reference: ReferenceSchema,
		holdToken: z.string().min(16).max(64),
		contact: z.object({
			name: z.string().max(200),
			email: z.string().max(200).optional(),
			phone: z.string().max(40).optional(),
		}),
		audience: z.enum(["child", "teen", "adult"]).optional(),
		accountHash: z
			.string()
			.regex(/^[0-9a-f]{64}$/)
			.optional(),
	})
	.strict();

/** Builds the visitor-side client. Every answer is parsed; a transport failure throws `SchedulingUnavailable`. */
export function createSchedulingClient(config: SchedulingConfig): SchedulingClient {
	return clientOn(createTransport(config));
}

export function clientOn(transport: Transport): SchedulingClient {
	const key = transport.serverKey;
	return {
		...callbackRequesterOn(transport),
		async services(tenant) {
			const raw = await transport.call(RawServicesSchema, (c) =>
				c.query(api.catalog.services, { key, tenant }),
			);
			return raw.ok ? { timeZone: raw.timeZone, services: raw.services } : undefined;
		},
		async findSlots(search) {
			const q = SlotSearchSchema.parse(search);
			const raw = await transport.call(RawSlotsSchema, (c) =>
				c.query(api.availability.slots, {
					key,
					tenant: q.tenant,
					service: q.service,
					from: q.from,
					to: q.to,
					now: q.now ?? Date.now(),
					...(q.mode === undefined ? {} : { mode: q.mode }),
					...(q.limit === undefined ? {} : { limit: q.limit }),
				}),
			);
			if (!raw.ok) return raw;
			return {
				ok: true,
				timeZone: raw.timeZone,
				service: {
					slug: raw.service.slug,
					durationMinutes: raw.service.durationMinutes,
					holdMinutes: raw.service.holdMinutes,
				},
				slots: raw.slots.flatMap((slot) =>
					slot.modes.map((mode) => ({
						id: encodeSlot({ practitioner: slot.practitioner, start: slot.start, mode }),
						practitioner: slot.practitioner,
						practitionerName: slot.practitionerName,
						start: slot.start,
						end: slot.end,
						modes: [mode],
					})),
				),
			};
		},
		async hold(input) {
			const h = HoldInputSchema.parse(input);
			// A reference collision (40 bits) is retried with a fresh one; twice in a row is a fault.
			for (let attempt = 0; attempt < 2; attempt += 1) {
				const reference = makeReference();
				const holdToken = makeToken();
				const raw = await transport.call(RawHoldSchema, (c) =>
					c.mutation(
						api.appointments.hold,
						{ key, ...h, reference, holdTokenHash: sha256(holdToken) },
						{ skipQueue: true },
					),
				);
				if (raw.ok) return { ...raw, holdToken };
				if (raw.reason !== "retry") return { ok: false, reason: raw.reason };
			}
			return { ok: false, reason: "invalid" };
		},
		async submit(input) {
			const parsed = SubmitInputSchema.safeParse(input);
			if (!parsed.success || contactProblem(parsed.data.contact) !== undefined) {
				return { ok: false, reason: "invalid" };
			}
			const s = parsed.data;
			const cancelCode = makeToken();
			const raw = await transport.call(RawSubmitSchema, (c) =>
				c.mutation(
					api.appointments.submit,
					{
						key,
						reference: s.reference,
						holdTokenHash: sha256(s.holdToken),
						cancelCodeHash: sha256(cancelCode),
						contact: cleanContact(s.contact),
						...(s.audience === undefined ? {} : { audience: s.audience }),
						...(s.accountHash === undefined ? {} : { accountHash: s.accountHash }),
					},
					{ skipQueue: true },
				),
			);
			if (!raw.ok) return raw;
			return {
				ok: true,
				reference: raw.reference,
				cancelCode,
				start: raw.start,
				end: raw.end,
				mode: raw.mode,
				timeZone: raw.timeZone,
			};
		},
		async release(input) {
			const reference = canonicalCode(input.reference, 8);
			if (reference === undefined) return { ok: false, reason: "not_found" };
			const raw = await transport.call(RawReleaseSchema, (c) =>
				c.mutation(
					api.appointments.release,
					{ key, reference, holdTokenHash: sha256(input.holdToken) },
					{ skipQueue: true },
				),
			);
			return raw.ok ? { ok: true } : raw;
		},
		async cancel(input) {
			const reference = canonicalCode(input.reference, 8);
			const code = canonicalCode(input.cancelCode, 16);
			if (reference === undefined || code === undefined) return { ok: false, reason: "not_found" };
			const raw = await transport.call(RawCancelSchema, (c) =>
				c.mutation(
					api.appointments.cancel,
					{ key, reference, cancelCodeHash: sha256(code) },
					{ skipQueue: true },
				),
			);
			return raw.ok ? { ok: true, start: raw.start } : raw;
		},
	};
}
