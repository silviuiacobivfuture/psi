import { ASSISTANT_ACTIONS } from "./registry-assistant";
import { CATALOG_ACTIONS } from "./registry-catalog";
import { CLIENT_ACTIONS } from "./registry-client";
import { DAILY_ACTIONS } from "./registry-daily";
import { LINK_ACTIONS } from "./registry-links";
import { ME_ACTIONS } from "./registry-me";
import { MEMBER_ACTIONS } from "./registry-members";
import { ORG_ACTIONS } from "./registry-org";
import { ROLE_MATRIX_ACTIONS } from "./registry-roles";
import type { ActionDef } from "./types";

/**
 * EVERY user action of the console, once: its labels (messages), icon, where it appears (screen, entity menu, empty
 * state, command palette, primary button), what it needs, the route that does it, how it confirms, and where a phone
 * puts it. Buttons, "⋯" menus, empty states and the palette render from here; the gates read the routes from here; the
 * assistant lists and runs actions through `listActions` and `runAction`.
 */
export const ACTIONS: ReadonlyArray<ActionDef> = [
	...DAILY_ACTIONS,
	...CLIENT_ACTIONS,
	...LINK_ACTIONS,
	...CATALOG_ACTIONS,
	...ASSISTANT_ACTIONS,
	...ME_ACTIONS,
	...ORG_ACTIONS,
	...MEMBER_ACTIONS,
	...ROLE_MATRIX_ACTIONS,
];

const ids = ACTIONS.map((a) => a.id);
if (new Set(ids).size !== ids.length) throw new Error("the action registry holds a duplicate id");
