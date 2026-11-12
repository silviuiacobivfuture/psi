/**
 * Where events sit in a day column: minutes after midnight, side by side when they overlap. Pure,
 * so the grid's arithmetic is tested without a browser.
 */
export interface Span {
	id: string;
	start: number;
	end: number;
}
export interface Placed extends Span {
	lane: number;
	lanes: number;
}

/** Greedy lanes: each event takes the first lane free at its start; a cluster shares its width. */
export function place(spans: ReadonlyArray<Span>): Placed[] {
	const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
	const out: Placed[] = [];
	let cluster: Placed[] = [];
	let clusterEnd = -1;
	const flush = (): void => {
		const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1));
		for (const p of cluster) out.push({ ...p, lanes });
		cluster = [];
	};
	for (const s of sorted) {
		if (s.start >= clusterEnd && cluster.length > 0) flush();
		const taken = new Set(cluster.filter((p) => p.end > s.start).map((p) => p.lane));
		let lane = 0;
		while (taken.has(lane)) lane += 1;
		cluster.push({ ...s, lane, lanes: 1 });
		clusterEnd = Math.max(clusterEnd, s.end);
	}
	if (cluster.length > 0) flush();
	return out;
}

/** The hours the axis shows: the working day, widened to hold every event, whole hours. */
export function axisOf(spans: ReadonlyArray<{ start: number; end: number }>): {
	from: number;
	to: number;
} {
	const lo = Math.min(8 * 60, ...spans.map((s) => s.start));
	const hi = Math.max(20 * 60, ...spans.map((s) => s.end));
	return { from: Math.floor(lo / 60) * 60, to: Math.min(24 * 60, Math.ceil(hi / 60) * 60) };
}

/** The Monday of the week holding a local date. */
export function mondayOf(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
	return d.toISOString().slice(0, 10);
}

export function addDay(date: string, n: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}
