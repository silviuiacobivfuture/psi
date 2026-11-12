import { z } from "zod";
import { api } from "../convex/_generated/api";
import { canonicalCode } from "./domain/tokens";
import { ModeSchema, StatusSchema } from "./results";
import { sha256, type Transport } from "./transport";

/**
 * A signed-in person's own requests (`convex/account.ts`). The account is named only by its hash
 * (`accountHashOf`): the scheduling store never holds the subject, and does not depend on the CMS or
 * on the identity provider — the app decides who the person is and asks OpenFGA first.
 */

/** SHA-256 of `psi-account:` + the account's subject: what the scheduling store keys a person's requests by. */
export function accountHashOf(subject: string): string {
	return sha256(`psi-account:${subject}`);
}

export const OwnRequestSchema = z.object({
	reference: z.string(),
	tenant: z.string(),
	service: z.string(),
	practitionerName: z.string(),
	status: z.enum(["requested", "confirmed", "cancelled", "declined"]),
	mode: ModeSchema,
	start: z.number().int().nonnegative(),
	end: z.number().int().nonnegative(),
	channel: z.enum(["form", "guide", "staff"]),
	submittedAt: z.number().int().nonnegative(),
});
export type OwnRequest = z.infer<typeof OwnRequestSchema>;

const RawListSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), requests: z.array(OwnRequestSchema) }),
	z.object({ ok: z.literal(false), reason: z.literal("invalid") }),
]);
const RawCancelSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), status: StatusSchema, start: z.number() }),
	z.object({
		ok: z.literal(false),
		reason: z.enum(["not_found", "hold_expired", "not_allowed"]),
	}),
]);
const RawLinkSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), reference: z.string() }),
	z.object({ ok: z.literal(false), reason: z.literal("not_found") }),
]);
const RawUnlinkSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), unlinked: z.number().int().nonnegative() }),
	z.object({ ok: z.literal(false), reason: z.literal("invalid") }),
]);

export interface AccountSchedulingClient {
	/** Newest first; held and expired rows are not listed. */
	requests(accountHash: string): Promise<ReadonlyArray<OwnRequest>>;
	cancel(input: {
		reference: string;
		accountHash: string;
	}): Promise<{ ok: true } | { ok: false; reason: "not_found" | "hold_expired" | "not_allowed" }>;
	/** Proof of an anonymous request: its reference and the cancel code shown once. */
	link(input: {
		reference: string;
		cancelCode: string;
		accountHash: string;
	}): Promise<{ ok: true; reference: string } | { ok: false; reason: "not_found" }>;
	/** Erasure: the account's requests stay with the clinic, no longer tied to it. */
	unlink(accountHash: string): Promise<number>;
}

export function accountClientOn(transport: Transport): AccountSchedulingClient {
	const key = transport.serverKey;
	return {
		async requests(accountHash) {
			const raw = await transport.call(RawListSchema, (c) =>
				c.query(api.account.forAccount, { key, accountHash }),
			);
			return raw.ok ? raw.requests : [];
		},
		async cancel(input) {
			const reference = canonicalCode(input.reference, 8);
			if (reference === undefined) return { ok: false, reason: "not_found" };
			const raw = await transport.call(RawCancelSchema, (c) =>
				c.mutation(
					api.account.cancelForAccount,
					{ key, reference, accountHash: input.accountHash },
					{ skipQueue: true },
				),
			);
			return raw.ok ? { ok: true } : raw;
		},
		async link(input) {
			const reference = canonicalCode(input.reference, 8);
			const code = canonicalCode(input.cancelCode, 16);
			if (reference === undefined || code === undefined) return { ok: false, reason: "not_found" };
			return transport.call(RawLinkSchema, (c) =>
				c.mutation(
					api.account.link,
					{
						key,
						reference,
						cancelCodeHash: sha256(code),
						accountHash: input.accountHash,
					},
					{ skipQueue: true },
				),
			);
		},
		async unlink(accountHash) {
			const raw = await transport.call(RawUnlinkSchema, (c) =>
				c.mutation(api.account.unlink, { key, accountHash }, { skipQueue: true }),
			);
			return raw.ok ? raw.unlinked : 0;
		},
	};
}
