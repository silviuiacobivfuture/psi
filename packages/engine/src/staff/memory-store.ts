import { mkdirSync } from "node:fs";
import type { MastraDBMessage } from "@mastra/core/memory";
import { MastraCompositeStore, type MemoryStorage } from "@mastra/core/storage";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { fileDirectory, THREAD_WINDOW } from "../memory";
import { sweepByRetention } from "../memory-retention";
import { createSealer, type Sealer } from "./memory-seal";

/** How long a staff conversation is kept: every message is deleted this many days after it was written. */
export const STAFF_MEMORY_DAYS = 30;

type Content = MastraDBMessage["content"];

const isContent = (v: unknown): v is Content =>
	typeof v === "object" && v !== null && "format" in v && v.format === 2 && "parts" in v;

/** The text a sealed message carries in place of its content; its shape stays a valid message. */
function shell(sealed: string): Content {
	return { format: 2, parts: [{ type: "text", text: sealed }] };
}

function sealedText(content: Content): string | undefined {
	const first = content.parts[0];
	return first !== undefined && first.type === "text" && content.parts.length === 1
		? first.text
		: undefined;
}

/**
 * Wraps the memory domain so every message is sealed on its way in and opened on its way out. The
 * rows in the database hold only the envelope; a row that does not open for its own person (another
 * key, a copied row, damage) is left out of what the engine reads.
 */
export function sealedMemoryDomain(target: MemoryStorage, sealer: Sealer): MemoryStorage {
	const seal = (m: MastraDBMessage): MastraDBMessage => {
		const resourceId = m.resourceId;
		if (resourceId === undefined) throw new Error("a staff message always belongs to a person");
		return { ...m, content: shell(sealer.seal(resourceId, JSON.stringify(m.content))) };
	};
	const open = (m: MastraDBMessage): MastraDBMessage | undefined => {
		if (m.resourceId === undefined || !isContent(m.content)) return undefined;
		const text = sealedText(m.content);
		const plain = text === undefined ? undefined : sealer.open(m.resourceId, text);
		if (plain === undefined) return undefined;
		try {
			const parsed: unknown = JSON.parse(plain);
			return isContent(parsed) ? { ...m, content: parsed } : undefined;
		} catch {
			return undefined;
		}
	};
	const openAll = (messages: ReadonlyArray<MastraDBMessage>): MastraDBMessage[] =>
		messages.flatMap((m) => open(m) ?? []);

	const overrides: Record<string, (...args: never[]) => unknown> = {
		saveMessages: async (args: { messages: MastraDBMessage[]; fence?: never }) => {
			const saved = await target.saveMessages({ ...args, messages: args.messages.map(seal) });
			return { ...saved, messages: openAll(saved.messages) };
		},
		updateMessages: async (args: Parameters<MemoryStorage["updateMessages"]>[0]) => {
			const ids = args.messages.map((m) => m.id);
			const existing = new Map(
				openAll((await target.listMessagesById({ messageIds: ids })).messages).map((m) => [
					m.id,
					m,
				]),
			);
			const sealedUpdates = args.messages.flatMap((u) => {
				const base = existing.get(u.id);
				if (u.content === undefined || base === undefined) return [];
				const merged: Content = {
					...base.content,
					...u.content,
					...(base.content.metadata !== undefined && u.content.metadata !== undefined
						? { metadata: { ...base.content.metadata, ...u.content.metadata } }
						: {}),
				};
				const resourceId = base.resourceId;
				if (resourceId === undefined) return [];
				return [{ ...u, content: shell(sealer.seal(resourceId, JSON.stringify(merged))) }];
			});
			const done = await target.updateMessages({ ...args, messages: sealedUpdates });
			return openAll(done);
		},
		listMessages: async (args: Parameters<MemoryStorage["listMessages"]>[0]) => {
			const page = await target.listMessages(args);
			return { ...page, messages: openAll(page.messages) };
		},
		listMessagesById: async (args: { messageIds: string[] }) => {
			const page = await target.listMessagesById(args);
			return { ...page, messages: openAll(page.messages) };
		},
		listMessagesByResourceId: async (
			args: Parameters<MemoryStorage["listMessagesByResourceId"]>[0],
		) => {
			const page = await target.listMessagesByResourceId(args);
			return { ...page, messages: openAll(page.messages) };
		},
	};
	return new Proxy(target, {
		get(object, property) {
			if (typeof property === "string" && Object.hasOwn(overrides, property)) {
				return overrides[property];
			}
			const value: unknown = Reflect.get(object, property, object);
			return typeof value === "function"
				? (...args: unknown[]) => Reflect.apply(value, object, args)
				: value;
		},
	});
}

export interface StaffMemory {
	readonly memory: Memory;
	/**
	 * Deletes what is older than its conversation's retention (the organisation's `memory.retentionDays` stamped on the
	 * thread; `days` for one never stamped), then whatever passed the longest retention any organisation may set; returns
	 * how many rows went. Safe to run any time.
	 */
	sweep(now?: number): Promise<number>;
}

/** The longest retention the settings allow: nothing outlives it, whatever a thread's stamp says. */
export const STAFF_MEMORY_BACKSTOP_DAYS = 365;

/**
 * The staff assistant's durable conversation memory: its own LibSQL file, every message sealed per
 * person, every message deleted its organisation's retention after it was written (`days`,
 * `STAFF_MEMORY_DAYS` by default, for a conversation no organisation stamped).
 */
export function openStaffMemory(options: {
	url: string;
	root: Buffer;
	days?: number;
	id?: string;
}): StaffMemory {
	const directory = fileDirectory(options.url);
	if (directory !== undefined) mkdirSync(directory, { recursive: true });
	const fallbackDays = options.days ?? STAFF_MEMORY_DAYS;
	const maxAge = `${STAFF_MEMORY_BACKSTOP_DAYS}d` as const;
	const store = new LibSQLStore({
		id: options.id ?? "staff-memory",
		url: options.url,
		retention: { memory: { messages: { maxAge }, threads: { maxAge }, resources: { maxAge } } },
	});
	const domain = store.stores?.memory;
	if (domain === undefined) throw new Error("the staff memory store has no memory domain");
	const composite = new MastraCompositeStore({
		id: `${options.id ?? "staff-memory"}-sealed`,
		default: store,
		domains: { memory: sealedMemoryDomain(domain, createSealer(options.root)) },
	});
	const memory = new Memory({
		storage: composite,
		options: {
			lastMessages: THREAD_WINDOW,
			semanticRecall: false,
			workingMemory: { enabled: false },
			generateTitle: false,
		},
	});
	return {
		memory,
		async sweep(now = Date.now()) {
			await store.init();
			const own = await sweepByRetention(memory, fallbackDays, now);
			const results = await store.prune();
			return own + results.reduce((n, r) => n + r.deleted, 0);
		},
	};
}
