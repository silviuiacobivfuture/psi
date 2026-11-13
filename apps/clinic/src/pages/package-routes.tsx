import { inlineValue, toastElement } from "@psi/ui/admin";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { Env } from "../app";
import { parseMoney } from "../domain/money";
import { parseAmountOrZero, parseCount } from "../domain/numbers";
import { todayIso } from "../lib/dates";
import { refusalText } from "../lib/failures";
import { at } from "../lib/i18n";
import { signalsOf, sse } from "../lib/sse";
import { m } from "../paraglide/messages.js";
import { PortError } from "../port/port";
import {
	IsoDateSchema,
	NewPackageSchema,
	type Package,
	type PackagePatch,
	PackagePatchSchema,
	PaymentMethodSchema,
} from "../port/schema";
import { PackageCard, type PackageField } from "./package-card";

const FieldSchema = z.enum(["name", "sessions", "bonus", "total", "note"]);
const AnySignals = z.object({}).passthrough();
const PaySignals = z.object({
	pay: z.record(
		z.object({
			a: z.string().max(24),
			k: PaymentMethodSchema,
			d: IsoDateSchema,
		}),
	),
});

/** What a typed value means for one field, or null when it cannot be read (never NaN). */
export function patchFor(field: PackageField, value: string): PackagePatch | null {
	const raw = ((): Record<string, unknown> | null => {
		switch (field) {
			case "name":
				return { name: value };
			case "note":
				return { note: value };
			case "sessions": {
				const n = parseCount(value);
				return n === null ? null : { sessions: n };
			}
			case "bonus": {
				const n = parseCount(value);
				return n === null ? null : { bonus: n };
			}
			case "total": {
				const n = parseAmountOrZero(value);
				return n === null ? null : { totalBani: n };
			}
			default: {
				const never: never = field;
				return never;
			}
		}
	})();
	if (raw === null) return null;
	const parsed = PackagePatchSchema.safeParse(raw);
	return parsed.success ? parsed.data : null;
}

async function ownPackage(c: Context<Env>): Promise<Package | null> {
	const ctx = c.var.ctx;
	const own = await ctx.port.packages(ctx.app, c.req.param("id") ?? "");
	return own.find((p) => p.id === c.req.param("pid")) ?? null;
}

async function cardHtml(
	c: Context<Env>,
	clientId: string,
	pid: string,
	saved?: PackageField,
): Promise<string> {
	const ctx = c.var.ctx;
	const [packages, appointments, services] = await Promise.all([
		ctx.port.packages(ctx.app, clientId),
		ctx.port.clientAppointments(ctx.app, clientId),
		ctx.port.services(ctx.app),
	]);
	const pkg = packages.find((p) => p.id === pid);
	if (pkg === undefined) return "";
	return await (
		<PackageCard
			clientId={clientId}
			pkg={pkg}
			appointments={appointments}
			services={services}
			today={todayIso()}
			locale={ctx.locale}
			{...(saved === undefined ? {} : { saved })}
		/>
	).toString();
}

export function registerPackageRoutes(app: Hono<Env>): void {
	// A new package: a plain form, one write, back to the list.
	app.post("/clients/:id/packages", async (c) => {
		const ctx = c.var.ctx;
		const id = c.req.param("id");
		if ((await ctx.port.client(ctx.app, id)) === null) return c.notFound();
		const body = await c.req.parseBody();
		const text = (k: string): string => (typeof body[k] === "string" ? String(body[k]) : "");
		const sessions = parseCount(text("sessions"));
		const bonus = parseCount(text("bonus"));
		const total = parseAmountOrZero(text("total"));
		const input = NewPackageSchema.safeParse({
			name: text("name"),
			sessions: sessions ?? Number.NaN,
			bonus: bonus ?? Number.NaN,
			totalBani: total ?? Number.NaN,
		});
		if (!input.success) return c.redirect(`/clients/${id}/packages?new=invalid`, 303);
		const made = await ctx.port.createPackage(ctx.app, id, input.data);
		return c.redirect(`/clients/${id}/packages?made=${encodeURIComponent(made.id)}`, 303);
	});

	// One field, saved as it is edited: the card comes back with a quiet check on that field.
	app.post("/clients/:id/packages/:pid/field/:field", async (c) => {
		const ctx = c.var.ctx;
		const o = at(ctx.locale);
		const field = FieldSchema.safeParse(c.req.param("field"));
		if (!field.success) return c.notFound();
		if ((await ownPackage(c)) === null) return c.notFound();
		const id = c.req.param("id");
		const pid = c.req.param("pid");
		const body = await signalsOf(c, AnySignals);
		const value = inlineValue(body, `${pid}-${field.data}`);
		return sse(async (stream) => {
			const patch = value === null ? null : patchFor(field.data, value);
			if (patch === null) {
				stream.patchElements(toastElement(m.pkg_invalid_value({}, o), m.dismiss({}, o)));
				stream.patchElements(await cardHtml(c, id, pid));
				return;
			}
			try {
				await ctx.port.updatePackage(ctx.app, id, pid, patch);
			} catch (err) {
				const soon = refusalText(err, ctx.locale);
				if (soon === null && (!(err instanceof PortError) || err.code !== "invalid")) throw err;
				stream.patchElements(toastElement(soon ?? m.pkg_too_few({}, o), m.dismiss({}, o)));
				stream.patchElements(await cardHtml(c, id, pid));
				return;
			}
			stream.patchElements(await cardHtml(c, id, pid, field.data));
		});
	});

	// A payment is added to the ledger, never edited in place.
	app.post("/clients/:id/packages/:pid/payments", async (c) => {
		const ctx = c.var.ctx;
		const o = at(ctx.locale);
		if ((await ownPackage(c)) === null) return c.notFound();
		const id = c.req.param("id");
		const pid = c.req.param("pid");
		const body = await signalsOf(c, PaySignals);
		const row = body?.pay[pid.replace(/\W/g, "_")];
		return sse(async (stream) => {
			const amount = row === undefined ? null : parseMoney(row.a);
			if (row === undefined || amount === null || amount <= 0) {
				stream.patchElements(toastElement(m.pay_invalid({}, o), m.dismiss({}, o)));
				return;
			}
			try {
				await ctx.port.addPayment(
					ctx.app,
					id,
					pid,
					{ date: row.d, amountBani: amount, method: row.k },
					ctx.person.name,
				);
			} catch (err) {
				const soon = refusalText(err, ctx.locale);
				if (soon === null) throw err;
				stream.patchElements(toastElement(soon, m.dismiss({}, o)));
				return;
			}
			stream.patchElements(await cardHtml(c, id, pid));
			stream.patchElements(toastElement(m.pay_saved({}, o), m.dismiss({}, o)));
		});
	});
}
