import { z } from "zod/v4";
import { Id, Money, Ms, Subject } from "./primitives";

const Stamps = { createdAt: Ms, updatedAt: Ms };
const Name = z.string().trim().min(1).max(200);

export const PaymentMethod = z.enum(["cash", "card", "transfer"]);

/**
 * A ledger line. `recordedBy` is who took the money (the signed-in person's subject, stamped by the service from the
 * token, never from the body); `recordedByName` is that person's name in the app's team, when they are still in it.
 */
export const Payment = z.object({
	id: Id,
	clientId: Id,
	packageId: Id.optional(),
	appointmentId: Id.optional(),
	amountCents: Money,
	method: PaymentMethod,
	paidAt: Ms,
	note: z.string().max(300).optional(),
	recordedBy: Subject,
	recordedByName: z.string().max(200).optional(),
	...Stamps,
});
export const PaymentCreate = z.object({
	amountCents: Money.min(1),
	method: PaymentMethod,
	paidAt: Ms.optional(),
	note: z.string().max(300).optional(),
});

/** The note on a package: free text for the desk, at most 1000 characters; empty means none. */
const PackageNote = z.string().trim().max(1000);

/** A package with its balances computed by the service, never typed in. */
export const Package = z.object({
	id: Id,
	clientId: Id,
	name: Name,
	// 0 is a package of bonus sessions only (the old app held some); a new one still needs at least one (PackageBase).
	sessions: z.number().int().min(0).max(500),
	bonus: z.number().int().min(0).max(100),
	used: z.number().int().min(0),
	priceCents: Money,
	discountCents: Money,
	totalCents: Money,
	paidCents: Money,
	remainingCents: z.number().int(),
	sessionsRemaining: z.number().int(),
	note: PackageNote.optional(),
	...Stamps,
});
const PackageBase = z.object({
	name: Name,
	sessions: z.number().int().min(1).max(500),
	bonus: z.number().int().min(0).max(100),
	priceCents: Money,
	discountCents: Money,
	note: PackageNote,
});
export const PackageCreate = PackageBase.extend({
	bonus: PackageBase.shape.bonus.default(0),
	discountCents: PackageBase.shape.discountCents.default(0),
	note: PackageBase.shape.note.optional(),
});
export const PackagePatch = PackageBase.partial();
