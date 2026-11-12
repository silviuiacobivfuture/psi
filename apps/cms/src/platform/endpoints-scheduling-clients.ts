import { IMPORT_MAX_ROWS, readClients, templateCsv } from "@psi/scheduling";
import type { Endpoint } from "payload";
import { z } from "zod";
import { BRANDS } from "../authz/types";
import { action, reasons } from "./scheduling-action";

/**
 * The client import, for the team to run from the calendar's tools or a script: POST the owner's
 * CSV text (the template, `GET /api/platform/scheduling/clients/template`). `commit` defaults to
 * false: a dry run reads, checks and reports (rows refused with their line and reason,
 * duplicates by phone, e-mail or guardian) and writes nothing; the same call with `commit: true`
 * stores the good rows that are not duplicates. `calendar_manager` on the brand. The answer and
 * the log carry counts and line numbers, never a name or a contact.
 */
const Import = z.object({
	brand: z.enum(BRANDS),
	csv: z.string().min(1).max(2_000_000),
	commit: z.boolean().default(false),
});

const importClients = action("clients/import", Import, async (b, { tenant, actor, staff }) => {
	const read = readClients(b.csv);
	if (read.problems.some((p) => p.problem === "header")) return reasons("invalid");
	let created = 0;
	const duplicates: Array<{ line: number; with: string; by: string; otherLine?: number }> = [];
	for (let i = 0; i < read.rows.length; i += IMPORT_MAX_ROWS) {
		const batch = read.rows.slice(i, i + IMPORT_MAX_ROWS);
		const r = await staff.importClients({ tenant, rows: batch, commit: b.commit, actor });
		if (!r.ok) return reasons("invalid");
		created += r.created;
		duplicates.push(...r.duplicates);
	}
	return {
		ok: true,
		committed: b.commit,
		rows: read.rows.length,
		created,
		duplicates,
		refused: read.problems,
		target: "clients",
		note: `client import ${b.commit ? "committed" : "dry run"}: ${read.rows.length} rows, ${created} new, ${duplicates.length} duplicates, ${read.problems.length} refused`,
	};
});

const template: Endpoint = {
	path: "/platform/scheduling/clients/template",
	method: "get",
	handler: () =>
		new Response(templateCsv(), {
			headers: {
				"content-type": "text/csv; charset=utf-8",
				"content-disposition": 'attachment; filename="clients-import-template.csv"',
			},
		}),
};

export const schedulingClientsEndpoints: Endpoint[] = [importClients, template];
