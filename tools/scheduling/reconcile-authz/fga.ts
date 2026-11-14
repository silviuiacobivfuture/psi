import type { Tuple } from "@psi/scheduling-api/authz-port";
import { z } from "zod";

/** The object types this service owns in OpenFGA (the prune reads these and nothing else). */
export const SCHED_TYPES = [
	"sched_app",
	"sched_role",
	"sched_calendar",
	"sched_room",
	"sched_device",
	"sched_client",
	"sched_appointment",
	"sched_package",
	"sched_record",
	"sched_file",
] as const;

const Page = z.object({
	tuples: z
		.array(
			z.object({ key: z.object({ user: z.string(), relation: z.string(), object: z.string() }) }),
		)
		.default([]),
	continuation_token: z.string().default(""),
});

export interface FgaReader {
	/** Every tuple whose object is of this type. */
	ofType(type: string): Promise<Tuple[]>;
}

/**
 * OpenFGA's Read, paged. A Read naming only an object TYPE needs a user too, so the store is read whole, once per
 * reader, and each type's tuples are taken from it. Never prints the token or a response body.
 */
export function createFgaReader(options: {
	url: string;
	storeId: string;
	token: string;
	fetch?: typeof globalThis.fetch;
}): FgaReader {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	let all: Promise<Tuple[]> | undefined;
	const readAll = async (): Promise<Tuple[]> => {
		const out: Tuple[] = [];
		let token = "";
		do {
			const res = await doFetch(
				`${options.url.replace(/\/+$/, "")}/stores/${options.storeId}/read`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${options.token}`,
					},
					body: JSON.stringify({
						page_size: 100,
						...(token === "" ? {} : { continuation_token: token }),
					}),
					signal: AbortSignal.timeout(15_000),
				},
			);
			if (!res.ok) throw new Error(`OpenFGA read answered ${res.status}`);
			const page = Page.parse(await res.json());
			for (const t of page.tuples) out.push(t.key);
			token = page.continuation_token;
		} while (token !== "");
		return out;
	};
	return {
		async ofType(type) {
			all ??= readAll();
			return (await all).filter((t) => t.object.startsWith(`${type}:`));
		},
	};
}
