import type { StaffCopy } from "./copy";
import type { ConfirmStatus, StaffCard } from "./events";
import type { Principal } from "./model";
import type { AuditEntry, PortRefusal, PortResult, StaffPort } from "./port";
import { type Change, type Proposal, type ProposalStore, subjectsOf } from "./proposals";

export interface ConfirmDeps {
	port: StaffPort;
	principal: Principal;
	proposals: ProposalStore;
	copy: StaffCopy;
	now: () => number;
}

export interface ConfirmOutcome {
	status: ConfirmStatus;
	/** The card that replaces the proposal's: what happened, in the person's words. */
	card: Extract<StaffCard, { kind: "result" }>;
}

/** Only a prepared WhatsApp link may leave as a link. */
const WHATSAPP_LINK = /^https:\/\/wa\.me\/\d{6,15}(\?text=[^\s]*)?$/;

type Currency = "current" | "stale" | PortRefusal;

function fromPort<T>(
	result: PortResult<T>,
): { ok: true; value: T } | { ok: false; verdict: Currency } {
	return result.ok ? result : { ok: false, verdict: result.reason };
}

/** Whether what the proposal was prepared against is still true, read afresh from the service. */
async function stillCurrent(port: StaffPort, change: Change): Promise<Currency> {
	switch (change.kind) {
		case "create_appointment": {
			const check = fromPort(
				await port.checkSlot({
					date: change.date,
					startMin: change.startMin,
					durationMin: change.durationMin,
					resourceIds: change.resourceIds,
				}),
			);
			if (!check.ok) return check.verdict;
			return check.value.free ? "current" : "stale";
		}
		case "move_appointment": {
			const found = fromPort(await port.appointment(change.id));
			if (!found.ok) return found.verdict;
			if (found.value.version !== change.expectedVersion) return "stale";
			const check = fromPort(
				await port.checkSlot({
					date: change.date,
					startMin: change.startMin,
					durationMin: change.durationMin,
					resourceIds: change.resourceIds,
					ignoreAppointmentId: change.id,
				}),
			);
			if (!check.ok) return check.verdict;
			return check.value.free ? "current" : "stale";
		}
		case "cancel_appointment":
		case "mark_attendance": {
			const found = fromPort(await port.appointment(change.id));
			if (!found.ok) return found.verdict;
			return found.value.version === change.expectedVersion ? "current" : "stale";
		}
		case "record_payment": {
			const found = fromPort(await port.packages(change.clientId));
			if (!found.ok) return found.verdict;
			const pkg = found.value.find((p) => p.id === change.packageId);
			if (pkg === undefined) return "not_found";
			return pkg.version === change.expectedVersion ? "current" : "stale";
		}
		case "request_leave":
			return "current";
		case "handle_request": {
			const found = fromPort(await port.webRequest(change.id));
			if (!found.ok) return found.verdict;
			return found.value.version === change.expectedVersion && !found.value.handled
				? "current"
				: "stale";
		}
		case "send_reminders": {
			for (const item of change.items) {
				const found = fromPort(await port.appointment(item.appointmentId));
				if (!found.ok) return found.verdict;
				if (found.value.version !== item.expectedVersion) return "stale";
			}
			return "current";
		}
		default: {
			const never: never = change;
			return never;
		}
	}
}

interface Done {
	refusal?: PortRefusal;
	links: Array<{ label: string; href: string }>;
	lines: Array<{ label: string; value: string }>;
}

async function perform(port: StaffPort, copy: StaffCopy, change: Change): Promise<Done> {
	const done: Done = { links: [], lines: [] };
	const refused = (result: PortResult<unknown>): Done =>
		result.ok ? done : { ...done, refusal: result.reason };
	switch (change.kind) {
		case "create_appointment":
			return refused(
				await port.createAppointment({
					clientId: change.clientId,
					serviceId: change.serviceId,
					date: change.date,
					startMin: change.startMin,
					durationMin: change.durationMin,
					resourceIds: change.resourceIds,
				}),
			);
		case "move_appointment":
			return refused(
				await port.moveAppointment({
					id: change.id,
					expectedVersion: change.expectedVersion,
					date: change.date,
					startMin: change.startMin,
					resourceIds: change.resourceIds,
				}),
			);
		case "cancel_appointment":
			return refused(
				await port.cancelAppointment({
					id: change.id,
					expectedVersion: change.expectedVersion,
				}),
			);
		case "mark_attendance":
			return refused(
				await port.markAttendance({
					id: change.id,
					expectedVersion: change.expectedVersion,
					status: change.status,
				}),
			);
		case "record_payment":
			return refused(
				await port.recordPayment({
					clientId: change.clientId,
					packageId: change.packageId,
					expectedVersion: change.expectedVersion,
					amountBani: change.amountBani,
					method: change.method,
				}),
			);
		case "request_leave":
			return refused(
				await port.requestLeave({
					personId: change.personId,
					from: change.from,
					to: change.to,
					kind: change.leaveKind,
				}),
			);
		case "handle_request":
			return refused(
				await port.markRequestHandled({
					id: change.id,
					expectedVersion: change.expectedVersion,
				}),
			);
		case "send_reminders": {
			for (const item of change.items) {
				const sent = await port.sendReminder({
					appointmentId: item.appointmentId,
					expectedVersion: item.expectedVersion,
					channel: item.channel,
					text: item.text,
				});
				if (!sent.ok) {
					done.lines.push({
						label: item.name,
						value: copy.refusal[sent.reason],
					});
					done.refusal ??= sent.reason;
					continue;
				}
				done.lines.push({ label: item.name, value: copy.result.reminderSent });
				if (sent.value.link !== undefined && WHATSAPP_LINK.test(sent.value.link)) {
					done.links.push({
						label: copy.result.openWhatsapp(item.name),
						href: sent.value.link,
					});
				}
			}
			return done;
		}
		default: {
			const never: never = change;
			return never;
		}
	}
}

function resultCard(
	copy: StaffCopy,
	proposal: { id: string; title: string },
	status: ConfirmStatus,
	extra: Partial<Pick<Done, "links" | "lines">> = {},
): ConfirmOutcome {
	const ok = status === "done";
	return {
		status,
		card: {
			kind: "result",
			proposalId: proposal.id,
			ok,
			title: `${ok ? copy.result.done : copy.result.failed} · ${proposal.title}`,
			lines: [{ label: "", value: copy.confirmOutcome[status] }, ...(extra.lines ?? [])],
			links: extra.links ?? [],
		},
	};
}

/** A confirmation that came to nothing before a proposal was even found. */
export function unconfirmed(
	copy: StaffCopy,
	proposalId: string,
	status: ConfirmStatus,
): ConfirmOutcome {
	return resultCard(copy, { id: proposalId, title: copy.panel.title }, status);
}

async function audit(port: StaffPort, entry: AuditEntry): Promise<boolean> {
	return (await port.audit(entry)).ok;
}

/**
 * Executes a proposal the person confirmed, once. In order: the proposal must exist for this very
 * person and app, be open and unexpired (claimed atomically, so a double click runs one); the
 * person must still be who they were; what it was prepared against must still be true; the audit
 * entry for the start must be recorded (no record, no write); only then the service is called,
 * with the same token, so its own permission check answers. Anything refused is final.
 */
export async function confirmProposal(
	deps: ConfirmDeps,
	proposalId: string,
): Promise<ConfirmOutcome> {
	const { port, principal, copy } = deps;
	const claimed = await deps.proposals.claim(
		proposalId,
		principal.sub,
		principal.appId,
		deps.now(),
	);
	if (!claimed.ok) return unconfirmed(copy, proposalId, claimed.reason);
	const proposal: Proposal = claimed.proposal;
	const settle = async (status: ConfirmStatus, extra?: Partial<Pick<Done, "links" | "lines">>) => {
		await deps.proposals.finish(proposal.id, "done");
		return resultCard(copy, proposal, status, extra);
	};
	const who = fromPort(await port.whoami());
	if (!who.ok || who.value.sub !== principal.sub || who.value.appId !== principal.appId) {
		return settle("no_principal");
	}
	const verdict = await stillCurrent(port, proposal.change);
	if (verdict !== "current") {
		await audit(port, {
			tool: proposal.change.kind,
			phase: "refused",
			outcome: "refused",
			subjects: [...subjectsOf(proposal.change)],
			proposalId: proposal.id,
			reason: verdict,
		});
		return settle(verdict);
	}
	const subjects = [...subjectsOf(proposal.change)];
	if (
		!(await audit(port, {
			tool: proposal.change.kind,
			phase: "execute_start",
			outcome: "ok",
			subjects,
			proposalId: proposal.id,
		}))
	) {
		return settle("audit_failed");
	}
	let done: Done;
	try {
		done = await perform(port, copy, proposal.change);
	} catch {
		done = { refusal: "unavailable", links: [], lines: [] };
	}
	await audit(port, {
		tool: proposal.change.kind,
		phase: "execute",
		outcome: done.refusal === undefined ? "ok" : "refused",
		subjects,
		proposalId: proposal.id,
		...(done.refusal === undefined ? {} : { reason: done.refusal }),
	});
	return settle(done.refusal ?? "done", done);
}

/** The person chose not to: the proposal is closed so it can never be confirmed later. */
export async function dismissProposal(
	deps: Pick<ConfirmDeps, "principal" | "proposals">,
	proposalId: string,
): Promise<boolean> {
	return deps.proposals.dismiss(proposalId, deps.principal.sub, deps.principal.appId);
}
