/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

/** One notification as the bell lists it. Times arrive already formatted in the person's language and zone. */
export interface InboxEntry {
	id: string;
	title: string;
	body: string;
	/** Where the entry leads: a path of the console, never an external address. */
	href: string;
	time: string;
	read: boolean;
	group: "today" | "earlier";
}

export type InboxData =
	| { state: "ready"; entries: ReadonlyArray<InboxEntry>; unread: number }
	| { state: "error" };

/** Every word the inbox shows, from the app's own i18n: the library ships none. */
export interface InboxLabels {
	title: string;
	/** "Notifications, 3 unread" */
	bell: (unread: number) => string;
	empty: string;
	error: string;
	retry: string;
	markAll: string;
	markOne: string;
	groupToday: string;
	groupEarlier: string;
	unread: string;
}

/** The endpoints the console serves (see @psi/notify/inbox). */
export interface InboxUrls {
	/** Datastar GET: re-renders the whole widget (retry). */
	panel: string;
	/** Datastar GET: the live stream of widget patches. */
	stream: string;
	/** Datastar POST, `?id=<entry id>`. */
	read: string;
	readAll: string;
}

export interface InboxProps {
	data: InboxData;
	labels: InboxLabels;
	urls: InboxUrls;
	class?: string;
}

const count = (n: number): string => (n > 99 ? "99+" : String(n));

function Group(props: {
	title: string;
	entries: ReadonlyArray<InboxEntry>;
	labels: InboxLabels;
	urls: InboxUrls;
}): JSX.Element | null {
	if (props.entries.length === 0) return null;
	return (
		<section class="psi-inbox__group">
			<h3 class="psi-inbox__group-title">{props.title}</h3>
			<ul class="psi-inbox__list">
				{props.entries.map((e) => (
					<li class={cx("psi-inbox__item", e.read ? "" : "psi-inbox__item--unread")}>
						<a class="psi-inbox__link" href={e.href}>
							<span class="psi-inbox__item-title">
								{e.read ? null : <span class="psi-inbox__sr">{props.labels.unread}: </span>}
								{e.title}
							</span>
							<span class="psi-inbox__item-body">{e.body}</span>
							<time class="psi-inbox__time">{e.time}</time>
						</a>
						{e.read ? null : (
							<button
								type="button"
								class="psi-inbox__mark"
								aria-label={`${props.labels.markOne}: ${e.title}`}
								data-on:click={`@post('${props.urls.read}?id=${encodeURIComponent(e.id)}', {retry: 'never'})`}
							>
								<span aria-hidden="true">✓</span>
							</button>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}

const unreadOf = (data: InboxData): number => (data.state === "ready" ? data.unread : 0);

/** The unread count on the bell: a patch target of its own, so a patch never touches the bell's button. */
export function InboxBadge({ data }: { data: InboxData }): JSX.Element {
	const unread = unreadOf(data);
	return (
		<span id="psi-inbox-badge" class="psi-inbox__badge" aria-hidden="true" hidden={unread === 0}>
			{unread === 0 ? "" : count(unread)}
		</span>
	);
}

/** What the bell announces and what describes it to a screen reader. */
export function InboxStatus({
	data,
	labels,
}: {
	data: InboxData;
	labels: InboxLabels;
}): JSX.Element {
	return (
		<output id="psi-inbox-status" class="psi-inbox__sr" aria-live="polite">
			{labels.bell(unreadOf(data))}
		</output>
	);
}

/** The panel's content: the head, then the groups, the empty message or the error. */
export function InboxBody({ data, labels, urls }: InboxProps): JSX.Element {
	const unread = unreadOf(data);
	const entries = data.state === "ready" ? data.entries : [];
	return (
		<div id="psi-inbox-body">
			<header class="psi-inbox__head">
				<h2 class="psi-inbox__title">{labels.title}</h2>
				{unread > 0 ? (
					<button
						type="button"
						class="psi-inbox__all"
						data-on:click={`@post('${urls.readAll}', {retry: 'never'})`}
					>
						{labels.markAll}
					</button>
				) : null}
			</header>
			{data.state === "error" ? (
				<div class="psi-inbox__message" role="alert">
					<p>{labels.error}</p>
					<button type="button" class="psi-inbox__retry" data-on:click={`@get('${urls.panel}')`}>
						{labels.retry}
					</button>
				</div>
			) : entries.length === 0 ? (
				<p class="psi-inbox__message">{labels.empty}</p>
			) : (
				<>
					<Group
						title={labels.groupToday}
						entries={entries.filter((e) => e.group === "today")}
						labels={labels}
						urls={urls}
					/>
					<Group
						title={labels.groupEarlier}
						entries={entries.filter((e) => e.group === "earlier")}
						labels={labels}
						urls={urls}
					/>
				</>
			)}
		</div>
	);
}

/**
 * What the server sends on every change: the three live regions as Datastar element patches. The
 * shell (the bell button, the open panel, the stream) is never re-sent, so an open panel stays open
 * and the one stream stays the one stream.
 */
export function inboxPatch(props: InboxProps): string {
	return [
		(<InboxBadge data={props.data} />).toString(),
		(<InboxStatus data={props.data} labels={props.labels} />).toString(),
		(<InboxBody {...props} />).toString(),
	]
		.join("")
		.replace(/\n/g, " ");
}

/**
 * The bell with its unread badge and the panel it opens: grouped notifications, mark one or all as
 * read, deep links. Server-rendered; the stream patches the badge, the status and the body in
 * place, so the count moves live. No React, no script of its own beyond Datastar expressions.
 */
export function Inbox(props: InboxProps): JSX.Element {
	const { data, labels, urls, class: className } = props;
	return (
		<div
			id="psi-inbox"
			class={cx("psi-inbox", className)}
			data-signals:inbox-open__ifmissing="false"
			data-init={`@get('${urls.stream}', {retry: 'always'})`}
			data-on:keydown__window="evt.key === 'Escape' && $inboxOpen && ($inboxOpen = false, document.getElementById('psi-inbox-bell')?.focus())"
		>
			<button
				id="psi-inbox-bell"
				type="button"
				class="psi-inbox__bell"
				aria-label={labels.title}
				aria-describedby="psi-inbox-status"
				aria-expanded="false"
				aria-controls="psi-inbox-panel"
				data-attr:aria-expanded="$inboxOpen ? 'true' : 'false'"
				data-on:click="$inboxOpen = !$inboxOpen"
			>
				<svg
					aria-hidden="true"
					focusable="false"
					viewBox="0 0 24 24"
					width="22"
					height="22"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
					<path d="M10 19a2 2 0 0 0 4 0" />
				</svg>
				<InboxBadge data={data} />
			</button>
			<section
				id="psi-inbox-panel"
				class="psi-inbox__panel"
				aria-label={labels.title}
				data-show="$inboxOpen"
				style="display:none"
			>
				<InboxBody {...props} />
			</section>
			<InboxStatus data={data} labels={labels} />
		</div>
	);
}
