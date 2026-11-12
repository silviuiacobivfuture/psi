import { describe, expect, it } from "vitest";
import { parseEnv } from "../env";
import { isReady, type SetupService, type SetupState, slugify, whyEmpty } from "./scheduling-model";
import { stateOf } from "./scheduling-setup";

const service = (over: Partial<SetupService> = {}): SetupService => ({
	id: "s1",
	slug: "evaluation",
	name: null,
	durationMinutes: 60,
	bufferMinutes: 0,
	stepMinutes: 30,
	minNoticeMinutes: 0,
	horizonDays: 60,
	holdMinutes: 10,
	modes: ["onsite"],
	practitioners: ["p1"],
	active: true,
	roomKind: null,
	roomEquipment: [],
	roomAudiences: [],
	...over,
});
const person = (over: Partial<SetupState["practitioners"][number]> = {}) => ({
	id: "p1",
	slug: "ana",
	name: "Ana",
	active: true,
	external: false,
	rooms: [],
	abAnchor: null,
	rules: [{ id: "r1", weekday: 1, start: 540, end: 780, modes: ["onsite" as const], dated: false }],
	exceptions: [],
	...over,
});
const state = (over: Partial<SetupState> = {}): SetupState => ({
	brand: "psizone",
	tenant: "psizone",
	exists: true,
	timeZone: "Europe/Bucharest",
	today: "2026-11-12",
	practitioners: [person()],
	services: [service()],
	rooms: [],
	...over,
});

describe("what a Scheduling setup lacks", () => {
	it("is empty on a production's first day: no tenant row, nothing offered", () => {
		const first = stateOf("psizone", "psizone", null, new Map(), Date.UTC(2026, 10, 12));
		expect(first).toMatchObject({
			exists: false,
			practitioners: [],
			services: [],
			today: "2026-11-12",
		});
		expect(isReady(first)).toBe(false);
	});
	it("is ready only with an active service, an active person and some hours", () => {
		expect(isReady(state())).toBe(true);
		expect(isReady(state({ services: [] }))).toBe(false);
		expect(isReady(state({ services: [service({ active: false })] }))).toBe(false);
		expect(isReady(state({ practitioners: [person({ active: false })] }))).toBe(false);
		expect(isReady(state({ practitioners: [person({ rules: [] })] }))).toBe(false);
		expect(isReady(state({ practitioners: [person({ rules: null })] }))).toBe(false);
	});
	it("names why a service shows no times", () => {
		const s = service();
		expect(whyEmpty(state(), service({ active: false }))).toBe("service_off");
		expect(whyEmpty(state(), service({ practitioners: [] }))).toBe("no_practitioner");
		expect(whyEmpty(state({ practitioners: [person({ active: false })] }), s)).toBe(
			"practitioner_off",
		);
		expect(whyEmpty(state({ practitioners: [person({ rules: [] })] }), s)).toBe("no_hours");
		expect(whyEmpty(state(), s)).toBe("none_in_window");
		const needsRoom = service({ modes: ["onsite"], roomKind: "neurofeedback" });
		expect(whyEmpty(state(), needsRoom)).toBe("no_room");
		const room = {
			id: "r1",
			slug: "nf",
			name: "NF",
			kind: "neurofeedback",
			capacity: 2,
			suits: ["child" as const],
			equipment: [],
			active: true,
			closures: [],
		};
		expect(whyEmpty(state({ rooms: [room] }), needsRoom)).toBe("none_in_window");
		expect(whyEmpty(state({ rooms: [{ ...room, active: false }] }), needsRoom)).toBe("no_room");
	});
});

describe("a name as a key", () => {
	it("is lowercase ASCII with hyphens, and always a valid slug", () => {
		expect(slugify("Ana Popescu")).toBe("ana-popescu");
		expect(slugify("Ștefan Țurcanu-Șerban")).toBe("stefan-turcanu-serban");
		expect(slugify("  Dr. Ion!! ")).toBe("dr-ion");
		for (const name of ["A", "!!!", "x".repeat(200), "ăîâ"]) {
			expect(slugify(name)).toMatch(/^[a-z0-9][a-z0-9-]{1,40}$/);
		}
	});
});

describe("the trial tenant override", () => {
	const base = {
		PAYLOAD_SECRET: "x".repeat(32),
		DATABASE_URI: "postgresql://u:p@cms-db-rw:5432/cms",
		SERVER_URL: "https://cms.psizone.ro",
		OIDC_ISSUER: "https://auth.psizone.ro/application/o/cms/",
		OIDC_CLIENT_ID: "c",
		OIDC_CLIENT_SECRET: "d",
		BREAKGLASS_EMAIL: "breakglass@psizone.ro",
		BREAKGLASS_PASSWORD: "y".repeat(16),
	};
	it("reads brand=tenant pairs and refuses anything else", () => {
		expect(
			parseEnv({ ...base, SCHEDULING_TENANT_OVERRIDES: "psizone=test-psizone-sched" })
				.SCHEDULING_TENANT_OVERRIDES,
		).toEqual({ psizone: "test-psizone-sched" });
		expect(parseEnv(base).SCHEDULING_TENANT_OVERRIDES).toEqual({});
		expect(() => parseEnv({ ...base, SCHEDULING_TENANT_OVERRIDES: "blog=x1" })).toThrow();
		expect(() => parseEnv({ ...base, SCHEDULING_TENANT_OVERRIDES: "psizone=Bad Name" })).toThrow();
	});
});
