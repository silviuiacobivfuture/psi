import { openSession } from "../open";
import type { StaffPort } from "../port";
import { createMemoryProposalStore, type ProposalStore } from "../proposals";
import type { StaffSession } from "../session";
import { FAKE_NOW } from "./fake-port";

/** A session for tests, opened the real way (the port's `whoami` must succeed). */
export function openTestSession(
	port: StaffPort,
	options: {
		proposals?: ProposalStore;
		page?: StaffSession["page"];
		now?: () => number;
	} = {},
): Promise<StaffSession | undefined> {
	return openSession(
		port,
		{
			timeZone: "Europe/Bucharest",
			now: options.now ?? (() => FAKE_NOW),
			proposals: options.proposals ?? createMemoryProposalStore(),
			links: undefined,
		},
		{ page: options.page },
	);
}
