import { foldName } from "./format";
import type { Resource, Service } from "./model";
import type { PortResult } from "./port";
import type { StaffSession } from "./session";

export type Resolved<T> =
	| { kind: "one"; value: T }
	| { kind: "many"; candidates: ReadonlyArray<T> }
	| { kind: "none" };

function pick<T extends { id: string; name: string }>(
	items: ReadonlyArray<T>,
	ref: string,
): Resolved<T> {
	const exactId = items.find((item) => item.id === ref);
	if (exactId !== undefined) return { kind: "one", value: exactId };
	const wanted = foldName(ref);
	if (wanted === "") return { kind: "none" };
	const exact = items.filter((item) => foldName(item.name) === wanted);
	if (exact.length === 1 && exact[0] !== undefined) return { kind: "one", value: exact[0] };
	const near = items.filter((item) => foldName(item.name).includes(wanted));
	if (near.length === 1 && near[0] !== undefined) return { kind: "one", value: near[0] };
	const candidates = exact.length > 1 ? exact : near;
	return candidates.length === 0
		? { kind: "none" }
		: { kind: "many", candidates: candidates.slice(0, 8) };
}

/** A person, room, device or group by id or by name (accents and case ignored). */
export async function resolveResource(
	session: StaffSession,
	ref: string,
): Promise<PortResult<Resolved<Resource>>> {
	const all = await session.port.resources();
	return all.ok ? { ok: true, value: pick(all.value, ref) } : all;
}

export async function resolveService(
	session: StaffSession,
	ref: string,
): Promise<PortResult<Resolved<Service>>> {
	const all = await session.port.services();
	return all.ok ? { ok: true, value: pick(all.value, ref) } : all;
}
