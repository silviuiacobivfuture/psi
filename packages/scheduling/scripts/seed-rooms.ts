import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { roomsPlanDocument } from "../src/clinic/rooms-plan";
import { parseRoomsSeed } from "../src/clinic/rooms-seed";

/**
 * Seeds an app's rooms and floor plan from `seed/<app>-rooms.json`, through the scheduling service itself (the rooms
 * route, then the floor-plan route), so the tuples, the audit log and the change feed are as real as in service.
 *
 *   tsx scripts/seed-rooms.ts --api http://localhost:4381 --seed seed/psizone-rooms.json --as owner
 *
 * `--as` signs in through the service's development issuer (`/dev/token`): a local service only. A room that already has
 * the seeded name is kept (nothing is deleted or renamed); a rerun draws the same plan again from the stored revision.
 */
const Token = z.object({ token: z.string().min(1) });
const Rooms = z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })) });
const Made = z.object({ id: z.string() });
const Plan = z.object({ revision: z.number().int() });

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: { api: { type: "string" }, seed: { type: "string" }, as: { type: "string" } },
		strict: true,
	});
	if (values.api === undefined || values.seed === undefined || values.as === undefined)
		throw new Error("usage: seed-rooms --api <url> --seed <file> --as <subject>");
	const api = values.api.replace(/\/+$/, "");
	const seed = parseRoomsSeed(JSON.parse(await readFile(values.seed, "utf8")));
	const minted = Token.parse(
		await (
			await fetch(`${api}/dev/token`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ subject: values.as }),
			})
		).json(),
	);
	const call = async (method: string, path: string, body?: unknown): Promise<unknown> => {
		const res = await fetch(`${api}/v1/apps/${seed.app}${path}`, {
			method,
			headers: {
				authorization: `Bearer ${minted.token}`,
				...(body === undefined ? {} : { "content-type": "application/json" }),
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}`);
		return res.json();
	};

	const held = Rooms.parse(await call("GET", "/rooms")).items;
	const stored = new Map<string, string>();
	let created = 0;
	for (const room of seed.floors.flatMap((f) => f.rooms)) {
		const same = held.find((r) => r.name === room.name);
		if (same !== undefined) {
			stored.set(room.id, same.id);
			continue;
		}
		const made = Made.parse(
			await call("POST", "/rooms", { name: room.name, kind: room.category, capacity: 1 }),
		);
		stored.set(room.id, made.id);
		created += 1;
	}
	const revision = Plan.parse(await call("GET", "/floor-plan")).revision;
	const saved = Plan.parse(
		await call("PUT", "/floor-plan", {
			doc: roomsPlanDocument(seed, (id) => stored.get(id) ?? id, revision),
		}),
	);
	console.log(
		`${seed.app}: ${stored.size} rooms (${created} created), floor plan saved at revision ${saved.revision}`,
	);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : "seeding failed");
	process.exitCode = 1;
});
