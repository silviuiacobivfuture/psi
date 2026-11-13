import type { NotificationsPort } from "./port";

interface Entry {
	id: string;
	subject: string;
	body: string;
	isRead: boolean;
	createdAt: string;
	redirect: { url: string };
}

const MINUTE = 60_000;

/** Synthetic notifications of the demo clinic, in the order a day brings them. */
function seed(now: number): Entry[] {
	const at = (minutesAgo: number): string => new Date(now - minutesAgo * MINUTE).toISOString();
	return [
		{
			id: "n1",
			subject: "O cerere nouă a ajuns în consolă",
			body: "Deschide Cereri ca să o vezi.",
			isRead: false,
			createdAt: at(12),
			redirect: { url: "/requests" },
		},
		{
			id: "n2",
			subject: "Mementourile pentru mâine sunt pregătite",
			body: "Trimite-le din Mementouri.",
			isRead: false,
			createdAt: at(95),
			redirect: { url: "/reminders" },
		},
		{
			id: "n3",
			subject: "O programare a fost mutată",
			body: "Calendarul arată ce urmează.",
			isRead: true,
			createdAt: at(26 * 60),
			redirect: { url: "/calendar" },
		},
	];
}

/** An in-memory feed for development: everyone sees the same demo notifications (none with `seeded: false`), and reading them sticks until restart. */
export function createFakeNotifications(
	options: { now?: () => number; seeded?: boolean } = {},
): NotificationsPort {
	const now = options.now ?? Date.now;
	const held = new Map<string, Entry[]>();
	const of = (subscriber: string): Entry[] => {
		let list = held.get(subscriber);
		if (list === undefined) {
			list = options.seeded === false ? [] : seed(now());
			held.set(subscriber, list);
		}
		return list;
	};
	return {
		async list(subscriber, limit) {
			const all = of(subscriber);
			return { entries: all.slice(0, limit), unread: all.filter((e) => !e.isRead).length };
		},
		async markRead(subscriber, id) {
			for (const e of of(subscriber)) if (e.id === id) e.isRead = true;
		},
		async markAllRead(subscriber) {
			for (const e of of(subscriber)) e.isRead = true;
		},
	};
}
