import {
	type FloorPlanDoc,
	type LiveData,
	LiveDataSchema,
	parsePlan,
	type StoreRoomInfo,
} from "@psi/ui/admin/floor-plan";

/** A synthetic clinic: seven rooms, reception, waiting room, corridor, toilets, storage. Nothing here is real. */

export const ROOMS: ReadonlyArray<StoreRoomInfo & { kind: string }> = [
	{ id: "nfb-1", name: "NFB 1", capacity: 2, kind: "neurofeedback" },
	{ id: "nfb-2", name: "NFB 2", capacity: 2, kind: "neurofeedback" },
	{ id: "psih-1", name: "Cabinet Psihoterapie 1", capacity: 3, kind: "therapy" },
	{ id: "psih-2", name: "Cabinet Psihoterapie 2", capacity: 3, kind: "therapy" },
	{ id: "terapie", name: "Cabinet Terapie", capacity: 3, kind: "therapy" },
	{ id: "grup", name: "Sală Grup / Hemi-Sync", capacity: 12, kind: "group" },
	{ id: "kineto", name: "Sală Kinetoterapie", capacity: 6, kind: "movement" },
];

export const DEVICES: ReadonlyArray<{ id: string; name: string; roomId: string }> = [
	{ id: "amp-1", name: "Amplificator NFB 1", roomId: "nfb-1" },
	{ id: "amp-2", name: "Amplificator NFB 2", roomId: "nfb-2" },
	{ id: "hs-1", name: "Căști Hemi-Sync 1", roomId: "grup" },
	{ id: "hs-2", name: "Căști Hemi-Sync 2", roomId: "grup" },
	{ id: "hs-3", name: "Căști Hemi-Sync 3", roomId: "grup" },
	{ id: "mat-1", name: "Saltea terapie 1", roomId: "kineto" },
];

const rect = (x: number, y: number, w: number, h: number) => ({
	type: "rect" as const,
	x,
	y,
	w,
	h,
});
const room = (id: string, roomId: string, g: ReturnType<typeof rect>) => ({
	id,
	kind: "room" as const,
	label: "",
	roomId,
	geometry: g,
});
const space = (
	id: string,
	spaceType: "reception" | "waiting" | "corridor" | "wc" | "storage",
	g: ReturnType<typeof rect>,
) => ({ id, kind: "space" as const, label: "", spaceType, geometry: g });
const door = (
	id: string,
	x: number,
	y: number,
	rotation: 0 | 90 | 180 | 270,
	swing: "left" | "right" = "left",
) => ({ id, kind: "door" as const, label: "", at: { x, y }, length: 9, rotation, swing });
const win = (id: string, x: number, y: number, rotation: 0 | 90 | 180 | 270) => ({
	id,
	kind: "window" as const,
	label: "",
	at: { x, y },
	length: 14,
	rotation,
});
const device = (
	id: string,
	deviceType: "nfb-amplifier" | "hemisync-headphones" | "therapy-mat",
	x: number,
	y: number,
	deviceId: string,
) => ({
	id,
	kind: "device" as const,
	label: "",
	at: { x, y },
	rotation: 0 as const,
	deviceType,
	deviceId,
});

export function seedPlan(): FloorPlanDoc {
	const parsed = parsePlan({
		version: 1,
		revision: 0,
		width: 240,
		height: 160,
		northDeg: 0,
		floors: [
			{
				id: "parter",
				name: "Parter",
				shapes: [
					space("receptie", "reception", rect(10, 10, 50, 50)),
					space("asteptare", "waiting", rect(60, 10, 50, 50)),
					room("r-nfb-1", "nfb-1", rect(110, 10, 40, 50)),
					room("r-nfb-2", "nfb-2", rect(150, 10, 40, 50)),
					space("wc", "wc", rect(190, 10, 20, 25)),
					space("depozit", "storage", rect(190, 35, 20, 25)),
					space("hol", "corridor", rect(10, 60, 200, 15)),
					room("r-psih-1", "psih-1", rect(10, 75, 38, 60)),
					room("r-psih-2", "psih-2", rect(48, 75, 38, 60)),
					room("r-terapie", "terapie", rect(86, 75, 34, 60)),
					room("r-grup", "grup", rect(120, 75, 50, 60)),
					{
						id: "r-kineto",
						kind: "room",
						label: "",
						roomId: "kineto",
						geometry: {
							type: "polygon",
							points: [
								{ x: 170, y: 75 },
								{ x: 210, y: 75 },
								{ x: 210, y: 135 },
								{ x: 180, y: 135 },
								{ x: 180, y: 100 },
								{ x: 170, y: 100 },
							],
						},
					},
					door("d-intrare", 35, 10, 0, "right"),
					door("d-asteptare", 85, 60, 0),
					door("d-nfb-1", 130, 60, 0),
					door("d-nfb-2", 170, 60, 0, "right"),
					door("d-psih-1", 29, 75, 0),
					door("d-psih-2", 67, 75, 0, "right"),
					door("d-terapie", 103, 75, 0),
					door("d-grup", 145, 75, 0, "right"),
					door("d-kineto", 195, 75, 0),
					win("w-1", 130, 10, 0),
					win("w-2", 170, 10, 0),
					win("w-3", 85, 10, 0),
					win("w-4", 29, 135, 0),
					win("w-5", 67, 135, 0),
					win("w-6", 145, 135, 0),
					win("w-7", 195, 135, 0),
					device("v-amp-1", "nfb-amplifier", 130, 35, "amp-1"),
					device("v-amp-2", "nfb-amplifier", 170, 35, "amp-2"),
					device("v-hs-1", "hemisync-headphones", 132, 100, "hs-1"),
					device("v-hs-2", "hemisync-headphones", 145, 100, "hs-2"),
					device("v-hs-3", "hemisync-headphones", 158, 100, "hs-3"),
					device("v-mat-1", "therapy-mat", 200, 120, "mat-1"),
				],
			},
			{
				id: "etaj",
				name: "Etaj",
				shapes: [
					space("arhiva", "storage", rect(10, 10, 60, 40)),
					{ id: "r-etaj", kind: "room", label: "Sală de ședințe", geometry: rect(70, 10, 70, 40) },
				],
			},
		],
	});
	if (!parsed.success) throw new Error(`the demo plan is invalid: ${parsed.error.message}`);
	return parsed.data;
}

const MIN = 60_000;
const PRACTITIONERS = [
	{ name: "Ana Popescu", monogram: "AP" },
	{ name: "Mihai Ionescu", monogram: "MI" },
	{ name: "Carmen Dobre", monogram: "CD" },
	{ name: "Elena Vasile", monogram: "EV" },
] as const;
const CLIENTS = ["AB", "CD", "EF", "GH", "IJ", "KL", "MN", "OP"] as const;

/** Synthetic bookings for the week of `dayStartMs` (a local midnight, Monday) and a few fixed oddities on `todayStartMs`: a clash, a closure, a group session. */
export function seedLive(weekStartMs: number, todayStartMs: number): LiveData {
	const bookings: LiveData["bookings"] = [];
	let n = 0;
	const add = (
		roomId: string,
		dayMs: number,
		fromH: number,
		minutes: number,
		extra: Partial<LiveData["bookings"][number]> = {},
	): void => {
		const p = PRACTITIONERS[n % PRACTITIONERS.length] ?? PRACTITIONERS[0];
		n += 1;
		bookings.push({
			id: `b${n}`,
			roomId,
			start: dayMs + fromH * 60 * MIN,
			until: dayMs + (fromH * 60 + minutes) * MIN,
			status: "confirmed",
			practitioner: p,
			service: roomId.startsWith("nfb")
				? "Neurofeedback"
				: roomId === "grup"
					? "Hemi-Sync în grup"
					: roomId === "kineto"
						? "Kinetoterapie"
						: "Psihoterapie",
			people: 1,
			shared: false,
			clientInitials: [CLIENTS[n % CLIENTS.length] ?? "AB"],
			deviceIds: roomId === "nfb-1" ? ["amp-1"] : roomId === "nfb-2" ? ["amp-2"] : [],
			...extra,
		});
	};
	const day = (i: number): number => weekStartMs + i * 24 * 60 * MIN;
	const rooms = ROOMS.map((r) => r.id).filter((id) => id !== "grup");
	for (let d = 0; d < 5; d++) {
		rooms.forEach((roomId, ri) => {
			for (let slot = 0; slot < 4; slot++) {
				if ((d + ri + slot) % 3 === 0) continue;
				add(roomId, day(d), 8 + ri * 0.25 + slot * 2.5, 50);
			}
		});
		add("grup", day(d), 17, 90, {
			shared: true,
			people: 6,
			clientInitials: ["AB", "CD", "EF"],
			deviceIds: ["hs-1", "hs-2", "hs-3"],
		});
	}
	// Today: a clash in psihoterapie 2 and a full group.
	const H = 60 * MIN;
	const held: ReadonlyArray<readonly [string, number, number]> = [
		["psih-2", 10.5, 13],
		["grup", 11.5, 13.5],
		["kineto", 13.5, 16.5],
	];
	const clear = bookings.filter(
		(b) =>
			!held.some(
				([id, from, to]) =>
					b.roomId === id && b.start < todayStartMs + to * H && todayStartMs + from * H < b.until,
			),
	);
	bookings.length = 0;
	bookings.push(...clear);
	add("psih-2", todayStartMs, 11, 60, { id: "x1" });
	add("psih-2", todayStartMs, 11.5, 60, { id: "x2", clientInitials: ["ZZ"] });
	add("grup", todayStartMs, 12, 60, {
		id: "x3",
		shared: true,
		people: 8,
		clientInitials: ["AB", "CD"],
		deviceIds: ["hs-1", "hs-2"],
	});
	add("grup", todayStartMs, 12, 60, {
		id: "x4",
		shared: true,
		people: 5,
		clientInitials: ["EF"],
		deviceIds: ["hs-3"],
	});
	return LiveDataSchema.parse({
		rooms: ROOMS.map((r) => ({
			id: r.id,
			name: r.name,
			kind: r.kind,
			capacity: r.capacity,
			equipment: [],
			closures:
				r.id === "kineto"
					? [
							{
								start: todayStartMs + 14 * 60 * MIN,
								until: todayStartMs + 16 * 60 * MIN,
								reason: "Curățenie și mentenanță",
							},
						]
					: [],
		})),
		bookings,
		devices: DEVICES.map((d) => ({ id: d.id, name: d.name, roomId: d.roomId })),
	});
}
