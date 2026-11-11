import {
	AmbientField,
	ArticleCard,
	AskBar,
	AudioPlayer,
	Button,
	Chip,
	GlassCard,
	GuideMessage,
	HubCard,
	Logo,
	PractitionerCard,
	ProductCard,
	ProgramTracker,
	ProgressSignal,
	StatusBadge,
	TextField,
} from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { SWATCHES } from "./themes";

function Heading({ children }: { children: string }): JSX.Element {
	return (
		<h3 class="mb-4 mt-12 text-overline uppercase tracking-[0.14em] text-ink-muted">{children}</h3>
	);
}

/** One theme, every component, on the theme's own ground. */
export function ThemePanel({
	id,
	name,
	locale,
}: {
	id: string;
	name: string;
	locale: Locale;
}): JSX.Element {
	const o = { locale };
	const day = (d: number, state: "done" | "today" | "next"): string =>
		state === "done"
			? m.day_done({ day: String(d) }, o)
			: state === "today"
				? m.day_today({ day: String(d) }, o)
				: m.day_next({ day: String(d) }, o);
	return (
		<section id={id} data-theme={id} class="bg-bg text-ink">
			<div class="mx-auto max-w-6xl px-5 py-20">
				<div class="flex flex-wrap items-center justify-between gap-4">
					<Logo size={32} />
					<span class="font-mono text-body-sm text-ink-muted">{`${name} · ${id}`}</span>
				</div>

				<Heading>{m.palette({}, o)}</Heading>
				<div class="grid grid-cols-5 gap-3 md:grid-cols-10">
					{SWATCHES.map((s) => (
						<div>
							<div
								class="h-14 rounded-md border border-line"
								style={{ background: `var(--${s})` }}
							/>
							<p class="mt-2 font-mono text-[11px] text-ink-muted">{s}</p>
						</div>
					))}
				</div>

				<Heading>{m.type({}, o)}</Heading>
				<p class="pz-display text-display-lg">
					{m.sample_display({}, o).split(" ")[0]}{" "}
					<em class="pz-lumen">{m.sample_display({}, o).split(" ").slice(1).join(" ")}</em>
				</p>
				<p class="mt-4 text-body-lg text-ink-muted">{m.sample_lead({}, o)}</p>
				<p class="mt-2 text-body">{m.sample_body({}, o)}</p>

				<Heading>{m.actions({}, o)}</Heading>
				<div class="flex flex-wrap items-center gap-3">
					<Button arrow>{m.btn_primary({}, o)}</Button>
					<Button variant="glass">{m.btn_glass({}, o)}</Button>
					<Button variant="ghost">{m.btn_ghost({}, o)}</Button>
					<Chip tone="accent">{m.chip_1({}, o)}</Chip>
					<Chip tone="ai">{m.chip_2({}, o)}</Chip>
					<Chip tone="warm">{m.chip_3({}, o)}</Chip>
					<StatusBadge tone="success">{m.status_ok({}, o)}</StatusBadge>
					<StatusBadge tone="warning">{m.status_warn({}, o)}</StatusBadge>
					<StatusBadge tone="danger">{m.status_bad({}, o)}</StatusBadge>
					<StatusBadge tone="info">{m.status_info({}, o)}</StatusBadge>
				</div>

				<Heading>{m.guide({}, o)}</Heading>
				<AmbientField class="rounded-xl p-6 md:p-10">
					<div class="pz-edge mx-auto max-w-3xl rounded-xl p-5">
						<AskBar
							action="#"
							target={`answer-${id}`}
							label={m.ask_label({}, o)}
							placeholder={m.ask_placeholder({}, o)}
							sendLabel={m.ask_send({}, o)}
							suggestions={[m.ask_s1({}, o), m.ask_s2({}, o)]}
						/>
						<div id={`answer-${id}`} class="mt-4 space-y-3">
							<GuideMessage from="user">{m.guide_q({}, o)}</GuideMessage>
							<GuideMessage sources={[{ label: m.guide_source({}, o), href: "#" }]}>
								{m.guide_answer({}, o)}
							</GuideMessage>
						</div>
					</div>
				</AmbientField>

				<Heading>{m.cards({}, o)}</Heading>
				<div class="grid gap-5 md:grid-cols-3">
					<HubCard
						hue={1}
						eyebrow={m.hub_eyebrow({}, o)}
						title={m.hub_1({}, o)}
						text={m.hub_text({}, o)}
						href="#"
					/>
					<HubCard
						hue={2}
						eyebrow={m.hub_eyebrow({}, o)}
						title={m.hub_2({}, o)}
						text={m.hub_text({}, o)}
						href="#"
					/>
					<HubCard
						hue={3}
						eyebrow={m.hub_eyebrow({}, o)}
						title={m.hub_3({}, o)}
						text={m.hub_text({}, o)}
						href="#"
					/>
				</div>
				<div class="mt-5 grid gap-5 md:grid-cols-3">
					<PractitionerCard
						name="Ana Popescu"
						role={m.person_role({}, o)}
						specialties={[m.person_tag({}, o)]}
					/>
					<ArticleCard
						title={m.article_title({}, o)}
						topic={m.article_topic({}, o)}
						excerpt={m.article_excerpt({}, o)}
						meta={m.article_meta({}, o)}
						href="#"
					/>
					<ProductCard
						title={m.product_title({}, o)}
						kind={m.product_kind({}, o)}
						text={m.product_text({}, o)}
						price={m.product_price({}, o)}
						action={<Button size="sm">{m.product_action({}, o)}</Button>}
					/>
				</div>

				<Heading>{m.sound({}, o)}</Heading>
				<div class="grid gap-5 md:grid-cols-2">
					<AudioPlayer
						id={`audio-${id}`}
						title={m.audio_title({}, o)}
						meta={m.audio_meta({}, o)}
						src="/assets/sample.mp3"
						duration={754}
						playLabel={m.play({}, o)}
						pauseLabel={m.pause({}, o)}
					/>
					<ProgramTracker
						title={m.tracker_title({}, o)}
						subtitle={m.tracker_sub({ day: "7", total: "21" }, o)}
						total={21}
						done={6}
						dayLabel={day}
						note={m.tracker_note({}, o)}
					/>
				</div>
				<div class="mt-5 grid gap-5 md:grid-cols-2">
					<GlassCard class="pz-edge">
						<ProgressSignal
							label={m.signal_label({}, o)}
							startLabel={m.signal_start({}, o)}
							endLabel={m.signal_end({}, o)}
							caption={m.signal_caption({}, o)}
						/>
					</GlassCard>
					<div class="space-y-4">
						<TextField
							id={`email-${id}`}
							name="email"
							type="email"
							label={m.field_label({}, o)}
							hint={m.field_hint({}, o)}
						/>
						<TextField
							id={`email2-${id}`}
							name="email2"
							type="email"
							label={m.field_label({}, o)}
							error={m.field_error({}, o)}
						/>
					</div>
				</div>
			</div>
		</section>
	);
}
