import { z } from "zod";

/**
 * The editors' reading report from the daily counters: pure, so every figure is a test.
 * Read-through is the share of article views whose reader reached the end (depth 100).
 */
export const Row = z.object({
	day: z.string(),
	brand: z.string(),
	slug: z.string(),
	locale: z.string(),
	topic: z.string().nullish(),
	metric: z.string(),
	count: z.number(),
});
export type Row = z.infer<typeof Row>;

export interface ArticleLine {
	brand: string;
	slug: string;
	topic: string;
	views: number;
	depth: { 25: number; 50: number; 75: number; 100: number };
	/** depth_100 / views, 0–1; null without views. */
	readThrough: number | null;
}

export interface Report {
	since: string;
	totalViews: number;
	articles: ArticleLine[];
	brands: Array<{ brand: string; views: number; readThrough: number | null }>;
	topics: Array<{ topic: string; views: number }>;
	days: Array<{ day: string; views: number }>;
	guide: {
		asked: number;
		unanswered: number;
		/** How the invitation fares: the capsule opened, the nudge shown, the nudge clicked. */
		opened: number;
		nudgeShown: number;
		nudgeClicked: number;
	};
}

const ratio = (a: number, b: number): number | null => (b === 0 ? null : Math.min(1, a / b));

function bump<K>(m: Map<K, number>, k: K, n: number): void {
	m.set(k, (m.get(k) ?? 0) + n);
}

export function buildReport(rows: ReadonlyArray<Row>, since: string): Report {
	const articles = new Map<string, ArticleLine>();
	const brands = new Map<string, { views: number; full: number }>();
	const topics = new Map<string, number>();
	const days = new Map<string, number>();
	const guide = { asked: 0, unanswered: 0, opened: 0, nudgeShown: 0, nudgeClicked: 0 };
	for (const r of rows) {
		if (r.metric === "guide_asked") guide.asked += r.count;
		if (r.metric === "guide_unanswered") guide.unanswered += r.count;
		if (r.metric === "guide_opened") guide.opened += r.count;
		if (r.metric === "guide_nudge_shown") guide.nudgeShown += r.count;
		if (r.metric === "guide_nudge_clicked") guide.nudgeClicked += r.count;
		if (r.slug === "") continue;
		const key = `${r.brand}/${r.slug}`;
		const line = articles.get(key) ?? {
			brand: r.brand,
			slug: r.slug,
			topic: r.topic ?? "",
			views: 0,
			depth: { 25: 0, 50: 0, 75: 0, 100: 0 },
			readThrough: null,
		};
		const b = brands.get(r.brand) ?? { views: 0, full: 0 };
		if (r.metric === "view") {
			line.views += r.count;
			b.views += r.count;
			bump(topics, r.topic ?? "", r.count);
			bump(days, r.day, r.count);
		}
		const depth = /^depth_(25|50|75|100)$/.exec(r.metric)?.[1];
		if (depth === "25") line.depth[25] += r.count;
		if (depth === "50") line.depth[50] += r.count;
		if (depth === "75") line.depth[75] += r.count;
		if (depth === "100") {
			line.depth[100] += r.count;
			b.full += r.count;
		}
		articles.set(key, line);
		brands.set(r.brand, b);
	}
	const lines = [...articles.values()]
		.map((l) => ({ ...l, readThrough: ratio(l.depth[100], l.views) }))
		.sort((a, b) => b.views - a.views || a.slug.localeCompare(b.slug));
	return {
		since,
		totalViews: lines.reduce((n, l) => n + l.views, 0),
		articles: lines,
		brands: [...brands.entries()]
			.map(([brand, v]) => ({ brand, views: v.views, readThrough: ratio(v.full, v.views) }))
			.sort((a, b) => b.views - a.views),
		topics: [...topics.entries()]
			.map(([topic, views]) => ({ topic, views }))
			.sort((a, b) => b.views - a.views),
		days: [...days.entries()]
			.map(([day, views]) => ({ day, views }))
			.sort((a, b) => a.day.localeCompare(b.day)),
		guide,
	};
}
