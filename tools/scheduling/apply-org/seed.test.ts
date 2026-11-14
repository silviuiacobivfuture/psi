import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseRoomsSeed } from "@psi/scheduling/clinic";
import { describe, expect, it } from "vitest";
import { parseLink } from "./links";
import { parseOrgSeed } from "./seed";

const read = (name: string): unknown =>
	JSON.parse(
		readFileSync(createRequire(import.meta.url).resolve(`@psi/scheduling/seed/${name}`), "utf8"),
	);
const rooms = parseRoomsSeed(read("psizone-rooms.json"));
const file = read("psizone-org.json");
const copy = (): Record<string, unknown> & {
	devices: { name: string; room: string; formerly?: string[] }[];
	services: { slug: string; rooms: string[]; devices: string[] }[];
	groups: { name: string; formerly: string[] }[];
} => structuredClone(file) as never;

describe("the Psizone org seed", () => {
	it("is valid against the rooms seed: the name, three devices, the group and seven draft services", () => {
		const org = parseOrgSeed(file, rooms);
		expect(org.name).toBe("Centrul Psihologic PSIZONE");
		expect(org.devices.map((d) => [d.name, d.room, d.deviceType])).toEqual([
			["NFB 1", "neurofeedback-1", "nfb"],
			["NFB 2", "neurofeedback-2", "nfb"],
			["QEEG", "mapping-cerebral", "qeeg"],
		]);
		expect(org.groups.map((g) => g.name)).toEqual(["Race Me Up"]);
		expect(org.services).toHaveLength(7);
		expect(org.services.filter((s) => s.category === "neuro").map((s) => s.slug)).toEqual([
			"neurofeedback",
			"evaluare-qeeg",
		]);
	});
	it("refuses a device in an unknown room", () => {
		const bad = copy();
		const first = bad.devices[0];
		if (first !== undefined) first.room = "no-such-room";
		expect(() => parseOrgSeed(bad, rooms)).toThrow(/unknown room no-such-room/);
	});
	it("refuses a service naming an unknown room or device", () => {
		const room = copy();
		room.services[0]?.rooms.push("attic");
		expect(() => parseOrgSeed(room, rooms)).toThrow(/unknown room attic/);
		const device = copy();
		device.services[0]?.devices.push("Laser");
		expect(() => parseOrgSeed(device, rooms)).toThrow(/unknown device Laser/);
	});
	it("refuses a name given twice, diacritics and case aside", () => {
		const dev = copy();
		dev.devices.push({ name: "nfb  1", room: "neurofeedback-1", deviceType: "nfb" } as never);
		expect(() => parseOrgSeed(dev, rooms)).toThrow(/device name given twice/);
		const group = copy();
		group.groups[0]?.formerly.push("RACE me up");
		expect(() => parseOrgSeed(group, rooms)).toThrow(/group name given twice/);
		const svc = copy();
		const s = svc.services[0];
		if (s !== undefined) svc.services.push({ ...s });
		expect(() => parseOrgSeed(svc, rooms)).toThrow(/slug given twice/);
	});
	it("refuses a seed of another app", () => {
		expect(() => parseOrgSeed({ ...copy(), app: "hemisync" }, rooms)).toThrow(/rooms seed psizone/);
	});
});

describe("--link", () => {
	it("reads the practitioner and the subject, the name with diacritics and spaces", () => {
		expect(parseLink("Năfureanu Nicoleta=abc123")).toEqual({
			person: "Năfureanu Nicoleta",
			subject: "abc123",
		});
	});
	it("refuses no name, no subject, no '=' and a subject that is not one", () => {
		for (const bad of ["=abc123", "Ana=", "Ana", "Ana=a b"])
			expect(() => parseLink(bad), bad).toThrow(/--link/);
	});
});
