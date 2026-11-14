import { describe, expect, it } from "vitest";
import {
	DeviceInputSchema,
	PersonInputSchema,
	RoomInputSchema,
	ServiceInputSchema,
} from "../port/schema-catalog";
import {
	deviceFrom,
	hoursFrom,
	minutesOf,
	personFrom,
	roomFrom,
	serviceFrom,
} from "./catalog-form";

describe("a posted form becomes a typed input", () => {
	it("reads the week's hours: both ends make a day, either end empty is a day off", () => {
		const hours = hoursFrom({
			h0_from: "09:00",
			h0_to: "17:30",
			h1_from: "09:00",
			h1_to: "",
			h2_from: "xx",
			h2_to: "10:00",
		});
		expect(hours[0]).toEqual({ from: 540, to: 1050 });
		expect(hours.slice(1)).toEqual([null, null, null, null, null, null]);
	});
	it("minutes of a time: boundaries and nonsense", () => {
		expect(minutesOf("00:00")).toBe(0);
		expect(minutesOf("23:59")).toBe(1439);
		expect(minutesOf("24:00")).toBeUndefined();
		expect(minutesOf("9:5")).toBeUndefined();
		expect(minutesOf("")).toBeUndefined();
	});
	it("a person: name, e-mail, roles, practitioner, rooms and services, with unicode", () => {
		const p = PersonInputSchema.parse(
			personFrom({
				name: "  Ștefania Țurcanu ",
				email: "stefania@example.test",
				roles: ["therapist", "reception"],
				practitioner: "on",
				colour: "3",
				roomIds: ["r1"],
				serviceIds: ["s1", "s3"],
				active: "on",
				h0_from: "09:00",
				h0_to: "13:00",
			}),
		);
		expect(p).toMatchObject({
			name: "Ștefania Țurcanu",
			practitioner: true,
			colour: 3,
			active: true,
		});
		expect(p.hours[0]).toEqual({ from: 540, to: 780 });
	});
	it("refuses what is not a person: no name, a bad e-mail, a day that ends before it starts", () => {
		expect(PersonInputSchema.safeParse(personFrom({ name: " " })).success).toBe(false);
		expect(
			PersonInputSchema.safeParse(personFrom({ name: "A", email: "nu-e-email" })).success,
		).toBe(false);
		expect(
			PersonInputSchema.safeParse(personFrom({ name: "A", h0_from: "17:00", h0_to: "09:00" }))
				.success,
		).toBe(false);
	});
	it("a room: category required, capacity a whole number, no home practitioner is none", () => {
		const r = RoomInputSchema.parse(
			roomFrom({ name: "Cabinet 3", category: "neuro", capacity: "2", bookable: "on" }),
		);
		expect(r).toMatchObject({ category: "neuro", capacity: 2, homeOf: null, bookable: true });
		expect(RoomInputSchema.safeParse(roomFrom({ name: "X", category: "nope" })).success).toBe(
			false,
		);
		expect(
			RoomInputSchema.safeParse(roomFrom({ name: "X", category: "therapy", capacity: "abc" }))
				.success,
		).toBe(false);
	});
	it("a device: type defaults to other, no room is none", () => {
		expect(DeviceInputSchema.parse(deviceFrom({ name: "NFB 3" }))).toMatchObject({
			type: "other",
			roomId: null,
		});
		expect(DeviceInputSchema.safeParse(deviceFrom({ name: "NFB", type: "x" })).success).toBe(false);
	});
	it("a service: the price in lei becomes bani, empty is no price, a duration is required", () => {
		const s = ServiceInputSchema.parse(
			serviceFrom({
				name: "Evaluare",
				durationMin: "90",
				price: "400",
				online: "on",
				active: "on",
			}),
		);
		expect(s.priceBani).toBe(40000);
		expect(s.online).toBe(true);
		expect(
			ServiceInputSchema.parse(serviceFrom({ name: "Gratuit", durationMin: "30", price: "" }))
				.priceBani,
		).toBeNull();
		expect(ServiceInputSchema.safeParse(serviceFrom({ name: "Fără durată" })).success).toBe(false);
		expect(
			ServiceInputSchema.safeParse(serviceFrom({ name: "Prea scurt", durationMin: "2" })).success,
		).toBe(false);
	});
});
