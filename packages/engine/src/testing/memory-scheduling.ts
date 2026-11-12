import type {
	SchedulingCancel,
	SchedulingPort,
	SchedulingSearch,
	SchedulingSlot,
	SchedulingSlots,
} from "../scheduling/port";

/** One call the scheduling tools made, as the store saw it. */
export type SchedulingCall =
	| { method: "findSlots"; search: SchedulingSearch }
	| { method: "cancel"; reference: string };

/**
 * A scheduling store in memory, for tests of the tools and the engine's wiring: a fixed list of
 * free slots per tenant and service, and requests that can be cancelled with their code. It holds
 * the port's two methods only, so a test sees every call a tool makes.
 */
export class MemorySchedulingStore implements SchedulingPort {
	readonly calls: SchedulingCall[] = [];
	/** Set to make the store answer `catalogue` (the live services list). */
	catalogue?: SchedulingPort["catalogue"];
	failing = false;
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
