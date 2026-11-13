import { writeAudit } from "../http/audit";
import type { Deps } from "../http/context";
import type { NotifyPort } from "../ports/notify";
import { StoreRefused } from "../store/types";
import { type Held, type InviteRow, invites, isStale } from "./records";

/** What activating an invitation needs: the store, the clock, the audit log and the means to say "your account is active". */
export interface ActivateEnv {
	deps: Pick<Deps, "store" | "clock">;
	port: NotifyPort;
}

/**
 * An invited account has signed in: the invitation becomes `active`, once (a compare-and-set, so two callers racing
 * activate it once), with an audit event and the "your account is active" e-mail. Returns whether THIS call did it. The
 * caller is a site's request (the account itself) or the scheduler noticing a sign-in at the provider.
 */
export async function activateInvite(
	env: ActivateEnv,
	app: string,
	held: Held<InviteRow>,
	actor: { subject: string; kind: "person" | "service" },
): Promise<boolean> {
	if (held.row.status !== "invited") return false;
	const now = env.deps.clock();
	try {
		await invites(env.deps.store.keyed).put(
			app,
			{ ...held.row, status: "active", activatedAt: now },
			held.revision,
		);
	} catch (error) {
		if (isStale(error) || error instanceof StoreRefused) return false;
		throw error;
	}
	await writeAudit(env.deps, {
		app,
		actor,
		action: "client.invite_activated",
		target: { type: "client", id: held.row.clientId },
		detail: { contact: held.row.contact },
	});
	try {
		await env.port.notify({
			app,
			event: "account.activated",
			to: { kind: "client", clientId: held.row.clientId },
			payload: {
				clientId: held.row.clientId,
				contact: held.row.contact,
				locale: held.row.locale,
			},
			idempotencyKey: `${app}:account.activated:${held.row.tokenId}`,
		});
	} catch {
		// The account is active either way; the thank-you is not worth failing for.
	}
	return true;
}
