import { z } from "zod";
import { m } from "../paraglide/messages.js";
import { define, label } from "./define";
import type { ActionDef } from "./types";

/** An account's id: the hash the service names it by. */
const account = z.string().regex(/^[0-9a-f]{64}$/);
const client = z.string().min(1).max(64);

/**
 * Online accounts that booked with a client's e-mail or phone, waiting for the team: say which client the account is,
 * or that it is none of them. The page and the assistant run the same actions.
 */
export const LINK_ACTIONS: ReadonlyArray<ActionDef> = [
	define({
		id: "client.linkAccount",
		tier: "daily",
		entity: "client",
		label: label((o) => m.al_confirm({}, o)),
		icon: "check",
		placements: { screen: ["clients"], palette: ["global"] },
		mobile: "list",
		needs: { write: ["clients_invite"] },
		route: { method: "POST", path: "/account-links/:id/confirm" },
		confirm: "none",
		to: () => "/account-links",
		params: z.object({ id: account, clientId: client }),
		run: async (ctx, p) => {
			await ctx.port.confirmAccountLink(ctx.app, p.id, p.clientId);
			return { status: "ok", to: "/account-links?done=linked" };
		},
	}),
	define({
		id: "client.dismissAccountLink",
		tier: "daily",
		entity: "client",
		label: label((o) => m.al_dismiss({}, o)),
		icon: "x",
		placements: { screen: ["clients"], palette: ["global"] },
		mobile: "list",
		needs: { write: ["clients_invite"] },
		route: { method: "POST", path: "/account-links/:id/dismiss" },
		confirm: "none",
		to: () => "/account-links",
		params: z.object({ id: account }),
		run: async (ctx, p) => {
			await ctx.port.dismissAccountLink(ctx.app, p.id);
			return { status: "ok", to: "/account-links?done=dismissed" };
		},
	}),
];
