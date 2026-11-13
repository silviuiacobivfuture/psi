/**
 * The live change feed: every clinic mutation appends `{ kind, entityId, at, version }` to a
 * per-app log, with no content, so a console can refresh exactly what moved. The log is kept 7
 * days; a reader whose cursor is older than that starts again from the full lists.
 */
export const CHANGE_KINDS = [
	"client",
	"visit",
	"package",
	"payment",
	"roster",
	"staff_block",
	"record",
	"file",
	"person",
	"room",
	"device",
	"group",
	"role",
	"member",
	"override",
	"builder",
	"form",
	"setting",
	"audit",
	"blacklist",
	"feedback",
] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export const CHANGE_LOG_DAYS = 7;
export const CHANGES_PAGE = 200;
