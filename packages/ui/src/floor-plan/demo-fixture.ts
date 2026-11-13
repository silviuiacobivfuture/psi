import type { FloorPlanLabels } from "./labels";
import { FLOOR_PLAN_LABELS } from "./labels-dictionary";
import type { LiveData } from "./live-types";
import type { FloorPlanDoc } from "./schema";
import { dayStart } from "./zone";

/** A small synthetic clinic for tests: two rooms, one device, a clash, with a client whose initials must stay hidden. */
export const TZ = "Europe/Bucharest";
export const DAY = "2026-11-13";
export const H = 3_600_000;
export const t0 = dayStart(DAY, TZ);
export const labels: FloorPlanLabels = FLOOR_PLAN_LABELS.ro;

export const doc: FloorPlanDoc = {
	version: 1,
	revision: 0,
	width: 200,
	height: 120,
	northDeg: 0,
	floors: [
		{
			id: "f1",
			name: "Parter",
			shapes: [
				{
					id: "a",
					kind: "room",
					label: "",
					roomId: "nfb-1",
					geometry: { type: "rect", x: 10, y: 10, w: 50, h: 40 },
				},
				{
					id: "b",
					kind: "room",
					label: "",
					roomId: "psih-1",
					geometry: { type: "rect", x: 60, y: 10, w: 50, h: 40 },
				},
				{
					id: "c",
					kind: "space",
					label: "",
					spaceType: "corridor",
					geometry: { type: "rect", x: 10, y: 50, w: 100, h: 15 },
				},
				{
					id: "d",
					kind: "device",
					label: "",
					at: { x: 30, y: 30 },
					rotation: 0,
					deviceType: "nfb-amplifier",
					deviceId: "amp-1",
				},
			],
		},
	],
};

export const rooms = [
	{ id: "nfb-1", name: "NFB 1", capacity: 2 },
	{ id: "psih-1", name: "Cabinet Psihoterapie 1", capacity: 3 },
];

export const data: LiveData = {
	rooms: rooms.map((r) => ({ ...r, kind: "x", equipment: [], closures: [] })),
	bookings: [
		{
			id: "b1",
			roomId: "nfb-1",
			start: t0 + 10 * H,
			until: t0 + 11 * H,
			status: "confirmed",
			practitioner: { name: "Ana Pop", monogram: "AP" },
			service: "Neurofeedback",
			people: 1,
			shared: false,
			clientInitials: ["ZQ"],
			deviceIds: ["amp-1"],
		},
		{
			id: "b2",
			roomId: "psih-1",
			start: t0 + 10 * H,
			until: t0 + 11 * H,
			status: "confirmed",
			practitioner: { name: "Mihai Ion", monogram: "MI" },
			service: "Psihoterapie",
			people: 1,
			shared: false,
			clientInitials: ["WX"],
			deviceIds: [],
		},
		{
			id: "b3",
			roomId: "psih-1",
			start: t0 + 10.5 * H,
			until: t0 + 11.5 * H,
			status: "confirmed",
			practitioner: { name: "Elena V", monogram: "EV" },
			service: "Psihoterapie",
			people: 1,
			shared: false,
			clientInitials: ["YY"],
			deviceIds: [],
		},
	],
	devices: [{ id: "amp-1", name: "Amp 1" }],
};
