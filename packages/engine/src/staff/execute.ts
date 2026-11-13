import type { StaffCopy } from "./copy";
import type { CardLine, ConfirmStatus, StaffCard } from "./events";
import type { Principal } from "./model";
import type { AuditEntry, PortRefusal, PortResult, StaffPort } from "./port";
import {
	ANY_VERSION,
	type Change,
	NEW_CLIENT,
	newProposalId,
	PROPOSAL_TTL_MS,
	type Proposal,
	type ProposalStore,
	type Step,
	subjectsOf,
} from "./proposals";

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
type Read<T> = { ok: true; value: T } | { ok: false; verdict: Currency };

function read<T>(result: PortResult<T>): Read<T> {
	return result.ok ? result : { ok: false, verdict: result.reason };
}

async function slotStill(
	port: StaffPort,
	step: Extract<Step, { kind: "create_appointment" | "move_appointment" }>,
): Promise<Currency> {
	const check = read(
		await port.checkSlot({
			date: step.date,
			startMin: step.startMin,
			durationMin: step.durationMin,
			resourceIds: step.resourceIds,
			...(step.kind === "move_appointment" ? { ignoreAppointmentId: step.id } : {}),
		}),
	);
	if (!check.ok) return check.verdict;
	return check.value.free ? "current" : "stale";
}

async function versionIs(port: StaffPort, id: string, version: string): Promise<Currency> {
	if (version === ANY_VERSION) return "current";
	const found = read(await port.appointment(id));
	if (!found.ok) return found.verdict;
	return found.value.version === version ? "current" : "stale";
}

/** Whether what a step was prepared against is still true, read afresh from the service. */
async function stepCurrent(port: StaffPort, step: Step): Promise<Currency> {
	switch (step.kind) {
		case "create_client":
			return "current";
		case "run_action": {
			const listed = read(await port.listActions(step.page));
			if (!listed.ok) return listed.verdict;
			return listed.value.some((a) => a.id === step.actionId) ? "current" : "forbidden";
		}
		case "create_appointment":
			return slotStill(port, step);
		case "move_appointment": {
			const version = await versionIs(port, step.id, step.expectedVersion);
			return version === "current" ? slotStill(port, step) : version;
		}
		case "cancel_appointment":
		case "mark_attendance":
			return versionIs(port, step.id, step.expectedVersion);
		case "record_payment": {
			const found = read(await port.packages(step.clientId));
			if (!found.ok) return found.verdict;
			const pkg = found.value.find((p) => p.id === step.packageId);
			if (pkg === undefined) return "not_found";
			return pkg.version === step.expectedVersion ? "current" : "stale";
		}
		case "request_leave":
		case "route_call":
			return "current";
		case "handle_request": {
			const found = read(await port.webRequest(step.id));
			if (!found.ok) return found.verdict;
			return found.value.version === step.expectedVersion && !found.value.handled
				? "current"
				: "stale";
		}
		case "send_reminders": {
			for (const item of step.items) {
				if (item.about !== "appointment" || item.appointmentId === undefined) continue;
				const verdict = await versionIs(port, item.appointmentId, item.expectedVersion);
				if (verdict !== "current") return verdict;
			}
			return "current";
		}
		default: {
			const never: never = step;
			return never;
		}
	}
}

async function stillCurrent(port: StaffPort, change: Change): Promise<Currency> {
	for (const step of change.kind === "batch" ? change.steps : [change]) {
		const verdict = await stepCurrent(port, step);
		if (verdict !== "current") return verdict;
	}
	return "current";
}

interface Done {
	refusal?: PortRefusal;
	links: Array<{ label: string; href: string }>;
	lines: Array<CardLine>;
	/** The inverses of the steps that ran and can be reversed, in the order they ran. */
	undo: Array<Step>;
	ran: number;
	/** The client a `create_client` step of this change made, for the steps after it. */
	newClientId?: string;
}

async function performStep(
	port: StaffPort,
	copy: StaffCopy,
	step: Step,
	done: Done,
): Promise<void> {
	const refused = (result: PortResult<unknown>): void => {
		if (!result.ok) done.refusal = result.reason;
	};
	switch (step.kind) {
		case "create_client": {
			const made = await port.createClient({
				name: step.name,
				...(step.phone === undefined ? {} : { phone: step.phone }),
				...(step.email === undefined ? {} : { email: step.email }),
				...(step.guardian === undefined ? {} : { guardian: step.guardian }),
				...(step.birthYear === undefined ? {} : { birthYear: step.birthYear }),
			});
			refused(made);
			if (made.ok) {
				done.newClientId = made.value.id;
				done.lines.push({ label: copy.label.client, value: made.value.name });
			}
			return;
		}
		case "run_action": {
			const ran = await port.runAction({
				id: step.actionId,
				params: step.params,
			});
			refused(ran);
			if (ran.ok) {
				done.lines.push({ label: "", value: ran.value.summary });
				const href = ran.value.href;
				if (href?.startsWith("/")) done.links.push({ label: copy.result.open, href });
			}
			return;
		}
		case "create_appointment": {
			const clientId = step.clientId === NEW_CLIENT ? done.newClientId : step.clientId;
			if (clientId === undefined) {
				done.refusal = "invalid";
				return;
			}
			const made = await port.createAppointment({
				clientId,
				serviceId: step.serviceId,
				date: step.date,
				startMin: step.startMin,
				durationMin: step.durationMin,
				resourceIds: step.resourceIds,
			});
			refused(made);
			if (made.ok)
				done.undo.push({
					kind: "cancel_appointment",
					id: made.value.id,
					expectedVersion: made.value.version,
				});
			return;
		}
		case "move_appointment": {
			const moved = await port.moveAppointment({
				id: step.id,
				expectedVersion: step.expectedVersion,
				date: step.date,
				startMin: step.startMin,
				resourceIds: step.resourceIds,
			});
			refused(moved);
			if (moved.ok) {
				done.undo.push({
					kind: "move_appointment",
					id: step.id,
					expectedVersion: moved.value.version,
					date: step.before.date,
					startMin: step.before.startMin,
					durationMin: step.durationMin,
					resourceIds: step.before.resourceIds,
					before: {
						date: step.date,
						startMin: step.startMin,
						resourceIds: step.resourceIds,
					},
				});
			}
			return;
		}
		case "cancel_appointment":
			return refused(
				await port.cancelAppointment({
					id: step.id,
					expectedVersion: step.expectedVersion,
				}),
			);
		case "mark_attendance":
			return refused(
				await port.markAttendance({
					id: step.id,
					expectedVersion: step.expectedVersion,
					status: step.status,
				}),
			);
		case "record_payment":
			return refused(
				await port.recordPayment({
					clientId: step.clientId,
					packageId: step.packageId,
					expectedVersion: step.expectedVersion,
					amountBani: step.amountBani,
					method: step.method,
				}),
			);
		case "request_leave":
			return refused(
				await port.requestLeave({
					personId: step.personId,
					from: step.from,
					to: step.to,
					kind: step.leaveKind,
				}),
			);
		case "route_call":
			return refused(await port.callRoute({ routeId: step.routeId, input: step.input }));
		case "handle_request":
			return refused(
				await port.markRequestHandled({
					id: step.id,
					expectedVersion: step.expectedVersion,
				}),
			);
		case "send_reminders": {
			for (const item of step.items) {
				let version = item.expectedVersion;
				if (version === ANY_VERSION && item.appointmentId !== undefined) {
					const current = await port.appointment(item.appointmentId);
					version = current.ok ? current.value.version : version;
				}
				const sent = await port.sendReminder({
					about: item.about,
					...(item.appointmentId === undefined ? {} : { appointmentId: item.appointmentId }),
					...(item.clientId === undefined ? {} : { clientId: item.clientId }),
					expectedVersion: version,
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
			return;
		}
		default: {
			const never: never = step;
			return never;
		}
	}
}

/** Runs the steps in order and stops at the first the service refuses; what ran is reported. */
async function perform(port: StaffPort, copy: StaffCopy, change: Change): Promise<Done> {
	const done: Done = { links: [], lines: [], undo: [], ran: 0 };
	for (const step of change.kind === "batch" ? change.steps : [change]) {
		try {
			await performStep(port, copy, step, done);
		} catch {
			done.refusal = "unavailable";
		}
		if (done.refusal !== undefined) break;
		done.ran += 1;
	}
	return done;
}

function resultCard(
	copy: StaffCopy,
	proposal: { id: string; title: string; lines?: ReadonlyArray<CardLine> },
	status: ConfirmStatus,
	extra: {
		links?: Done["links"];
		lines?: Done["lines"];
		undo?: { proposalId: string; label: string };
	} = {},
): ConfirmOutcome {
	const ok = status === "done";
	return {
		status,
		card: {
			kind: "result",
			proposalId: proposal.id,
			ok,
			title: `${ok ? copy.result.done : copy.result.failed} · ${proposal.title}`,
			lines: [
				{ label: "", value: copy.confirmOutcome[status] },
				...(ok ? (proposal.lines ?? []) : []),
				...(extra.lines ?? []),
			],
			links: extra.links ?? [],
			...(extra.undo === undefined ? {} : { undo: extra.undo }),
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

/** The inverse of what ran, prepared for the person to press once more; undefined when nothing can be reversed. */
async function prepareUndo(deps: ConfirmDeps, proposal: Proposal, steps: ReadonlyArray<Step>) {
	const [first, ...rest] = [...steps].reverse();
	if (first === undefined) return undefined;
	const change: Change = rest.length === 0 ? first : { kind: "batch", steps: [first, ...rest] };
	const now = deps.now();
	const undo: Proposal = {
		id: newProposalId(),
		sub: deps.principal.sub,
		appId: deps.principal.appId,
		createdAt: now,
		expiresAt: now + PROPOSAL_TTL_MS,
		change,
		title: deps.copy.result.undoTitle(proposal.title),
		lines: proposal.lines,
		destructive: false,
		state: "open",
	};
	await deps.proposals.put(undo);
	return { proposalId: undo.id, label: deps.copy.result.undo };
}

/**
 * Executes a proposal the person confirmed, once. In order: the proposal must exist for this very
 * person and app, be open and unexpired (claimed atomically, so a double click runs one); the
 * person must still be who they were; what it was prepared against must still be true; the audit
 * entry for the start must be recorded (no record, no write); only then the service is called,
 * with the same token, so its own permission check answers. Anything refused is final. A change
 * that can be reversed comes back with a prepared undo.
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
	const settle = async (status: ConfirmStatus, extra?: Parameters<typeof resultCard>[3]) => {
		await deps.proposals.finish(proposal.id, "done");
		return resultCard(copy, proposal, status, extra);
	};
	const who = read(await port.whoami());
	if (!who.ok || who.value.sub !== principal.sub || who.value.appId !== principal.appId) {
		return settle("no_principal");
	}
	const subjects = [...subjectsOf(proposal.change)];
	const tool = proposal.change.kind;
	const verdict = await stillCurrent(port, proposal.change);
	if (verdict !== "current") {
		await audit(port, {
			tool,
			phase: "refused",
			outcome: "refused",
			subjects,
			proposalId: proposal.id,
			reason: verdict,
		});
		return settle(verdict);
	}
	if (
		!(await audit(port, {
			tool,
			phase: "execute_start",
			outcome: "ok",
			subjects,
			proposalId: proposal.id,
		}))
	) {
		return settle("audit_failed");
	}
	const done = await perform(port, copy, proposal.change);
	await audit(port, {
		tool,
		phase: "execute",
		outcome: done.refusal === undefined ? "ok" : "refused",
		subjects,
		proposalId: proposal.id,
		...(done.refusal === undefined ? {} : { reason: done.refusal }),
	});
	const total = proposal.change.kind === "batch" ? proposal.change.steps.length : 1;
	const progress = total > 1 ? [{ label: "", value: copy.result.progress(done.ran, total) }] : [];
	const undo = await prepareUndo(deps, proposal, done.undo);
	return settle(done.refusal ?? "done", {
		links: done.links,
		lines: [...progress, ...done.lines],
		...(undo === undefined ? {} : { undo }),
	});
}

/** The person chose not to: the proposal is closed so it can never be confirmed later. */
export async function dismissProposal(
	deps: Pick<ConfirmDeps, "principal" | "proposals">,
	proposalId: string,
): Promise<boolean> {
	return deps.proposals.dismiss(proposalId, deps.principal.sub, deps.principal.appId);
}
