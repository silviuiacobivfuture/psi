/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { describe, expect, it } from "vitest";
import { Timeline } from "./timeline";

describe("Timeline", () => {
	it("lists each entry with its marker and its status in words", () => {
		const html = (
			<Timeline
				label="Sessions"
				empty="none"
				items={[
					{
						key: "a",
						when: "1 Nov",
						title: "Therapy",
						status: "attended",
						statusLabel: "Attended",
					},
					{
						key: "b",
						when: "8 Nov",
						title: "Therapy",
						status: "no-show",
						statusLabel: "No-show",
					},
					{
						key: "c",
						when: "15 Nov",
						title: "Therapy",
						status: null,
						statusLabel: "Planned",
						href: "/calendar",
					},
				]}
			/>
		).toString();
		expect(html).toContain('<ol class="adm-timeline" aria-label="Sessions">');
		expect(html.match(/<li /g)).toHaveLength(3);
		expect(html).toContain('data-status="no-show"');
		expect(html).toContain('data-status="upcoming"');
		expect(html).toContain("No-show");
		expect(html).toContain('href="/calendar"');
		expect(html).toContain("is-upcoming");
	});
	it("shows the empty line, not an empty list", () => {
		const html = (<Timeline label="s" empty="Nothing yet" items={[]} />).toString();
		expect(html).toContain("Nothing yet");
		expect(html).not.toContain("<ol");
	});
});
