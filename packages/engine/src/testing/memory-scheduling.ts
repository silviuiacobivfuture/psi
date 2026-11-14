import type {
	PauseNotice,
	SchedulingCancel,
	SchedulingContact,
	SchedulingHold,
	SchedulingPort,
	SchedulingSearch,
	SchedulingSlot,
	SchedulingSlots,
	SchedulingSubmit,
} from "../scheduling/port";

/** One call the scheduling tools made, as the store saw it. */
export type SchedulingCall =
	| { method: "findSlots"; search: SchedulingSearch }
	| { method: "cancel"; reference: string }
	| { method: "hold"; tenant: string; service: string; slotId: string; locale: "ro" | "en" }
	| {
			method: "submit";
			reference: string;
			contact: SchedulingContact;
			audience?: "child" | "teen" | "adult";
	  }
	| { method: "release"; reference: string };

/**
 * A scheduling store in memory, for tests of the tools and the engine's wiring: a fixed list of
 * free slots per tenant and service, holds that take a slot out of the free list, requests that
 * can be cancelled with their code. Every call is recorded, so a test sees what the engine did.
 */
export class MemorySchedulingStore implements SchedulingPort {
	readonly calls: SchedulingCall[] = [];
	/** Set to make the store answer `catalogue` (the live services list). */
	catalogue?: SchedulingPort["catalogue"];
	/** Set to make the store say online booking is paused for the organisation or the site. */
	pause?: SchedulingPort["pause"];
	/** Set to make `findSlots` answer as the scheduling service does while a pause covers the service. */
	slotsPaused: PauseNotice | undefined;
	failing = false;
	/** Set to make `submit` throw (the store went down after the hold). */
	submitFailing = false;
	/** Set to make `hold` answer as the store does for a time somebody else took. */
	holdRefusal: "slot_taken" | undefined;
	private readonly holds = new Map<
		string,
		{ token: string; tenant: string; service: string; slot: SchedulingSlot }
	>();
	private sequence = 0;
	private readonly free = new Map<string, SchedulingSlot[]>();
	private readonly requests = new Map<
		string,
		{ code: string; start: number; cancelled: boolean }
	>();

	constructor(readonly timeZone = "Europe/Bucharest") {}

	offer(tenant: string, service: string, slots: ReadonlyArray<SchedulingSlot>): this {
		this.free.set(`${tenant}/${service}`, [...slots]);
		return this;
	}

	take(tenant: string, service: string, id: string): void {
		const key = `${tenant}/${service}`;
		this.free.set(
			key,
			(this.free.get(key) ?? []).filter((slot) => slot.id !== id),
		);
	}

	addRequest(reference: string, code: string, start: number): this {
		this.requests.set(reference, { code, start, cancelled: false });
		return this;
	}

	isCancelled(reference: string): boolean {
		return this.requests.get(reference)?.cancelled === true;
	}

	async findSlots(search: SchedulingSearch): Promise<SchedulingSlots> {
		this.calls.push({ method: "findSlots", search });
		if (this.failing) throw new Error("store down");
		if (this.slotsPaused !== undefined)
			return { ok: false, reason: "paused", pause: this.slotsPaused };
		const slots = this.free.get(`${search.tenant}/${search.service}`);
		if (slots === undefined) return { ok: false, reason: "unknown_service" };
		const inRange = slots.filter(
			(slot) =>
				slot.start >= search.from &&
				slot.start < search.to &&
				(search.mode === undefined || slot.modes.includes(search.mode)),
		);
		return { ok: true, timeZone: this.timeZone, slots: inRange };
	}

	async hold(input: {
		tenant: string;
		service: string;
		slotId: string;
		locale: "ro" | "en";
	}): Promise<SchedulingHold> {
		this.calls.push({ method: "hold", ...input });
		if (this.failing) throw new Error("store down");
		if (this.holdRefusal !== undefined) return { ok: false, reason: this.holdRefusal };
		const slot = (this.free.get(`${input.tenant}/${input.service}`) ?? []).find(
			(s) => s.id === input.slotId,
		);
		if (slot === undefined) return { ok: false, reason: "slot_taken" };
		this.take(input.tenant, input.service, input.slotId);
		this.sequence += 1;
		const reference = `REF${String(this.sequence).padStart(5, "0")}`;
		const token = `hold-token-${this.sequence}-abcdefghij`;
		this.holds.set(reference, { token, tenant: input.tenant, service: input.service, slot });
		return {
			ok: true,
			reference,
			holdToken: token,
			start: slot.start,
			practitionerName: slot.practitionerName,
			timeZone: this.timeZone,
		};
	}

	async submit(input: {
		reference: string;
		holdToken: string;
		contact: SchedulingContact;
		audience?: "child" | "teen" | "adult";
	}): Promise<SchedulingSubmit> {
		this.calls.push({ method: "submit", ...input });
		if (this.submitFailing) throw new Error("store down");
		const held = this.holds.get(input.reference);
		if (held === undefined || held.token !== input.holdToken)
			return { ok: false, reason: "not_found" };
		this.holds.delete(input.reference);
		const code = `cancel-code-${input.reference}-0123456789`;
		this.addRequest(input.reference, code, held.slot.start);
		return {
			ok: true,
			reference: input.reference,
			cancelCode: code,
			start: held.slot.start,
			timeZone: this.timeZone,
			mode: held.slot.modes[0] ?? "onsite",
		};
	}

	async release(input: { reference: string; holdToken: string }): Promise<{ ok: boolean }> {
		this.calls.push({ method: "release", reference: input.reference });
		const held = this.holds.get(input.reference);
		if (held === undefined || held.token !== input.holdToken) return { ok: false };
		this.holds.delete(input.reference);
		this.free.set(`${held.tenant}/${held.service}`, [
			...(this.free.get(`${held.tenant}/${held.service}`) ?? []),
			held.slot,
		]);
		return { ok: true };
	}

	/** The references currently held and not yet submitted. */
	heldReferences(): ReadonlyArray<string> {
		return [...this.holds.keys()];
	}

	/** The requests submitted so far, as the store stores them. */
	requested(): ReadonlyArray<string> {
		return [...this.requests.keys()];
	}

	async cancel(input: { reference: string; cancelCode: string }): Promise<SchedulingCancel> {
		this.calls.push({ method: "cancel", reference: input.reference });
		if (this.failing) throw new Error("store down");
		const found = this.requests.get(input.reference);
		if (found === undefined || found.code !== input.cancelCode)
			return { ok: false, reason: "not_found" };
		if (found.cancelled) return { ok: false, reason: "not_allowed" };
		found.cancelled = true;
		return { ok: true, start: found.start };
	}
}
