import { guardPort } from "./boundary";
import { staffCopy } from "./copy";
import type { StaffPage } from "./events";
import type { RouteLike } from "./parity/routes";
import type { IssuesPort, StaffPort } from "./port";
import type { ProposalStore } from "./proposals";
import type { StaffLinks, StaffSession } from "./session";
import { vouch } from "./tools";

export interface SessionDeps {
	timeZone: string;
	now: () => number;
	proposals: ProposalStore;
	links: StaffLinks | undefined;
	routes: ReadonlyArray<RouteLike>;
	issues: IssuesPort | undefined;
}

/**
 * The one way to a session: the port is put behind the boundary and its `whoami` must succeed.
 * Without a verified principal there is no session, so no tools and no run.
 */
export async function openSession(
	port: StaffPort,
	deps: SessionDeps,
	input: { page?: StaffPage | undefined; threadId?: string | undefined },
): Promise<StaffSession | undefined> {
	const guarded = guardPort(port);
	const who = await guarded.whoami();
	if (!who.ok) return undefined;
	return vouch({
		port: guarded,
		principal: who.value,
		copy: staffCopy(who.value.locale),
		timeZone: deps.timeZone,
		now: deps.now,
		proposals: deps.proposals,
		links: deps.links,
		routes: deps.routes,
		issues: deps.issues,
		page: input.page,
		threadId: input.threadId,
		cards: [],
		blocked: new Set(),
		taint: { stranger: false },
		caps: undefined,
	});
}
