import { isRetired } from "@psi/content";
import { type Env, env } from "../env";
import { interimAuthorizer } from "./interim";
import { openFgaAuthorizer } from "./openfga";
import { type Authorizer, BRANDS, type Brand, type Relation, type Subject } from "./types";

/**
 * The break-glass administrator (BREAKGLASS_EMAIL, a local password account the estate seeds,
 * never a directory account) may do everything on every brand, whatever the adapter says: with
 * no bindings yet, or OpenFGA unreachable, the operator is never locked out of the CMS.
 */
export function withBreakGlass(inner: Authorizer, breakGlassEmail: string): Authorizer {
	const email = breakGlassEmail.toLowerCase();
	return {
		kind: inner.kind,
		async brands(s: Subject, relation: Relation): Promise<Brand[]> {
			if (s.sub === null && s.email.toLowerCase() === email) return [...BRANDS];
			return inner.brands(s, relation);
		},
	};
}

let current: Authorizer | undefined;

/** The adapter AUTHZ_ADAPTER names; the OpenFGA one needs OPENFGA_* (env.ts refuses otherwise). */
export function authorizerFor(e: Env): Authorizer {
	return withoutRetired(withBreakGlass(adapterFor(e), e.BREAKGLASS_EMAIL));
}

/**
 * A retired site (`RETIRED_SITES`) has no brand to act on: nobody, the break-glass administrator
 * included, is granted anything on it, so it drops out of every picker, tab, filter and write.
 * Its data stays in the database untouched.
 */
export function withoutRetired(inner: Authorizer): Authorizer {
	return {
		kind: inner.kind,
		async brands(s: Subject, relation: Relation): Promise<Brand[]> {
			return (await inner.brands(s, relation)).filter((b) => !isRetired(b));
		},
	};
}

function adapterFor(e: Env): Authorizer {
	if (
		e.AUTHZ_ADAPTER === "openfga" &&
		e.OPENFGA_API_URL !== undefined &&
		e.OPENFGA_STORE_ID !== undefined &&
		e.OPENFGA_API_TOKEN !== undefined
	) {
		return openFgaAuthorizer({
			apiUrl: e.OPENFGA_API_URL,
			storeId: e.OPENFGA_STORE_ID,
			modelId: e.OPENFGA_MODEL_ID,
			token: e.OPENFGA_API_TOKEN,
			onError: (m) => console.error(m),
		});
	}
	return interimAuthorizer(e.CMS_ROLE_ASSIGNMENTS);
}

/** This process's authorizer, made on first use. */
export function authorizer(): Authorizer {
	current ??= authorizerFor(env());
	return current;
}
