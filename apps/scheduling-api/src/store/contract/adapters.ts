import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createMemoryOutbox } from "@psi/notify";
import { createMemoryUsedLinks } from "@psi/notify/reminders";
import { createSchedulingClient, createStaffSchedulingClient } from "@psi/scheduling";
import { ConvexClient } from "convex/browser";
import { z } from "zod";
import { createConvexStore } from "../convex";
import { createConvexOutbox, createConvexUsedLinks } from "../convex/notify";
import { createRpc } from "../convex/rpc";
import { createMemoryStore } from "../memory";
import type { ContractEnv } from "./env";

/**
 * The adapters the contract suite runs against. Memory always. Convex when a backend is reachable:
 * `CONVEX_URL` (e.g. http://127.0.0.1:3580) and `PSI_CONVEX_DATA` (a directory with `secrets/server-key` and
 * `secrets/admin-key`, as scripts/local-backend.sh writes them). Without them the Convex run is skipped (CI has no
 * backend), and the suite says so.
 */
export interface ConvexTarget {
	url: string;
	serverKey: string;
	adminKey: string;
}

export async function convexTarget(): Promise<ConvexTarget | undefined> {
	const url = process.env.CONVEX_URL;
	const data = process.env.PSI_CONVEX_DATA;
	if (url === undefined || data === undefined) return undefined;
	const up = await fetch(`${url}/version`, { signal: AbortSignal.timeout(2_000) })
		.then((r) => r.ok)
		.catch(() => false);
	if (!up) return undefined;
	try {
		const read = (name: string): string => readFileSync(join(data, "secrets", name), "utf8").trim();
		return { url, serverKey: read("server-key"), adminKey: read("admin-key") };
	} catch {
		return undefined;
	}
}

export function memoryEnv(): ContractEnv {
	const store = createMemoryStore();
	let n = 0;
	return {
		adapter: "memory",
		store,
		notify: { outbox: createMemoryOutbox(), used: createMemoryUsedLinks() },
		async newApp() {
			n += 1;
			const id = `test-contract-${n}`;
			const now = Date.now();
			await store.c.apps.insert({
				id,
				app: id,
				name: "Test",
				timeZone: "Europe/Bucharest",
				status: "active",
				createdAt: now,
				updatedAt: now,
			});
			return id;
		},
		cleanup: () => Promise.resolve(),
	};
}

const Created = z.object({ created: z.boolean() });

/** A Convex-backed store on a throwaway tenant per section; `ensureApp` (internal, admin key) makes the tenant. */
export function convexEnv(target: ConvexTarget): ContractEnv {
	const rpc = createRpc({ url: target.url, serverKey: target.serverKey });
	const admin = createRpc({ url: target.url, adminKey: target.adminKey });
	const made: string[] = [];
	const live = new ConvexClient(target.url, { skipConvexDeploymentUrlCheck: true, logger: false });
	const store = createConvexStore({
		rpc,
		serverKey: target.serverKey,
		visitor: createSchedulingClient({
			url: target.url,
			serverKey: target.serverKey,
			timeoutMs: 30_000,
		}),
		staff: createStaffSchedulingClient({
			url: target.url,
			serverKey: target.serverKey,
			timeoutMs: 30_000,
		}),
		live,
	});
	return {
		adapter: "convex",
		store,
		notify: { outbox: createConvexOutbox(rpc), used: createConvexUsedLinks(rpc) },
		async newApp() {
			const id = `test-ct-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
			await admin.mutation(
				"clinicApps:ensureApp",
				{ slug: id, name: "Test", kind: "clinic", defaultLocale: "ro", currency: "RON" },
				Created.passthrough(),
			);
			made.push(id);
			return id;
		},
		async cleanup() {
			await live.close();
			for (const tenant of made)
				await admin.mutation("seed:dropFixture", { tenant }, z.unknown()).catch(() => undefined);
		},
	};
}
