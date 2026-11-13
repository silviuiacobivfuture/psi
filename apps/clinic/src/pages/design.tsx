import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { Page } from "../chrome";
import type { Locale } from "../lib/i18n";
import type { Appointment, Client } from "../port/schema";
import { AppointmentTile, type TileVariant } from "./appt-tile";

const client: Client = {
	id: "c1",
	name: "Ștefan Exemplu 01",
	guardian: null,
	phone: null,
	email: null,
	status: "current",
	note: "",
	practitionerId: null,
};
const base: Appointment = {
	id: "a",
	date: "2026-11-16",
	startMin: 600,
	durationMin: 50,
	columnId: "p1",
	clientId: "c1",
	title: null,
	serviceId: "s1",
	status: "confirmed",
	note: "",
};
const SAMPLES: ReadonlyArray<Appointment> = [
	base,
	{ ...base, status: "requested" },
	{ ...base, status: "attended", durationMin: 90 },
	{ ...base, status: "no-show", durationMin: 45 },
	{ ...base, status: "cancelled" },
	{ ...base, title: "Sală de grup", clientId: null, status: "confirmed", durationMin: 60 },
];

function Sheet({
	variant,
	theme,
	locale,
}: {
	variant: TileVariant;
	theme: "admin-light" | "admin-dark";
	locale: Locale;
}): JSX.Element {
	return (
		<div data-theme={theme} class="design__sheet">
			<h3 class="adm-h2">
				{variant} · {theme}
			</h3>
			<div class="design__grid">
				{SAMPLES.map((a, i) => (
					<AppointmentTile
						key={a.id + i}
						appt={a}
						client={client}
						serviceName="Terapie individuală"
						colour={(i % 6) + 1}
						locale={locale}
						dayStart={480}
						variant={variant}
						placed={false}
					/>
				))}
			</div>
		</div>
	);
}

/** A hidden sheet for comparing appointment tile variants, both themes side by side. Not linked anywhere. */
export function registerDesign(app: Hono<Env>): void {
	app.get("/design", async (c) => {
		const ctx = c.var.ctx;
		return c.html(
			await Page({
				ctx,
				current: "more",
				title: "Design",
				children: (
					<div class="adm-page adm-page--wide design">
						{(["wash", "glass", "ink"] as const).map((v) => (
							<div key={v} class="design__row">
								<Sheet variant={v} theme="admin-light" locale={ctx.locale} />
								<Sheet variant={v} theme="admin-dark" locale={ctx.locale} />
							</div>
						))}
					</div>
				),
			}),
		);
	});
}
