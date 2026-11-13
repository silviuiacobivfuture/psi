/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { CardRow, PanelCopy, StaffCard } from "@psi/engine/staff";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { SaIcon } from "./icons";
import { jsString, safeHref, sendExpression } from "./safe";

export interface CardContext {
	labels: PanelCopy;
	/** Where the assistant's routes are mounted, e.g. `/assistant`. */
	base: string;
}

/** The element id of a proposal's card, and of its result, which replaces it. */
export const cardId = (proposalId: string): string => `sa-card-${proposalId}`;

function Row({ row }: { row: CardRow }): JSX.Element {
	const href = safeHref(row.href);
	const body = (
		<>
			<span class="sa-row__main">
				<span class="sa-row__title">{row.title}</span>
				{row.subtitle === undefined ? null : <span class="sa-row__sub">{row.subtitle}</span>}
			</span>
			{row.badge === undefined ? null : (
				<span class={cx("sa-badge", `sa-badge--${row.tone ?? "neutral"}`)}>{row.badge}</span>
			)}
		</>
	);
	return href === undefined ? (
		<li class="sa-row">{body}</li>
	) : (
		<li class="sa-row">
			<a class="sa-row__link" href={href}>
				{body}
			</a>
		</li>
	);
}

function Rows({ rows, empty }: { rows: ReadonlyArray<CardRow>; empty: string }): JSX.Element {
	return rows.length === 0 ? (
		<p class="sa-empty-line">{empty}</p>
	) : (
		<ul class="sa-rows">
			{rows.map((row) => (
				<Row row={row} />
			))}
		</ul>
	);
}

function Lines({ lines }: { lines: ReadonlyArray<{ label: string; value: string }> }): JSX.Element {
	return (
		<dl class="sa-lines">
			{lines.map((line) =>
				line.label === "" ? (
					<p class="sa-lines__note">{line.value}</p>
				) : (
					<div class="sa-lines__row">
						<dt>{line.label}</dt>
						<dd>{line.value}</dd>
					</div>
				),
			)}
		</dl>
	);
}

/** One card, drawn from the data the tool produced; every string is escaped by the renderer. */
export function CardView({ card, ctx }: { card: StaffCard; ctx: CardContext }): JSX.Element {
	const { labels, base } = ctx;
	switch (card.kind) {
		case "agenda":
		case "list":
			return (
				<section class={`sa-card sa-card--${card.kind}`}>
					<h3 class="sa-card__title">{card.title}</h3>
					<Rows rows={card.rows} empty={card.empty} />
				</section>
			);
		case "client": {
			const href = safeHref(card.href);
			return (
				<section class="sa-card sa-card--client">
					<h3 class="sa-card__title">
						{href === undefined ? card.title : <a href={href}>{card.title}</a>}
					</h3>
					<Lines lines={card.lines} />
					{card.note === undefined ? null : <p class="sa-card__note">{card.note}</p>}
				</section>
			);
		}
		case "slots":
			return (
				<section class="sa-card sa-card--slots">
					<h3 class="sa-card__title">{card.title}</h3>
					{card.slots.length === 0 ? (
						<p class="sa-empty-line">{card.empty}</p>
					) : (
						<ul class="sa-slots">
							{card.slots.map((slot) => (
								<li>
									<button
										type="button"
										class="sa-slot"
										data-on:click={sendExpression(base, slot.ask)}
									>
										<span class="sa-slot__when">{slot.label}</span>
										<span class="sa-slot__where">{slot.detail}</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</section>
			);
		case "choices":
			return (
				<section class="sa-card sa-card--choices">
					<h3 class="sa-card__title">{card.title}</h3>
					<ul class="sa-slots">
						{card.options.map((option) => (
							<li>
								<button
									type="button"
									class="sa-slot"
									data-on:click={sendExpression(base, option.ask)}
								>
									<span class="sa-slot__when">{option.label}</span>
									{option.detail === undefined ? null : (
										<span class="sa-slot__where">{option.detail}</span>
									)}
								</button>
							</li>
						))}
					</ul>
				</section>
			);
		case "stats":
			return (
				<section class="sa-card sa-card--stats">
					<h3 class="sa-card__title">{card.title}</h3>
					<div class="sa-metrics">
						{card.metrics.map((m) => (
							<div class={cx("sa-metric", `sa-metric--${m.tone ?? "neutral"}`)}>
								<span class="sa-metric__value">{m.value}</span>
								<span class="sa-metric__label">{m.label}</span>
							</div>
						))}
					</div>
				</section>
			);
		case "briefing":
			return (
				<section class="sa-card sa-card--briefing">
					<h3 class="sa-card__title">{card.title}</h3>
					{card.clear === undefined ? null : <p class="sa-empty-line">{card.clear}</p>}
					{card.sections.map((section) => (
						<div class="sa-brief">
							<h4 class={cx("sa-brief__title", `sa-brief__title--${section.tone}`)}>
								{section.title}
							</h4>
							<ul class="sa-brief__items">
								{section.items.map((item) => (
									<li>
										{item.ask === undefined ? (
											<span>{item.text}</span>
										) : (
											<button
												type="button"
												class="sa-brief__go"
												data-on:click={sendExpression(base, item.ask)}
											>
												<span>{item.text}</span>
												<SaIcon name="send" size={14} />
											</button>
										)}
									</li>
								))}
							</ul>
						</div>
					))}
				</section>
			);
		case "proposal":
			return (
				<section
					id={cardId(card.proposalId)}
					class={cx("sa-card sa-card--proposal", card.destructive && "is-destructive")}
					aria-label={card.title}
				>
					<h3 class="sa-card__title">{card.title}</h3>
					<Lines lines={card.lines} />
					<p class="sa-card__hint">{labels.expires}</p>
					<div class="sa-actions">
						<button
							type="button"
							class="sa-btn sa-btn--primary"
							data-on:click={`el.disabled = true; el.textContent = ${jsString(labels.confirming)}; @post(${jsString(`${base}/confirm?proposal=${card.proposalId}`)})`}
						>
							<SaIcon name="check" size={16} />
							{labels.confirm}
						</button>
						<button
							type="button"
							class="sa-btn"
							data-on:click={`@post(${jsString(`${base}/dismiss?proposal=${card.proposalId}`)})`}
						>
							{labels.dismiss}
						</button>
					</div>
				</section>
			);
		case "result": {
			const id = card.undo?.proposalId ?? card.proposalId;
			return (
				<section
					id={cardId(id)}
					class={cx("sa-card sa-card--result", card.ok ? "is-ok" : "is-failed")}
					role="status"
				>
					<h3 class="sa-card__title">{card.title}</h3>
					<Lines lines={card.lines} />
					{card.links.length === 0 ? null : (
						<div class="sa-actions">
							{card.links.map((link) => {
								const href = safeHref(link.href);
								return href === undefined ? null : (
									<a
										class="sa-btn sa-btn--primary"
										href={href}
										target="_blank"
										rel="noopener noreferrer"
									>
										{link.label}
									</a>
								);
							})}
						</div>
					)}
					{card.undo === undefined ? null : (
						<div class="sa-actions">
							<button
								type="button"
								class="sa-btn"
								data-on:click={`el.disabled = true; @post(${jsString(`${base}/confirm?proposal=${card.undo.proposalId}`)})`}
							>
								<SaIcon name="undo" size={16} />
								{card.undo.label}
							</button>
						</div>
					)}
				</section>
			);
		}
		default: {
			const never: never = card;
			return never;
		}
	}
}
