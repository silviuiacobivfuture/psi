import { PortError } from "./port";
import type { AppSlug, Client } from "./schema";
import type { AccountLink } from "./schema-links";

/** A suggestion the fake starts with: the account's id and the clients it could be. */
export interface FakeLinkSeed {
	app: AppSlug;
	id: string;
	via: "email" | "phone";
	reference?: string;
	candidates: ReadonlyArray<string>;
}

export interface FakeLinkHost {
	guard(method: "accountLinks" | "confirmAccountLink" | "dismissAccountLink"): void;
	client(app: AppSlug, id: string): Client | undefined;
	now(): number;
	log(app: AppSlug, action: string, target: string): void;
}

/**
 * Linking online accounts to clients as the in-memory port plays it: the same answers and refusals as the service (a
 * client that is not a candidate is not found, a client another account has is a conflict), with nothing to match from,
 * so a test seeds the suggestions.
 */
export function createFakeAccountLinks(host: FakeLinkHost, seeds: ReadonlyArray<FakeLinkSeed>) {
	const waiting = new Map(seeds.map((s) => [`${s.app}/${s.id}`, { ...s, at: host.now() }]));
	const linked = new Map<string, string>();
	const take = (app: AppSlug, id: string) => {
		const held = waiting.get(`${app}/${id}`);
		if (held === undefined) throw new PortError("not-found", "account link");
		return held;
	};
	return {
		async accountLinks(app: AppSlug): Promise<ReadonlyArray<AccountLink>> {
			host.guard("accountLinks");
			return [...waiting.values()]
				.filter((s) => s.app === app)
				.flatMap((s) => {
					const candidates = s.candidates.flatMap((id) => {
						const c = host.client(app, id);
						return c === undefined ? [] : [{ clientId: id, name: c.name }];
					});
					const [first, ...rest] = candidates;
					return first === undefined
						? []
						: [
								{
									id: s.id,
									via: s.via,
									...(s.reference === undefined ? {} : { reference: s.reference }),
									at: s.at,
									candidates: [first, ...rest],
								},
							];
				})
				.sort((a, b) => b.at - a.at);
		},
		async confirmAccountLink(app: AppSlug, id: string, clientId: string): Promise<void> {
			host.guard("confirmAccountLink");
			const held = take(app, id);
			if (!held.candidates.includes(clientId)) throw new PortError("not-found", "candidate");
			const other = linked.get(`${app}/${clientId}`);
			if (other !== undefined && other !== id) throw new PortError("conflict", "linked_elsewhere");
			linked.set(`${app}/${clientId}`, id);
			waiting.delete(`${app}/${id}`);
			host.log(app, "client.account_link", clientId);
		},
		async dismissAccountLink(app: AppSlug, id: string): Promise<void> {
			host.guard("dismissAccountLink");
			const held = take(app, id);
			waiting.delete(`${app}/${id}`);
			host.log(app, "client.account_link_dismiss", held.candidates[0] ?? id);
		},
	};
}
