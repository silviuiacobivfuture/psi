import { z } from "zod";
import type { SettingsPort } from "../ports";
import { StoreRefused } from "../types";
import { Refusal, type Rpc } from "./rpc";

const Got = z.union([
	z.object({ ok: z.literal(true), found: z.literal(false) }),
	z.object({
		ok: z.literal(true),
		found: z.literal(true),
		body: z.string(),
		updatedAt: z.number(),
	}),
	Refusal,
]);
const Put = z.union([z.object({ ok: z.literal(true), updatedAt: z.number() }), Refusal]);

/** Each person's own settings over `apiMemberSettings`, one row per (app, subject). */
export function settingsPort(rpc: Rpc): SettingsPort {
	return {
		async get(app, subject) {
			const out = await rpc.query("apiMemberSettings:get", { tenant: app, subject }, Got);
			if (!out.ok) throw new StoreRefused(out.reason);
			return out.found ? { body: out.body, updatedAt: out.updatedAt } : undefined;
		},
		async put(app, subject, body) {
			const out = await rpc.mutation("apiMemberSettings:put", { tenant: app, subject, body }, Put);
			if (!out.ok) throw new StoreRefused(out.reason);
			return { updatedAt: out.updatedAt };
		},
	};
}
