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

/** OpenFGA's Read, paged, for the objects of one type. Never prints the token or a response body. */
export function createFgaReader(options: {
	url: string;
	storeId: string;
	token: string;
	fetch?: typeof globalThis.fetch;
}): FgaReader {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	return {
		async ofType(type) {
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
							tuple_key: { object: `${type}:` },
							page_size: 100,
							...(token === "" ? {} : { continuation_token: token }),
						}),
						signal: AbortSignal.timeout(15_000),
					},
				);
				if (!res.ok) throw new Error(`OpenFGA read of ${type} answered ${res.status}`);
				const page = Page.parse(await res.json());
				for (const t of page.tuples) out.push(t.key);
				token = page.continuation_token;
			} while (token !== "");
			return out;
		},
	};
}
