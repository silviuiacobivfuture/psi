/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface MoneyProps {
	/** The number as it is written ("1.350,00"): the app formats, this only lays it out. */
	value: string;
	/** The currency, shown lighter ("lei"). */
	currency?: string;
	tone?: "default" | "muted" | "danger" | "success";
}

/** An amount: tabular figures that line up when right-aligned, the currency a step lighter. */
export function Money({ value, currency, tone = "default" }: MoneyProps): JSX.Element {
	return (
		<span class={cx("adm-money", tone !== "default" && `adm-money--${tone}`)}>
			<span class="adm-money__value">{value}</span>
			{currency === undefined ? null : <span class="adm-money__cur"> {currency}</span>}
		</span>
	);
}

export interface MoneyBarProps {
	/** Integer minor units (bani): the bar is arithmetic on whole numbers. */
	paid: number;
	total: number;
	/** Spoken: "350 lei of 1,350 lei paid". */
	label: string;
}

/** A slim paid / remaining bar. Full when settled or overpaid; empty when nothing is due and nothing paid. */
export function MoneyBar({ paid, total, label }: MoneyBarProps): JSX.Element {
	const share =
		total <= 0 ? (paid > 0 ? 100 : 0) : Math.min(100, Math.max(0, (paid / total) * 100));
	const state = paid > total ? "over" : paid === total ? "settled" : paid === 0 ? "none" : "part";
	return (
		<div class={cx("adm-moneybar", `adm-moneybar--${state}`)} role="img" aria-label={label}>
			<span class="adm-moneybar__paid" style={`width:${share.toFixed(2)}%`} />
		</div>
	);
}
