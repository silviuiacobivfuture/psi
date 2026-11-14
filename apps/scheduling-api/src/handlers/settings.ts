import {
	DEFAULT_SETTINGS,
	MySettings,
	type MySettingsType,
	type RouteSpec,
} from "@psi/scheduling-sdk/contract";
import type { Ctx, HandlersOf } from "../http/context";
import type { StorePort } from "../store/types";

/**
 * A person's stored settings, or the defaults while they saved none. A stored body the contract no longer reads (a
 * field renamed in a later release) is answered as the defaults too, and the next save replaces it.
 */
export async function settingsOf(
	store: StorePort,
	app: string,
	subject: string,
): Promise<{ settings: MySettingsType; updatedAt?: number }> {
	const held = await store.settings.get(app, subject);
	if (held === undefined) return { settings: DEFAULT_SETTINGS };
	let raw: unknown;
	try {
		raw = JSON.parse(held.body);
	} catch {
		return { settings: DEFAULT_SETTINGS };
	}
	const parsed = MySettings.safeParse(raw);
	return parsed.success
		? { settings: parsed.data, updatedAt: held.updatedAt }
		: { settings: DEFAULT_SETTINGS };
}

const answer = (s: { settings: MySettingsType; updatedAt?: number }) => ({
	...s.settings,
	stored: s.updatedAt !== undefined,
	...(s.updatedAt === undefined ? {} : { updatedAt: s.updatedAt }),
});

/** Which settings moved: names only, for the journal. */
function changed(before: MySettingsType, after: MySettingsType): string[] {
	return (Object.keys(after) as (keyof MySettingsType)[]).filter(
		(k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
	);
}

type C = Ctx<RouteSpec>;
const own = (ctx: C): string => ctx.subject;

export const settingsHandlers: HandlersOf<"me.settings" | "me.saveSettings"> = {
	async "me.settings"(ctx) {
		return answer(await settingsOf(ctx.deps.store, ctx.app, own(ctx)));
	},
	async "me.saveSettings"(ctx) {
		const held = await settingsOf(ctx.deps.store, ctx.app, own(ctx));
		const next = MySettings.parse(ctx.body);
		const fields = changed(held.settings, next);
		// The same settings again: nothing written, nothing recorded (a first save of the defaults still stores them).
		if (fields.length === 0 && held.updatedAt !== undefined) {
			ctx.unchanged();
			return answer(held);
		}
		const saved = await ctx.deps.store.settings.put(ctx.app, own(ctx), JSON.stringify(next));
		ctx.auditTarget(own(ctx));
		ctx.note({ fields });
		return answer({ settings: next, updatedAt: saved.updatedAt });
	},
};
