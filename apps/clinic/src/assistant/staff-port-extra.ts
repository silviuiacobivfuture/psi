import type { ActionInfo, ActionOutcome, StaffPage, StaffPort } from "@psi/engine/staff";
import type { ClinicPort } from "../port/port";
import type { AppSlug } from "../port/schema";
import { ok, refused, wrap } from "./staff-result";

/**
 * The console's action registry as the assistant uses it (`apps/clinic/src/actions`): what this
 * person may do on a screen, and running one of them. The registry answers for the person it was
 * made for, so what it lists is what they hold the capability for.
 */
export interface ActionsSource {
	listActions(ctx: StaffPage | undefined): Promise<ReadonlyArray<ActionInfo>>;
	runAction(id: string, params: Record<string, unknown>): Promise<ActionOutcome>;
}

export interface ExtraOptions {
	port: ClinicPort;
	app: AppSlug;
	actor: string;
	readOnly: boolean;
	actions: ActionsSource | undefined;
}

/**
 * The assistant's calls that are not the console's screens one by one: adding a client, and the
 * registry's discovery and running. Without a registry nothing is listed and nothing runs.
 */
export function extraMethods(
	o: ExtraOptions,
): Pick<StaffPort, "createClient" | "listActions" | "runAction"> {
	const { port, app, actions } = o;
	return {
		createClient: (i) =>
			wrap(async () => {
				if (o.readOnly) return refused("forbidden");
				const made = await port.createClient(app, {
					name: i.name,
					phone: i.phone ?? null,
					guardian: i.guardian ?? null,
					email: i.email ?? null,
					...(i.birthYear === undefined ? {} : { birthYear: i.birthYear }),
				});
				await port.appendAudit(app, {
					actor: `${o.actor} · assistant`,
					action: "assistant.client.create",
					target: made.id,
				});
				return ok({ id: made.id, name: made.name });
			}),
		listActions: (page) =>
			wrap(async () => ok(actions === undefined ? [] : await actions.listActions(page))),
		runAction: (call) =>
			wrap(async () => {
				if (o.readOnly || actions === undefined) return refused("forbidden");
				const outcome = await actions.runAction(call.id, call.params);
				await port.appendAudit(app, {
					actor: `${o.actor} · assistant`,
					action: `assistant.action.${call.id}`,
					target: call.id,
				});
				return ok(outcome);
			}),
	};
}
