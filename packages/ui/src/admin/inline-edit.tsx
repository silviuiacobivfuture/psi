/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import { cx } from "../cx";
import { Icon } from "./icons";

/** What the page sends back for every inline edit: `ie.<key> = { o: open, v: typed }`. */
export const InlineEditSignalsSchema = z.object({
	ie: z.record(z.object({ o: z.boolean(), v: z.string().max(2000) })),
});

/** The typed value of one inline edit, or null when the page did not send it. */
export function inlineValue(body: unknown, key: string): string | null {
	const parsed = InlineEditSignalsSchema.safeParse(body);
	return parsed.success ? (parsed.data.ie[signalKey(key)]?.v ?? null) : null;
}

/** A key that is safe as a signal path segment. */
export function signalKey(key: string): string {
	return key.replace(/\W/g, "_");
}

export interface InlineEditProps {
	/** Unique on the page; also the DOM id prefix. */
	id: string;
	/** What is being edited ("Total price"): names the control for assistive technology. */
	label: string;
	/** The raw value the field starts with when it opens. */
	value: string;
	/** The value as it is read, outside editing. */
	display: Child;
	/** Where the datastar POST goes; the typed value travels in the signals. */
	action: string;
	kind?: "text" | "number" | "money" | "textarea";
	save: string;
	cancel: string;
	/** Tooltip on the read-only value ("Click to edit"). */
	hint: string;
	/** Just saved: shows a quiet check. */
	saved?: boolean;
	savedLabel?: string;
	min?: number;
	max?: number;
	/** Shown as a link-like prompt when there is nothing yet ("Add a note"). */
	class?: string;
}

/**
 * A value you click to edit in place: Enter or the check saves that one field, Escape or the cross
 * puts it back. Opens focused; the read-only value is a real button, so the keyboard reaches it.
 */
export function InlineEdit(p: InlineEditProps): JSX.Element {
	const k = signalKey(p.id);
	const path = `$ie.${k}`;
	const kind = p.kind ?? "text";
	const inputId = `ie-${k}`;
	const back = `setTimeout(() => document.getElementById('${inputId}-view')?.focus(), 0)`;
	const close = `${path}.o = false; ${back}`;
	const open = `${path}.v = ${JSON.stringify(p.value)}; ${path}.o = true; setTimeout(() => document.getElementById('${inputId}')?.focus(), 0)`;
	const common = {
		id: inputId,
		"aria-label": p.label,
		[`data-bind:ie.${k}.v`]: "",
	};
	return (
		<span
			class={cx("adm-inline", p.class)}
			data-kind={kind}
			data-signals={JSON.stringify({ ie: { [k]: { o: false, v: p.value } } })}
		>
			<span class="adm-inline__read" data-show={`!${path}.o`}>
				<button
					type="button"
					id={`${inputId}-view`}
					class="adm-inline__view"
					title={p.hint}
					data-on:click={open}
				>
					<span class="adm-sr">{p.label}: </span>
					{p.display}
					<Icon name="edit" class="adm-inline__pencil" />
				</button>
				{p.saved === true ? (
					<span class="adm-inline__saved" role="status">
						<Icon name="check" />
						<span class="adm-sr">{p.savedLabel}</span>
					</span>
				) : null}
			</span>
			<form
				class="adm-inline__form"
				style="display:none"
				data-show={`${path}.o`}
				data-on:submit__prevent={`@post('${p.action}'); ${close}`}
				data-on:keydown={`evt.key === 'Escape' && (evt.stopPropagation(), ${path}.o = false, ${back})`}
			>
				{kind === "textarea" ? (
					<textarea class="adm-input adm-inline__input" rows={3} maxlength={1000} {...common} />
				) : (
					<input
						class="adm-input adm-inline__input"
						type={kind === "number" ? "number" : "text"}
						inputmode={kind === "number" ? "numeric" : kind === "money" ? "decimal" : undefined}
						min={kind === "number" ? p.min : undefined}
						max={kind === "number" ? p.max : undefined}
						autocomplete="off"
						{...common}
					/>
				)}
				<button type="submit" class="adm-iconbtn adm-inline__ok" aria-label={p.save}>
					<Icon name="check" />
				</button>
				<button type="button" class="adm-iconbtn" aria-label={p.cancel} data-on:click={close}>
					<Icon name="x" />
				</button>
			</form>
		</span>
	);
}
