import { expect } from "vitest";
import type { Notification } from "../ports/notify";
import type { Populated } from "./populate";

const A = "/v1/apps/psizone";

/** The helpers the invitation tests share: calls as a person or as a site, what was sent, what was audited, a client to invite. */
export function inviteKit(world: () => Populated) {
	const as = (who: string, method: string, path: string, body?: unknown) =>
		world().call(who, method, `${A}${path}`, body);
	const invite = (clientId: string, body: Record<string, unknown> = { contact: "client" }) =>
		as("olga", "POST", `/clients/${clientId}/invite`, body);
	const state = async (clientId: string) =>
		(await as("olga", "GET", `/clients/${clientId}/invite`)).json.invite as Record<
			string,
			unknown
		> | null;
	const visitor = (subject: string, method: string, path: string, body?: unknown) =>
		world().callKey("psizone-web", method, `${A}${path}`, body, { "x-psi-subject": subject });
	const sent = (event: string): Notification[] =>
		world().notifier.sent.filter((n) => n.event === event);
	const audit = async (action: string) =>
		(await world().store.c.audit.list("psizone")).filter((e) => e.action === action);
	/** A client with an e-mail of their own, and a guardian with another. */
	async function person(over: Record<string, unknown> = {}): Promise<string> {
		const made = await as("olga", "POST", "/clients", {
			name: "Maria Invitata",
			contact: { email: "maria@example.test" },
			guardian: { name: "Tata Invitat", email: "tata@example.test" },
			...over,
		});
		return String(made.json.id);
	}
	/** Runs `act`, and proves it changed nothing: not a row, not the audit log, not a sent notice, not an account. */
	async function writesNothing(
		act: () => Promise<{ status: number; json: Record<string, unknown> }>,
	) {
		const w = world();
		const before = await w.fingerprint();
		const calls = [...w.sso.calls];
		const reply = await act();
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		expect(w.sso.calls.slice(calls.length).filter((c) => !c.startsWith("find:"))).toEqual([]);
		return reply;
	}
	const detail = (r: { json: Record<string, unknown> }) =>
		(r.json.error as { detail?: Record<string, unknown> }).detail;
	return { as, invite, state, visitor, sent, audit, person, writesNothing, detail };
}
