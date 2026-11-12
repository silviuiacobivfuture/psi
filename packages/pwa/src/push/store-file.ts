import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { emptyState, type PushState, type PushStore, stateStore } from "./store";
import { LocaleSchema, SiteSchema, TopicSchema } from "./types";

/** Local development: the repository's gitignored `/.data/pwa/push.json`, shared by the four dev servers. */
export const LOCAL_STORE_FILE = fileURLToPath(
	new URL("../../../../.data/pwa/push.json", import.meta.url),
);

const StateSchema = z.object({
	subscriptions: z.array(
		z.object({
			id: z.string(),
			endpoint: z.string(),
			p256dh: z.string(),
			auth: z.string(),
			site: SiteSchema,
			locale: LocaleSchema,
			topics: z.array(TopicSchema),
			subject: z.string().nullable(),
			createdAt: z.number(),
			updatedAt: z.number(),
			failures: z.number(),
		}),
	),
	bookings: z.array(z.object({ reference: z.string(), subject: z.string(), at: z.number() })),
	reminders: z.array(z.object({ reference: z.string(), at: z.number(), leadMinutes: z.number() })),
	claims: z.array(z.object({ key: z.string(), at: z.number() })),
});

function read(file: string): PushState {
	if (!existsSync(file)) return emptyState();
	const parsed = StateSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
	if (!parsed.success) throw new Error(`push store ${file} is not a push store`);
	return parsed.data;
}

/** Many dev servers share the file: a directory lock (atomic `mkdir`) around read-modify-write. */
async function locked<T>(file: string, fn: () => T): Promise<T> {
	const lock = `${file}.lock`;
	for (let i = 0; ; i++) {
		try {
			mkdirSync(lock);
			break;
		} catch {
			if (i > 200) throw new Error(`push store ${file} stays locked`);
			await sleep(10);
		}
	}
	try {
		return fn();
	} finally {
		rmdirSync(lock);
	}
}

/**
 * A JSON file, mode 600, read and rewritten (atomically) on every write. For one workstation:
 * the cluster uses Postgres (`postgresPushStore`).
 */
export function filePushStore(file: string = LOCAL_STORE_FILE): PushStore {
	mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
	return stateStore((op, write) =>
		write
			? locked(file, () => {
					const state = read(file);
					const out = op(state);
					const tmp = `${file}.${process.pid}.tmp`;
					writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
					renameSync(tmp, file);
					return out;
				})
			: Promise.resolve(op(read(file))),
	);
}
