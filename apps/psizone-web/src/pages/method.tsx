import { Button, HubCard, type Hue, Prose } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { HUBS } from "../content/hubs";
import { METHODS, type Method } from "../content/methods";
import { at, base } from "../i18n";
import { m } from "../paraglide/messages.js";
import { Closing } from "../sections/closing";
import { TodoBlock } from "../sections/todo";
import { PageShell, type ShellProps } from "./shell";

type Props = Omit<ShellProps, "path">;

const HUES: ReadonlyArray<Hue> = [1, 2, 3];

function hue(i: number): Hue {
	return HUES[i % HUES.length] ?? 1;
}

/** `/metode`: every method, the clinical ones first, then Psizone's own two. */
export function MethodsIndexPage(props: Props): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const b = base(locale);
	const card = (x: Method, i: number) => (
		<HubCard
			class="pz-rise"
			hue={hue(i)}
			eyebrow={x.own ? m.method_own_eyebrow({}, o) : m.method_eyebrow({}, o)}
			title={x.name[locale]}
			text={x.lead[locale]}
			href={`${b}${x.path}`}
		/>
	);
	return (
		<PageShell
			{...props}
			path="/metode"
			eyebrow={m.methods_overline({}, o)}
			title={m.methods_page_title({}, o)}
			lead={m.methods_page_lead({}, o)}
			badge={m.hub_review_badge({}, o)}
		>
			<section class="mx-auto max-w-6xl px-5 py-20" aria-labelledby="metode-clinice">
				<h2 id="metode-clinice" class="text-overline uppercase tracking-[0.14em] text-ink-muted">
					{m.methods_clinical_overline({}, o)}
				</h2>
				<div class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{METHODS.filter((x) => !x.own).map(card)}
				</div>
			</section>
			<section id="proprii" class="border-y border-line bg-surface-1">
				<div class="mx-auto max-w-6xl px-5 py-20">
					<p class="text-overline uppercase tracking-[0.14em] text-ink-muted">
						{m.methods_own_overline({}, o)}
					</p>
					<h2 class="display mt-4 max-w-3xl text-display-lg text-ink">
						{m.methods_own_title({}, o)}
					</h2>
					<p class="mt-4 max-w-xl text-body-lg text-ink-muted">{m.methods_own_text({}, o)}</p>
					<div class="mt-10 grid gap-5 sm:grid-cols-2">
						{METHODS.filter((x) => x.own).map(card)}
					</div>
				</div>
			</section>
			<Closing locale={locale} />
		</PageShell>
	);
}

/** `/metode/<slug>`: what it is, how we use it, where, and what the specialists still owe. */
export function MethodPage(props: Props & { method: Method }): JSX.Element {
	const { locale, method } = props;
	const o = at(locale);
	const b = base(locale);
	const hubs = HUBS.filter((h) => method.hubs.includes(h.id));
	return (
		<PageShell
			{...props}
			path={method.path}
			back={{ label: m.nav_all_methods({}, o), href: `${b}/metode` }}
			eyebrow={method.own ? m.method_own_eyebrow({}, o) : m.method_eyebrow({}, o)}
			title={method.name[locale]}
			lead={method.lead[locale]}
			badge={method.own ? m.draft_badge({}, o) : m.hub_review_badge({}, o)}
		>
			<section class="mx-auto grid max-w-6xl gap-14 px-5 py-20 lg:grid-cols-[1.2fr_1fr]">
				<div class="space-y-14">
					{method.what.length > 0 ? (
						<div>
							<h2 class="display text-display-md text-ink">{m.method_what({}, o)}</h2>
							<Prose class="mt-6">
								{method.what.map((p) => (
									<p>{p[locale]}</p>
								))}
							</Prose>
						</div>
					) : null}
					{method.atPsizone.length > 0 ? (
						<div>
							<h2 class="display text-display-md text-ink">{m.method_at_psizone({}, o)}</h2>
							<Prose class="mt-6">
								{method.atPsizone.map((p) => (
									<p>{p[locale]}</p>
								))}
							</Prose>
						</div>
					) : null}
					{method.external ? (
						<div>
							<Button variant="outline" arrow href={method.external.href}>
								{method.external.label[locale]}
							</Button>
						</div>
					) : null}
				</div>
				<TodoBlock locale={locale} items={method.todo} class="self-start" />
			</section>
			{hubs.length > 0 ? (
				<section class="border-t border-line bg-surface-1">
					<div class="mx-auto max-w-6xl px-5 py-20">
						<h2 class="display text-display-md text-ink">{m.method_hubs({}, o)}</h2>
						<div class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
							{hubs.map((h) => (
								<HubCard
									class="pz-rise"
									hue={h.hue}
									eyebrow={h.eyebrow(o)}
									title={h.title(o)}
									text={h.text(o)}
									href={`${b}${h.path}`}
								/>
							))}
						</div>
					</div>
				</section>
			) : null}
			<Closing locale={locale} />
		</PageShell>
	);
}
