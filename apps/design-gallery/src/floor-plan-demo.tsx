import { Doctype } from "@psi/ui";
import {
	FLOOR_PLAN_LABELS,
	FloorPlan,
	floorPlanRoutes,
	type LiveData,
	type LiveSource,
	loadLiveData,
	memoryPort,
	type PlanLocale,
	snapInstant,
} from "@psi/ui/admin/floor-plan";
import { Hono } from "hono";
import { DEVICES, ROOMS, seedLive, seedPlan } from "./floor-plan-seed";
import { m } from "./paraglide/messages.js";

const TZ = "Europe/Bucharest";
const FONTS =
	"https://fonts.googleapis.com/css2?family=Manrope:wght@400..800&family=Inter:wght@400..700&display=swap";
const THEMES = ["psizone-light", "psizone-dark"] as const;
const BASE = "/floor-plan";
const API = `${BASE}/api`;

function localMidnight(now: number): number {
	const d = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(now));
	const [y = 0, mo = 1, da = 1] = d.split("-").map(Number);
	const guess = Date.UTC(y, mo - 1, da);
	const probe = new Intl.DateTimeFormat("en-GB", {
		timeZone: TZ,
		hourCycle: "h23",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date(guess));
	const p = Object.fromEntries(
		probe.filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]),
	);
	const off =
		Date.UTC(
			p.year ?? 0,
			(p.month ?? 1) - 1,
			p.day ?? 1,
			p.hour ?? 0,
			p.minute ?? 0,
			p.second ?? 0,
		) - guess;
	return guess - off;
}

function mondayStart(now: number): number {
	const today = localMidnight(now);
	const dow = new Date(today + 12 * 3_600_000).getUTCDay();
	return today - ((dow + 6) % 7) * 24 * 3_600_000;
}

/** The demo, as a Hono app mounted at /floor-plan: a synthetic clinic, an in-memory port, and a feed a button can poke. */
export function floorPlanDemo(options: { now?: () => number } = {}): Hono {
	const now = options.now ?? Date.now;
	const port = memoryPort(seedPlan());
	let data: LiveData = seedLive(mondayStart(now()), localMidnight(now()));
	const listeners = new Set<() => void>();
	const source: LiveSource = {
		load: async () => data,
		subscribe: (l) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
	};
	const app = new Hono();

	/** The demo's "who is looking": ?role=viewer drops the settings permission, ?clients=0 the clients one. */
	const authorize = (
		c: { req: { query(k: string): string | undefined; header(k: string): string | undefined } },
		need: "settings" | "calendar" | "clients",
	): boolean => {
		const q = (k: string): string | undefined =>
			c.req.query(k) ??
			new URL(c.req.header("referer") ?? "http://x/").searchParams.get(k) ??
			undefined;
		if (need === "settings") return q("role") !== "viewer";
		if (need === "clients") return q("clients") !== "0";
		return true;
	};

	function routesFor(locale: PlanLocale): Hono {
		return floorPlanRoutes({
			port,
			rooms: async () => ROOMS,
			devices: async () => DEVICES,
			live: source,
			authorize,
			labels: FLOOR_PLAN_LABELS[locale],
			locale,
			timeZone: TZ,
			now,
			endpoint: API,
			id: "plan",
			newBookingHref: (roomId, at) => `${BASE}/new?room=${roomId}&at=${at}`,
		});
	}
	app.route(`${API}/ro`, routesFor("ro"));
	app.route(`${API}/en`, routesFor("en"));

	app.post(`${BASE}/simulate`, (c) => {
		const t = snapInstant(now(), TZ);
		const id = `sim${data.bookings.length}`;
		data = {
			...data,
			bookings: [
				...data.bookings,
				{
					id,
					roomId: "terapie",
					start: t,
					until: t + 50 * 60_000,
					status: "confirmed",
					practitioner: { name: "Elena Vasile", monogram: "EV" },
					service: "Psihoterapie",
					people: 1,
					shared: false,
					clientInitials: ["QX"],
					deviceIds: [],
				},
			],
		};
		for (const l of listeners) l();
		return c.json({ ok: true });
	});
	app.get(`${BASE}/new`, (c) =>
		c.text(`new booking in ${c.req.query("room") ?? "?"} at ${c.req.query("at") ?? "?"} (demo)`),
	);

	const page = (mode: "draw" | "live") => async (c: import("hono").Context) => {
		const locale: PlanLocale = c.req.query("lang") === "en" ? "en" : "ro";
		const theme = THEMES.find((t) => t === c.req.query("theme")) ?? "psizone-light";
		const doc = await port.load();
		const t = c.req.query("at");
		const at = (() => {
			const hm = /^(\d{2}):(\d{2})$/.exec(t ?? "");
			return hm ? localMidnight(now()) + (Number(hm[1]) * 60 + Number(hm[2])) * 60_000 : now();
		})();
		const live = mode === "live" ? await loadLiveData(source, at, TZ) : undefined;
		const q = new URLSearchParams(c.req.query());
		const link = (over: Record<string, string>): string => {
			const p = new URLSearchParams(q);
			for (const [k, v] of Object.entries(over)) p.set(k, v);
			return `?${p.toString()}`;
		};
		const seeClients = c.req.query("clients") !== "0";
		const canDraw = c.req.query("role") !== "viewer";
		if (mode === "draw" && !canDraw) return c.text("forbidden", 403);
		return c.html(
			<>
				<Doctype />
				<html lang={locale} data-theme={theme}>
					<head>
						<meta charset="utf-8" />
						<meta name="viewport" content="width=device-width, initial-scale=1" />
						<title>{m.floor_title({}, { locale })}</title>
						<link rel="stylesheet" href={FONTS} />
						<link rel="stylesheet" href="/assets/app.css" />
						<script type="module" src="/assets/datastar.js" />
					</head>
					<body style="margin:0;background:var(--bg);color:var(--ink);font-family:Manrope,Inter,system-ui,sans-serif">
						<header style="display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;padding:.75rem 1rem;border-bottom:1px solid var(--line-strong)">
							<strong>{m.floor_title({}, { locale })}</strong>
							<nav
								aria-label={m.floor_options({}, { locale })}
								style="display:flex;gap:.5rem;flex-wrap:wrap"
							>
								{THEMES.map((th) => (
									<a
										class="pz-fp__btn"
										href={link({ theme: th })}
										aria-current={th === theme ? "true" : undefined}
									>
										{th === "psizone-light"
											? m.floor_light({}, { locale })
											: m.floor_dark({}, { locale })}
									</a>
								))}
								<a class="pz-fp__btn" href={link({ lang: locale === "ro" ? "en" : "ro" })}>
									{locale === "ro" ? "EN" : "RO"}
								</a>
								{mode === "live" ? (
									<button
										type="button"
										class="pz-fp__btn"
										data-on:click={`@post('${BASE}/simulate')`}
									>
										{m.floor_simulate({}, { locale })}
									</button>
								) : null}
							</nav>
						</header>
						<main style="padding:1rem;max-width:90rem;margin:0 auto">
							<p style="margin:0 0 1rem;color:var(--ink-muted)">{m.floor_lead({}, { locale })}</p>
							<FloorPlan
								id="plan"
								mode={mode}
								doc={doc}
								labels={FLOOR_PLAN_LABELS[locale]}
								locale={locale}
								rooms={ROOMS}
								devices={DEVICES}
								endpoint={`${API}/${locale}`}
								modeLinks={{
									...(canDraw ? { draw: `${BASE}/draw${link({})}` } : {}),
									live: `${BASE}${link({})}`,
								}}
								{...(live
									? {
											live: {
												data: live,
												at,
												now: now(),
												viewer: { seeClients },
												heat: c.req.query("heat") === "1",
												timeZone: TZ,
												...(c.req.query("room") ? { openRoomId: c.req.query("room") ?? "" } : {}),
												newBookingHref: (roomId: string, when: number) =>
													`${BASE}/new?room=${roomId}&at=${when}`,
											},
										}
									: {})}
							/>
						</main>
					</body>
				</html>
			</>,
		);
	};
	app.get(BASE, page("live"));
	app.get(`${BASE}/draw`, page("draw"));
	return app;
}
