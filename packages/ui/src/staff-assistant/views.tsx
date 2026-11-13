/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { PanelCopy, StaffCard, StaffViews, ViewPatch } from "@psi/engine/staff";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { CardView, cardId } from "./cards";

function html(element: JSX.Element): string {
	const rendered = element.toString();
	if (typeof rendered !== "string") throw new Error("a staff view rendered asynchronously");
	return rendered;
}

function Paragraphs({ text }: { text: string }): JSX.Element {
	return (
		<>
			{text
				.split(/\n{2,}/)
				.filter((p) => p.trim() !== "")
				.map((p) => (
					<p>{p.trim()}</p>
				))}
		</>
	);
}

/**
 * How the console draws a turn, for `createStaffAssistantRoutes`. Every patch targets ids this
 * module made; the engine only forwards them. Text from the model and from records is rendered as
 * text (escaped), never as markup.
 */
export function staffViews(labels: PanelCopy, base: string): StaffViews {
	const ctx = { labels, base };
	const refusalText = (reason: keyof PanelCopy["refusals"]): string => labels.refusals[reason];
	return {
		exchange: ({ id, message }): ViewPatch => ({
			selector: "#staff-log",
			mode: "append",
			html: html(
				<article id={`sa-x-${id}`} class="sa-x">
					<div class="sa-msg sa-msg--you">
						<span class="sa-sr">{labels.you}</span>
						<Paragraphs text={message} />
					</div>
					<div class="sa-msg sa-msg--bot">
						<span class="sa-sr">{labels.assistant}</span>
						<div id={`sa-chips-${id}`} class="sa-chips" />
						<div id={`sa-text-${id}`} class="sa-text">
							<span id={`sa-dots-${id}`} class="sa-dots" role="status" aria-label={labels.thinking}>
								<i />
								<i />
								<i />
							</span>
						</div>
						<div id={`sa-cards-${id}`} class="sa-cards" />
						<div id={`sa-status-${id}`} />
					</div>
				</article>,
			),
		}),
		chip: ({ id, callId, label, phase }): ViewPatch => {
			const chip = html(
				<span id={`sa-chip-${callId}`} class={cx("sa-chip", `sa-chip--${phase}`)}>
					{phase === "running" ? <i class="sa-chip__spin" aria-hidden="true" /> : null}
					{label}
				</span>,
			);
			return phase === "running"
				? { selector: `#sa-chips-${id}`, mode: "append", html: chip }
				: { html: chip };
		},
		text: ({ id, text }): ViewPatch => ({
			html: html(
				<div id={`sa-text-${id}`} class="sa-text">
					<Paragraphs text={text} />
				</div>,
			),
		}),
		card: ({ id, card }): ViewPatch => ({
			selector: `#sa-cards-${id}`,
			mode: "append",
			html: html(<CardView card={card} ctx={ctx} />),
		}),
		refusal: ({ id, reason }): ViewPatch => ({
			html: html(
				<div id={`sa-status-${id}`} class="sa-refusal" role="alert">
					{refusalText(reason)}
				</div>,
			),
		}),
		done: ({ id }): ViewPatch => ({
			selector: `#sa-dots-${id}`,
			mode: "outer",
			html: html(<span id={`sa-dots-${id}`} hidden />),
		}),
		briefing: ({ card }: { card: StaffCard }): ViewPatch => ({
			selector: "#sa-briefing",
			mode: "outer",
			html: html(
				<section id="sa-briefing" aria-label={labels.title}>
					<CardView card={card} ctx={ctx} />
				</section>,
			),
		}),
		result: ({ outcome }): ViewPatch => ({
			selector: `#${cardId(outcome.card.proposalId)}`,
			mode: "outer",
			html: html(<CardView card={outcome.card} ctx={ctx} />),
		}),
		dismissed: ({ proposalId }): ViewPatch => ({
			selector: `#${cardId(proposalId)}`,
			mode: "outer",
			html: html(
				<section id={cardId(proposalId)} class="sa-card sa-card--dismissed" role="status">
					{labels.dismissed}
				</section>,
			),
		}),
	};
}
