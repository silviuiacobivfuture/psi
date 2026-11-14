import type { Capabilities } from "../port/port";
import type { FieldGroupName, ScopeName } from "../port/schema";
import { PLATFORM_KEY } from "./areas";

/**
 * What the screens ask. It answers from the capabilities the service gave for THIS request; it is a hint for what to
 * offer. The service authorizes every call again, and the console never keeps these answers from one request to the next.
 */
export interface Can {
	/** The person holds this permission (at any scope). */
	has(key: string): boolean;
	/** Holds any of them. */
	any(...keys: string[]): boolean;
	/** May WRITE with it: held, and not looking at the app as someone else (that view is read-only). */
	write(key: string): boolean;
	/** The scopes held (`["all"]` app-wide; `[]` not held). */
	scopes(key: string): ReadonlyArray<ScopeName>;
	/** Only their own / assigned rows: the permission is held but not on everything. */
	narrowed(key: string): boolean;
	/** May see this field group on some clients. */
	group(group: FieldGroupName): boolean;
	readonly readOnly: boolean;
}

export function canOf(caps: Capabilities, readOnly: boolean): Can {
	const has = (key: string): boolean =>
		key === PLATFORM_KEY ? caps.platformAdmin : Object.hasOwn(caps.permissions, key);
	return {
		readOnly,
		has,
		any: (...keys) => keys.some(has),
		write: (key) => !readOnly && has(key),
		scopes: (key) => caps.permissions[key] ?? [],
		narrowed: (key) => {
			const s = caps.permissions[key] ?? [];
			return s.length > 0 && !s.includes("all");
		},
		group: (g) => caps.fieldGroups.includes(g),
	};
}
