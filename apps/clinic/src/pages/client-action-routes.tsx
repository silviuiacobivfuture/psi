import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { actionCtx } from "../actions/context";
import { runAction } from "../actions/engine";
import type { Env } from "../app";
import { formToData } from "../lib/record-form";
import { FILE_MAX_BYTES, FILE_TYPES, type NewFile } from "../port/schema-clinical";
import { previewable } from "./client-files";
import { renderRecordFiller, renderTemplatePicker } from "./client-records";

type Body = Record<string, string | File | Array<string | File>>;

const STATUS = {
	forbidden: 403,
	"not-found": 404,
	invalid: 422,
	conflict: 409,
	unknown: 404,
	unavailable: 503,
} as const;

/** One action from a posted form: the route's own ids win over anything the form says; the post IS the confirmation. */
async function execute(
	c: Context<Env>,
	id: string,
	params: Record<string, unknown>,
): Promise<Response> {
	const result = await runAction(actionCtx(c.var.ctx), id, params, { confirmed: true });
	if (result.status === "ok") return c.redirect(result.to ?? "/clients", 303);
	if (result.status === "refused") return c.text(result.code, STATUS[result.code]);
	return c.text("confirmation", 400);
}

const strings = (body: Body): Record<string, unknown> =>
	Object.fromEntries(Object.entries(body).filter(([, v]) => typeof v === "string"));

export function registerClientActions(app: Hono<Env>): void {
	const form = (c: Context<Env>): Promise<Body> => c.req.parseBody({ all: true });
	const cid = (c: Context<Env>): string => c.req.param("id") ?? "";

	app.post("/clients", async (c) => execute(c, "client.new", strings(await form(c))));
	app.post("/clients/:id/edit", async (c) =>
		execute(c, "client.edit", { ...strings(await form(c)), id: cid(c) }),
	);
	app.post("/clients/:id/archive", async (c) => execute(c, "client.archive", { id: cid(c) }));
	app.post("/clients/:id/delete", async (c) => execute(c, "client.delete", { id: cid(c) }));

	app.post("/clients/:id/notes", async (c) =>
		execute(c, "note.add", { ...strings(await form(c)), clientId: cid(c) }),
	);
	app.post("/clients/:id/notes/:nid", async (c) =>
		execute(c, "note.edit", {
			...strings(await form(c)),
			clientId: cid(c),
			id: c.req.param("nid"),
		}),
	);
	app.post("/clients/:id/notes/:nid/pin", async (c) =>
		execute(c, "note.pin", { ...strings(await form(c)), clientId: cid(c), id: c.req.param("nid") }),
	);
	app.post("/clients/:id/notes/:nid/delete", async (c) =>
		execute(c, "note.delete", { clientId: cid(c), id: c.req.param("nid") }),
	);

	app.post("/clients/:id/blacklist", async (c) =>
		execute(c, "blacklist.add", { ...strings(await form(c)), clientId: cid(c) }),
	);
	app.post("/clients/:id/blacklist/:bid/end", async (c) =>
		execute(c, "blacklist.end", {
			...strings(await form(c)),
			clientId: cid(c),
			id: c.req.param("bid"),
		}),
	);

	// Records: pick a template, fill it in (draft or final), open it again, delete it.
	const filler = async (c: Context<Env>, recordId: string | null): Promise<Response> => {
		const ctx = c.var.ctx;
		const client = await ctx.port.client(ctx.app, cid(c));
		if (client === null) return c.notFound();
		const templates = await ctx.port.formTemplates(ctx.app);
		const record = recordId === null ? null : await ctx.port.record(ctx.app, recordId);
		if (recordId !== null && (record === null || record.clientId !== client.id))
			return c.notFound();
		const key = record?.formKey ?? c.req.query("form");
		const def = templates.find((t) => t.key === key);
		if (def === undefined)
			return c.html(await renderTemplatePicker(ctx, client, templates), 200, {
				"cache-control": "private, no-store",
			});
		const appointments = ctx.can.has("appointments_view")
			? await ctx.port.clientAppointments(ctx.app, client.id)
			: [];
		return c.html(
			await renderRecordFiller(ctx, client, def, {
				record,
				values: record?.data ?? {},
				appointments,
				appointmentId: record?.appointmentId ?? c.req.query("appt") ?? null,
				invalid: false,
			}),
			200,
			{ "cache-control": "private, no-store" },
		);
	};
	app.get("/clients/:id/records/new", (c) => filler(c, null));
	app.get("/clients/:id/records/:rid", (c) => filler(c, c.req.param("rid")));
	app.post("/clients/:id/records", async (c) => {
		const ctx = c.var.ctx;
		const body = await form(c);
		const templates = await ctx.port.formTemplates(ctx.app);
		const def = templates.find((t) => t.key === body.formKey);
		if (def === undefined) return c.text("invalid", 422);
		const data = formToData(def, body);
		const params = {
			...strings(body),
			clientId: cid(c),
			id: typeof body.id === "string" && body.id !== "" ? body.id : undefined,
			data,
		};
		const result = await runAction(actionCtx(ctx), "record.save", params, { confirmed: true });
		if (result.status === "ok") return c.redirect(result.to ?? `/clients/${cid(c)}/records`, 303);
		if (result.status === "refused" && result.code === "invalid") {
			const client = await ctx.port.client(ctx.app, cid(c));
			if (client === null) return c.notFound();
			return c.html(
				await renderRecordFiller(ctx, client, def, {
					record: null,
					values: data,
					appointments: ctx.can.has("appointments_view")
						? await ctx.port.clientAppointments(ctx.app, client.id)
						: [],
					appointmentId: typeof body.appointmentId === "string" ? body.appointmentId : null,
					invalid: true,
				}),
				422,
			);
		}
		return c.text(
			result.status === "refused" ? result.code : "confirmation",
			result.status === "refused" ? STATUS[result.code] : 400,
		);
	});
	app.post("/clients/:id/records/:rid/delete", async (c) =>
		execute(c, "record.delete", { clientId: cid(c), id: c.req.param("rid") }),
	);

	// Files: upload (several, with a limit), download or preview, rename, delete.
	app.post(
		"/clients/:id/files",
		bodyLimit({
			maxSize: FILE_MAX_BYTES * 4,
			onError: (c) => c.redirect(`/clients/${c.req.param("id")}/files?upload=too-big`, 303),
		}),
		async (c) => {
			const picked = (await form(c)).files;
			const files = (Array.isArray(picked) ? picked : picked === undefined ? [] : [picked]).filter(
				(f): f is File => typeof f !== "string",
			);
			const back = `/clients/${cid(c)}/files`;
			if (files.length === 0) return c.redirect(`${back}?upload=invalid`, 303);
			if (files.some((f) => f.size > FILE_MAX_BYTES))
				return c.redirect(`${back}?upload=too-big`, 303);
			if (files.some((f) => f.size === 0 || !FILE_TYPES.includes(f.type)))
				return c.redirect(`${back}?upload=invalid`, 303);
			const read: NewFile[] = await Promise.all(
				files.map(async (f) => ({
					name: f.name,
					contentType: f.type,
					bytes: new Uint8Array(await f.arrayBuffer()),
				})),
			);
			const result = await runAction(
				actionCtx(c.var.ctx),
				"file.upload",
				{ clientId: cid(c), files: read },
				{ confirmed: true },
			);
			if (result.status === "ok") return c.redirect(back, 303);
			return result.status === "refused" && result.code === "invalid"
				? c.redirect(`${back}?upload=invalid`, 303)
				: c.text(
						result.status === "refused" ? result.code : "confirmation",
						result.status === "refused" ? STATUS[result.code] : 400,
					);
		},
	);
	app.get("/clients/:id/files/:fid/download", async (c) => {
		const ctx = c.var.ctx;
		const own = (await ctx.port.files(ctx.app, cid(c))).find((f) => f.id === c.req.param("fid"));
		if (own === undefined) return c.notFound();
		const file = await ctx.port.downloadFile(ctx.app, own.id);
		// The list the file was found in names it and types it; the store answers only the bytes.
		const inline = c.req.query("inline") === "1" && previewable(own.contentType);
		const name = encodeURIComponent(own.name);
		return new Response(new Uint8Array(file.bytes), {
			headers: {
				"content-type": own.contentType,
				"content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
				"x-content-type-options": "nosniff",
				"content-security-policy": "sandbox",
				"cache-control": "private, no-store",
			},
		});
	});
	app.post("/clients/:id/files/:fid/rename", async (c) =>
		execute(c, "file.rename", {
			...strings(await form(c)),
			clientId: cid(c),
			id: c.req.param("fid"),
		}),
	);
	app.post("/clients/:id/files/:fid/delete", async (c) =>
		execute(c, "file.delete", { clientId: cid(c), id: c.req.param("fid") }),
	);
}
