import { z } from "zod";
import { currentActor } from "../actor";
import { StoreRefused, StoreUnavailable } from "../types";
import { Refusal, type Rpc } from "./rpc";

/** The acting subject in the shape every wrapper takes. */
export const actorArg = (): { subject: string } => ({ subject: currentActor() });

const Success = z.object({ ok: z.literal(true) });

/**
 * A wrapper call whose success shape is given: a refusal (`{ok:false, reason}`) becomes a `StoreRefused` carrying the
 * wrapper's reason; anything that is neither it nor the shape is `StoreUnavailable`. The success value keeps its type.
 */
export function caller(rpc: Rpc) {
	async function unwrap<S extends z.ZodRawShape>(raw: unknown, fn: string, shape: S) {
		const refused = Refusal.safeParse(raw);
		if (refused.success) throw new StoreRefused(refused.data.reason);
		const ok = Success.and(z.object(shape)).safeParse(raw);
		if (!ok.success) throw new StoreUnavailable(`${fn}: the store answered an unexpected shape`);
		return ok.data;
	}
	return {
		async query<S extends z.ZodRawShape>(
			fn: string,
			args: Readonly<Record<string, unknown>>,
			shape: S,
		) {
			return unwrap(await rpc.query(fn, args, z.unknown()), fn, shape);
		},
		async mutate<S extends z.ZodRawShape>(
			fn: string,
			args: Readonly<Record<string, unknown>>,
			shape: S,
		) {
			return unwrap(await rpc.mutation(fn, args, z.unknown()), fn, shape);
		},
	};
}
export type Caller = ReturnType<typeof caller>;
