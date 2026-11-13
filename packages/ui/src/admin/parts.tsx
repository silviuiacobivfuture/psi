/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { type AdminIcon, Icon } from "./icons";

export const STATUSES = [
	"confirmed",
	"requested",
	"cancelled",
	"attended",
	"no-show",
	"leave",
	"medical-leave",
] as const;
export type Status = (typeof STATUSES)[number];

const STATUS_ICON: Readonly<Record<Status, AdminIcon>> = {
	confirmed: "check",
	requested: "clock",
	cancelled: "x",
	attended: "check",
	"no-show": "alert",
	leave: "briefcase",
	"medical-leave": "shield",
};

export interface StatusPillProps {
	status: Status;
	/** The status in words: colour is never the only signal. */
	label: string;
	/** Icon only on screen (the word stays for assistive technology and as a tooltip), for tight places. */
	compact?: boolean;
}

export function StatusPill({ status, label, compact = false }: StatusPillProps): JSX.Element {
	return (
		<span
			class={cx("adm-pill", `adm-pill--${status}`, compact && "adm-pill--compact")}
			data-status={status}
			title={compact ? label : undefined}
		>
			<Icon name={STATUS_ICON[status]} />
			{compact ? <span class="adm-sr">{label}</span> : label}
		</span>
	);
}

export interface StatCardProps {
	label: string;
	value: string;
	hint?: string;
	href?: string;
}

export function StatCard({ label, value, hint, href }: StatCardProps): JSX.Element {
	const body = (
		<>
			<span class="adm-stat__value">{value}</span>
			<span class="adm-stat__label">{label}</span>
			{hint === undefined ? null : <span class="adm-muted">{hint}</span>}
		</>
	);
	return href === undefined ? (
		<div class="adm-card adm-stat">{body}</div>
	) : (
		<a class="adm-card adm-stat" href={href}>
			{body}
		</a>
	);
}

export interface EmptyStateProps {
	icon: AdminIcon;
	title: string;
	text?: string;
	children?: Child;
}

export function EmptyState({ icon, title, text, children }: EmptyStateProps): JSX.Element {
	return (
		<div class="adm-empty" role="status">
			<Icon name={icon} />
			<p class="adm-empty__title">{title}</p>
			{text === undefined ? null : <p>{text}</p>}
			{children}
		</div>
	);
}

export interface SkeletonProps {
	lines?: number;
	/** Spoken once for screen readers while content loads. */
	label: string;
}

export function Skeleton({ lines = 4, label }: SkeletonProps): JSX.Element {
	return (
		<div class="adm-card" role="status" aria-busy="true">
			<span class="adm-sr">{label}</span>
			{Array.from({ length: lines }, (_, i) => (
				<span
					key={i}
					class="adm-skel"
					style={`width:${90 - ((i * 17) % 40)}%`}
					aria-hidden="true"
				/>
			))}
		</div>
	);
}

export interface BannerProps {
	tone: "error" | "offline" | "info";
	icon?: AdminIcon;
	children?: Child;
	class?: string;
}

export function Banner({ tone, icon, children, class: className }: BannerProps): JSX.Element {
	return (
		<div
			class={cx("adm-banner", `adm-banner--${tone}`, className)}
			role={tone === "error" ? "alert" : "status"}
		>
			{icon === undefined ? null : <Icon name={icon} />}
			<div>{children}</div>
		</div>
	);
}

export interface Tab {
	key: string;
	label: string;
	href: string;
}

/** Tab links to server-rendered panels: the selected one carries aria-selected. */
export function Tabs({
	tabs,
	selected,
	label,
}: {
	tabs: ReadonlyArray<Tab>;
	selected: string;
	label: string;
}): JSX.Element {
	return (
		<nav class="adm-tablist" aria-label={label}>
			{tabs.map((t) => (
				<a
					key={t.key}
					class="adm-tablist__tab"
					href={t.href}
					aria-current={t.key === selected ? "page" : undefined}
				>
					{t.label}
				</a>
			))}
		</nav>
	);
}

export interface SegmentedItem {
	key: string;
	label: string;
	href: string;
}

/** A segmented control of links (day / week / month): the current one is marked. */
export function Segmented({
	items,
	current,
	label,
}: {
	items: ReadonlyArray<SegmentedItem>;
	current: string;
	label: string;
}): JSX.Element {
	return (
		<nav class="adm-seg" aria-label={label}>
			{items.map((i) => (
				<a
					key={i.key}
					class="adm-seg__item"
					href={i.href}
					aria-current={i.key === current ? "true" : undefined}
				>
					{i.label}
				</a>
			))}
		</nav>
	);
}

export interface SheetProps {
	/** The Datastar signal that opens it, e.g. "newAppt". */
	signal: string;
	title: string;
	closeLabel: string;
	children?: Child;
}

/** A bottom sheet on a phone, a side panel on larger screens; open while `$<signal>` is true. */
export function Sheet({ signal, title, closeLabel, children }: SheetProps): JSX.Element {
	const id = `adm-sheet-${signal}`;
	return (
		<div
			class="adm-sheet"
			role="dialog"
			aria-modal="true"
			aria-labelledby={`${id}-title`}
			data-show={`$${signal}`}
			data-on:keydown={`evt.key === 'Escape' && ($${signal} = false)`}
			style="display:none"
		>
			<button
				type="button"
				class="adm-sheet__scrim"
				tabindex={-1}
				aria-label={closeLabel}
				data-on:click={`$${signal} = false`}
			/>
			<div class="adm-sheet__panel">
				<div class="adm-sheet__grip" aria-hidden="true" />
				<div class="adm-sheet__head">
					<h2 id={`${id}-title`} class="adm-h1">
						{title}
					</h2>
					<button
						type="button"
						class="adm-iconbtn"
						aria-label={closeLabel}
						data-on:click={`$${signal} = false`}
					>
						<Icon name="x" />
					</button>
				</div>
				{children}
			</div>
		</div>
	);
}
