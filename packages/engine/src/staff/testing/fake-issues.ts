import type { Issue } from "../model";
import type { IssuesPort, PortResult } from "../port";

/** The estate's log store as the assistant sees it: aggregates only, set by the test. */
export class FakeIssuesPort implements IssuesPort {
	issuesList: Array<Issue> = [
		{
			kind: "http_5xx",
			site: "psizone-web",
			count: 4,
			firstSeen: "2026-11-12T08:00:00Z",
			lastSeen: "2026-11-13T06:30:00Z",
			sample: "GET /programare 502",
		},
		{
			kind: "chat_failure",
			site: "psizone-web",
			count: 2,
			firstSeen: "2026-11-13T05:00:00Z",
			lastSeen: "2026-11-13T05:10:00Z",
			sample: "guide: check failed for ion@example.test 0712000999",
		},
	];
	down = false;
	readonly calls: Array<{ from: string; to: string }> = [];

	async issues(query: { from: string; to: string }): Promise<PortResult<ReadonlyArray<Issue>>> {
		this.calls.push(query);
		return this.down ? { ok: false, reason: "unavailable" } : { ok: true, value: this.issuesList };
	}
}
