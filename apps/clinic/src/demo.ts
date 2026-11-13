import { DEV_SUBJECT } from "./auth";
import type { FakeOptions } from "./port/fake";

/**
 * The development clinic's people: the demo person owns Psizone, and three colleagues hold the other roles, so
 * "Vezi ca…" shows what a receptionist, a therapist and an accountant really see (all synthetic).
 */
export const DEMO_PEOPLE: Pick<FakeOptions, "members" | "names" | "platformAdmins"> = {
	platformAdmins: new Set([DEV_SUBJECT]),
	members: {
		[DEV_SUBJECT]: [
			{ app: "psizone", roles: ["owner"] },
			{ app: "hemisync", roles: ["reception"] },
		],
		"demo-reception-0002": [{ app: "psizone", roles: ["reception"] }],
		"demo-therapist-0003": [{ app: "psizone", roles: ["therapist"] }],
		"demo-accountant-0004": [{ app: "psizone", roles: ["accountant"] }],
	},
	names: {
		[DEV_SUBJECT]: "Demo Proprietar",
		"demo-reception-0002": "Ioana Recepție",
		"demo-therapist-0003": "Mihai Terapeut",
		"demo-accountant-0004": "Elena Contabil",
	},
};
