import { type FloorPlanDoc, FloorPlanDocSchema } from "@psi/ui/admin/floor-plan";
import type { ClinicPort } from "./port";
import type { AppSlug, AssistantMode, PushPrefs } from "./schema";
import type { AppData } from "./seed";
import { seedPlan } from "./seed-plan";

export interface FloorDeps {
	data: (app: AppSlug) => AppData;
	guard: (method: keyof ClinicPort) => void;
	log: (d: AppData, actor: string, action: string, target: string) => void;
}

/** The floor plan, the push preferences and the assistant's mode of the fake. */
export function createFakeFloorAndPrefs(
	deps: FloorDeps,
): Pick<
	ClinicPort,
	| "floorPlan"
	| "saveFloorPlan"
	| "pushPrefs"
	| "savePushPrefs"
	| "assistantMode"
	| "saveAssistantMode"
> {
	const { data, guard, log } = deps;
	const prefs = new Map<string, PushPrefs>();
	const modes = new Map<string, AssistantMode>();
	const plans = new Map<AppSlug, FloorPlanDoc>();
	return {
		async floorPlan(app) {
			guard("floorPlan");
			return { doc: plans.get(app) ?? seedPlan(app), writable: true };
		},
		async saveFloorPlan(app, raw) {
			guard("saveFloorPlan");
			const parsed = FloorPlanDocSchema.safeParse(raw);
			if (!parsed.success) return { ok: false, reason: "invalid" };
			const held = plans.get(app) ?? seedPlan(app);
			if (parsed.data.revision !== held.revision) return { ok: false, reason: "stale" };
			const doc = { ...parsed.data, revision: held.revision + 1 };
			plans.set(app, doc);
			log(data(app), "console", "floor-plan.save", `revision ${doc.revision}`);
			return { ok: true, doc };
		},
		async pushPrefs(subject) {
			guard("pushPrefs");
			return prefs.get(subject) ?? { requests: false, reminders: false };
		},
		async savePushPrefs(subject, p) {
			guard("savePushPrefs");
			prefs.set(subject, p);
		},
		async assistantMode(subject) {
			guard("assistantMode");
			return modes.get(subject) ?? null;
		},
		async saveAssistantMode(subject, mode) {
			guard("saveAssistantMode");
			modes.set(subject, mode);
		},
	};
}
