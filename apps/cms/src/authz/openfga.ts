import { z } from "zod";
import { type Authorizer, BRANDS, type Brand, type Relation, type Subject } from "./types";

/**
 * psi's OpenFGA, through SEB's read-only filter (`authzfilter`, :8081, which allows check and
 * list-objects and refuses every write). The person is `user:<directory subject>`; the object is
 * `cms_brand:<brand>`. Any failure answers "no brands": the CMS fails closed, and says why.
 */
export interface OpenFgaOptions {
	apiUrl: string;
	storeId: string;
	modelId?: string;
	token: string;
	fetch?: typeof fetch;
	onError?: (message: string) => void;
}

const ListObjects = z.object({ objects: z.array(z.string()) });
const BrandValue = z.enum(BRANDS);

export function openFgaAuthorizer(o: OpenFgaOptions): Authorizer {
	const f = o.fetch ?? fetch;
	return {
		kind: "openfga",
		async brands(s: Subject, relation: Relation): Promise<Brand[]> {
			// Break-glass has no directory subject: OpenFGA knows only people from the directory.
			if (s.sub === null) return [];
			try {
				const r = await f(`${o.apiUrl}/stores/${encodeURIComponent(o.storeId)}/list-objects`, {
					method: "POST",
					headers: { "content-type": "application/json", authorization: `Bearer ${o.token}` },
					body: JSON.stringify({
						...(o.modelId === undefined ? {} : { authorization_model_id: o.modelId }),
						type: "cms_brand",
						relation,
						user: `user:${s.sub}`,
					}),
					signal: AbortSignal.timeout(3000),
				});
				if (!r.ok) throw new Error(`list-objects answered ${r.status}`);
				const { objects } = ListObjects.parse(await r.json());
				return objects.flatMap((obj) => {
					const b = BrandValue.safeParse(obj.replace(/^cms_brand:/, ""));
					return b.success ? [b.data] : [];
				});
			} catch (err) {
				o.onError?.(`openfga: ${err instanceof Error ? err.message : String(err)}`);
				return [];
			}
		},
	};
}
