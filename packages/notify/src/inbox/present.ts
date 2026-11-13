import type { InboxData, InboxEntry } from "@psi/ui";
import type { FeedNotification } from "./feed";

/** A link that stays on the console: same-origin absolute URLs become paths, anything else leads home. */
export function consolePath(url: string | undefined, consoleOrigin: string): string {
	if (url === undefined || url === "") return "/";
	if (url.startsWith("/") && !url.startsWith("//")) return url;
	try {
		const target = new URL(url);
		return target.origin === new URL(consoleOrigin).origin
			? `${target.pathname}${target.search}`
			: "/";
	} catch {
		return "/";
	}
}

function localDay(ms: number, timeZone: string): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(ms);
}

export interface PresentOptions {
	locale: "ro" | "en";
	timeZone: string;
	consoleOrigin: string;
	now: number;
}

export function present(
	entries: ReadonlyArray<FeedNotification>,
	unread: number,
	o: PresentOptions,
): InboxData {
	const tag = o.locale === "ro" ? "ro-RO" : "en-GB";
	const today = localDay(o.now, o.timeZone);
	const mapped: InboxEntry[] = entries.map((n) => {
		const at = Date.parse(n.createdAt);
		const isToday = Number.isFinite(at) && localDay(at, o.timeZone) === today;
		return {
			id: n.id,
			title: n.subject ?? n.body,
			body: n.subject ? n.body : "",
			href: consolePath(n.redirect?.url, o.consoleOrigin),
			time: Number.isFinite(at)
				? new Intl.DateTimeFormat(
						tag,
						isToday
							? { timeZone: o.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
							: { timeZone: o.timeZone, day: "numeric", month: "short" },
					).format(at)
				: "",
			read: n.isRead,
			group: isToday ? "today" : "earlier",
		};
	});
	return { state: "ready", entries: mapped, unread };
}
