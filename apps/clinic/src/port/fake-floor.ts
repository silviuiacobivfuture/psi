import { type FloorPlanDoc, FloorPlanDocSchema } from "@psi/ui/admin/floor-plan";
import type { ClinicPort } from "./port";
import { PortError } from "./port";
import type { AppSlug, AssistantMode } from "./schema";
import { DEFAULT_SETTINGS, type MySettings, MySettingsSchema } from "./schema-settings";
import type { AppData } from "./seed";
import { seedPlan } from "./seed-plan";

export interface FloorDeps {
	data: (app: AppSlug) => AppData;
	guard: (method: keyof ClinicPort) => void;
	log: (d: AppData, actor: string, action: string, target: string) => void;
}

/** The floor plan, each person's own settings and their assistant mode, in the fake. */
export function createFakeFloorAndPrefs(
	deps: FloorDeps,
): Pick<
	ClinicPort,
	| "floorPlan"
	| "saveFloorPlan"
	| "mySettings"
	| "saveMySettings"
	| "assistantMode"
	| "saveAssistantMode"
> {
	const { data, guard, log } = deps;
	const settings = new Map<string, MySettings>();
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
		async mySettings(app, subject) {
			guard("mySettings");
			const held = settings.get(`${app}|${subject}`);
			return held === undefined
				? { ...DEFAULT_SETTINGS, stored: false }
				: { ...held, stored: true };
		},
		async saveMySettings(app, subject, raw) {
			guard("saveMySettings");
			// Like the service: the contract decides what a set of settings may be.
			const parsed = MySettingsSchema.safeParse(raw);
			if (!parsed.success) throw new PortError("invalid", "settings");
			const key = `${app}|${subject}`;
			if (JSON.stringify(settings.get(key)) !== JSON.stringify(parsed.data)) {
				settings.set(key, parsed.data);
				log(data(app), subject, "settings.update", subject);
			}
			return { ...parsed.data, stored: true };
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
