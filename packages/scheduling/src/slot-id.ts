import { z } from "zod";
import type { Mode } from "./domain/catalog";

/**
 * A slot as one opaque string, for a radio button's value or a tool's argument:
 * `<practitioner id>.<start ms>.<mode>`. It names a slot; it reserves nothing, and the hold
 * re-checks it from scratch.
 */
export interface SlotRef {
	practitioner: string;
	start: number;
	mode: Mode;
}

const SLOT_ID = /^([a-z0-9]{10,64})\.(\d{12,14})\.(onsite|online)$/;

export const SlotIdSchema = z.string().regex(SLOT_ID);

export function encodeSlot(slot: SlotRef): string {
	return `${slot.practitioner}.${slot.start}.${slot.mode}`;
}

/** The slot an id names, or undefined when it is not one. */
export function decodeSlot(id: string): SlotRef | undefined {
	const match = SLOT_ID.exec(id);
	if (match === null) return undefined;
	const [, practitioner, start, mode] = match;
	if (practitioner === undefined || start === undefined) return undefined;
	if (mode !== "onsite" && mode !== "online") return undefined;
	return { practitioner, start: Number(start), mode };
}
