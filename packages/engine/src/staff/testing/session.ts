import { openSession } from "../open";
import type { RouteLike } from "../parity/routes";
import type { IssuesPort, StaffPort } from "../port";
import { createMemoryProposalStore, type ProposalStore } from "../proposals";
import { createReadCache, type ReadCache } from "../read-cache";
import type { StaffSession } from "../session";
import { FAKE_NOW } from "./fake-port";

/** A session for tests, opened the real way (the port's `whoami` must succeed). */
export function openTestSession(
	port: StaffPort,
	options: {
		proposals?: ProposalStore;
		page?: StaffSession["page"];
		now?: () => number;
		routes?: ReadonlyArray<RouteLike>;
		issues?: IssuesPort;
		reads?: ReadCache;
	} = {},
): Promise<StaffSession | undefined> {
	return openSession(
		port,
		{
			timeZone: "Europe/Bucharest",
			now: options.now ?? (() => FAKE_NOW),
			proposals: options.proposals ?? createMemoryProposalStore(),
			links: undefined,
			routes: options.routes ?? [],
			issues: options.issues,
			reads: options.reads ?? createReadCache(options.now ?? (() => FAKE_NOW)),
		},
		{ page: options.page },
	);
}
