import { z } from "zod";
import type { CardLine } from "./events";
import { fence } from "./fence";
import {
	actionOf,
	type Change,
	newProposalId,
	PROPOSAL_TTL_MS,
	type Proposal,
	subjectsOf,
} from "./proposals";
import type { StaffSession, ToolRun } from "./session";

/** A line of a proposal; `free` marks text from a record, which the model reads fenced. */
export interface ProposalLine extends CardLine {
	free?: boolean;
}

export const NeedsConfirmationSchema = z.object({
	status: z.literal("needs_confirmation"),
	proposalId: z.string(),
	summary: z.string(),
	instruction: z.string(),
});
export type NeedsConfirmation = z.infer<typeof NeedsConfirmationSchema>;

const INSTRUCTION =
	"Nothing has been changed. The person sees a card with a Confirm button. Tell them to review it and confirm there; do not say it is done.";

/**
 * Prepares a write and stops: checks the person may do it, stores the change for their own
 * confirmation and shows the card. Execution is `confirmProposal`, reachable only from the
 * console's button, never from a tool.
 */
export async function propose(
	s: StaffSession,
	change: Change,
	view: {
		title: string;
		lines: ReadonlyArray<ProposalLine>;
		destructive: boolean;
	},
): Promise<ToolRun<NeedsConfirmation>> {
	const subjects = subjectsOf(change);
	if (s.taint.stranger && change.kind !== "handle_request")
		return { ok: false, reason: "tainted", subjects };
	const allowed = await s.port.can(actionOf(change), subjects[0]);
	if (!allowed.ok) return { ok: false, reason: allowed.reason, subjects };
	if (!allowed.value) return { ok: false, reason: "not_allowed", subjects };
	const now = s.now();
	const proposal: Proposal = {
		id: newProposalId(),
		sub: s.principal.sub,
		appId: s.principal.appId,
		createdAt: now,
		expiresAt: now + PROPOSAL_TTL_MS,
		change,
		title: view.title,
		lines: view.lines.map(({ label, value }) => ({ label, value })),
		destructive: view.destructive,
		state: "open",
	};
	await s.proposals.put(proposal);
	return {
		ok: true,
		subjects,
		proposalId: proposal.id,
		cards: [proposalCard(proposal)],
		output: {
			status: "needs_confirmation",
			proposalId: proposal.id,
			summary: `${view.title}: ${view.lines.map((l) => `${l.label} ${l.free === true ? fence(l.value) : l.value}`).join("; ")}`,
			instruction: INSTRUCTION,
		},
	};
}

/** The card the person confirms, drawn from the stored proposal, never from the model's words. */
export function proposalCard(p: Proposal) {
	return {
		kind: "proposal" as const,
		proposalId: p.id,
		title: p.title,
		lines: [...p.lines],
		destructive: p.destructive,
		expiresAt: p.expiresAt,
	};
}
