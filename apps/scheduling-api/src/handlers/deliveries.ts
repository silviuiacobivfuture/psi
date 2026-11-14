import { listDeliveries } from "../engagement/deliveries";
import type { HandlersOf } from "../http/context";

/** The delivery log of a UTC day, as the people who run the account read it. */
export const deliveryHandlers: HandlersOf<"notifications.deliveries"> = {
	async "notifications.deliveries"(ctx) {
		const day = ctx.query.day ?? new Date(ctx.now).toISOString().slice(0, 10);
		const steps = await listDeliveries(ctx.deps.store.keyed, ctx.app, day, ctx.query.status);
		return {
			items: steps.map((s) => ({
				event: s.event,
				audience: s.audience,
				to: s.to,
				...(s.ref === undefined ? {} : { ref: s.ref }),
				status: s.status,
				channels: s.channels,
				...(s.why === undefined ? {} : { why: s.why }),
				attempts: s.attempts,
				...(s.httpStatus === undefined ? {} : { httpStatus: s.httpStatus }),
				at: s.at,
			})),
		};
	},
};
