import { EmptyState, Icon, OverflowMenu, Sheet } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ActionBar, actionsFor, EmptyActions, menuItems } from "../actions/render";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { type ClientNote, NOTE_CATEGORIES } from "../port/schema-clinical";
import { noteCategoryText } from "./client-flags";
import { SheetButtons } from "./client-sheets";

export const stampText = (locale: Locale, iso: string): string =>
	new Intl.DateTimeFormat(locale, {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(iso));

/** The categories this person may write: the clinical one only with the clinical field group. */
export const categoriesFor = (ctx: Ctx): ReadonlyArray<(typeof NOTE_CATEGORIES)[number]> =>
	NOTE_CATEGORIES.filter((c) => c !== "clinical" || ctx.can.group("clinical"));

/** Notes the person may read: a clinical note is clinical data. */
export const readableNotes = (
	ctx: Ctx,
	notes: ReadonlyArray<ClientNote>,
): ReadonlyArray<ClientNote> =>
	notes.filter((n) => n.category !== "clinical" || ctx.can.group("clinical"));

function NoteCard({ ctx, note }: { ctx: Ctx; note: ClientNote }): JSX.Element {
	const o = at(ctx.locale);
	const entity = {
		clientId: note.clientId,
		id: note.id,
		own: note.authorSubject === ctx.caps.subject,
		pinned: note.pinned,
	};
	const items = menuItems(ctx, "client.notes", entity);
	const pin = actionsFor(ctx, "client.notes", "screen", entity).find((a) => a.id === "note.pin");
	return (
		<li class="cl-note" data-note={note.id} data-pinned={note.pinned ? "true" : "false"}>
			<span class="adm-avatar cl-note__avatar" aria-hidden="true">
				{Array.from(note.authorName)[0]}
			</span>
			<div class="cl-note__main">
				<div class="cl-note__head">
					<strong>{note.authorName}</strong>
					<span class="adm-muted">{stampText(ctx.locale, note.createdAt)}</span>
					{note.editedAt === null ? null : (
						<span class="adm-muted" title={stampText(ctx.locale, note.editedAt)}>
							· {m.cl_note_edited({}, o)}
						</span>
					)}
				</div>
				<div class="cl-note__tags">
					<span class={`adm-pill cl-cat cl-cat--${note.category}`}>
						{noteCategoryText(note.category, ctx.locale)}
					</span>
					{note.pinned ? (
						<span class="adm-pill cl-pinned">
							<Icon name="check" />
							{m.cl_note_pinned({}, o)}
						</span>
					) : null}
				</div>
				<p class="cl-note__body">{note.body}</p>
			</div>
			<div class="cl-note__tools">
				{pin === undefined ? null : (
					<form
						method="post"
						action={`/clients/${note.clientId}/notes/${note.id}/pin`}
						data-action={pin.id}
					>
						<input type="hidden" name="clientId" value={note.clientId} />
						<input type="hidden" name="id" value={note.id} />
						<input type="hidden" name="pinned" value={note.pinned ? "" : "on"} />
						<button
							class="adm-iconbtn"
							type="submit"
							aria-pressed={note.pinned}
							aria-label={note.pinned ? m.cl_note_unpin({}, o) : m.cl_note_pin({}, o)}
						>
							<Icon name="check" />
						</button>
					</form>
				)}
				{items.length === 0 ? null : (
					<OverflowMenu id={`note-${note.id}`} label={m.client_more({}, o)} items={items} />
				)}
			</div>
		</li>
	);
}

/** The notes timeline: newest first, who wrote it and when, its category, pinned ones marked. */
export function NotesTab({
	ctx,
	notes,
	clientId,
}: {
	ctx: Ctx;
	notes: ReadonlyArray<ClientNote>;
	clientId: string;
}): JSX.Element {
	const o = at(ctx.locale);
	const shown = readableNotes(ctx, notes);
	return (
		<div class="cl-tab">
			<ActionBar ctx={ctx} screen="client.notes" entity={{ clientId }} />
			{shown.length === 0 ? (
				<EmptyState
					icon="file"
					title={m.cl_notes_empty_title({}, o)}
					text={m.cl_notes_empty_text({}, o)}
				>
					<EmptyActions ctx={ctx} screen="client.notes" entity={{ clientId }} />
				</EmptyState>
			) : (
				<ol class="cl-notes" aria-label={m.cl_tab_notes({}, o)}>
					{shown.map((n) => (
						<NoteCard key={n.id} ctx={ctx} note={n} />
					))}
				</ol>
			)}
		</div>
	);
}

/** The composer: new, or editing one (prefilled). One column, 16px text, buttons stacked on a phone. */
export function NoteSheet({
	ctx,
	clientId,
	editing,
}: {
	ctx: Ctx;
	clientId: string;
	editing: ClientNote | null;
}): JSX.Element {
	const o = at(ctx.locale);
	const signal = editing === null ? "newNote" : "editNote";
	const action =
		editing === null ? `/clients/${clientId}/notes` : `/clients/${clientId}/notes/${editing.id}`;
	return (
		<Sheet
			signal={signal}
			title={editing === null ? m.cl_note_new({}, o) : m.cl_note_edit({}, o)}
			closeLabel={m.close({}, o)}
		>
			<form
				method="post"
				action={action}
				class="cl-form"
				data-form={editing === null ? "note-add" : "note-edit"}
			>
				<input type="hidden" name="clientId" value={clientId} />
				{editing === null ? null : <input type="hidden" name="id" value={editing.id} />}
				<label class="adm-field">
					<span>{m.cl_note_text({}, o)}</span>
					<textarea class="adm-input" name="body" required maxlength={4000} rows={5}>
						{editing?.body ?? ""}
					</textarea>
				</label>
				<label class="adm-field">
					<span>{m.cl_note_category({}, o)}</span>
					<select class="adm-input" name="category">
						{categoriesFor(ctx).map((c) => (
							<option key={c} value={c} selected={(editing?.category ?? "general") === c}>
								{noteCategoryText(c, ctx.locale)}
							</option>
						))}
					</select>
				</label>
				{editing === null ? (
					<label class="adm-check">
						<input type="checkbox" name="pinned" />
						{m.cl_note_pin_on_save({}, o)}
					</label>
				) : null}
				<SheetButtons go={m.cl_save({}, o)} signal={signal} cancel={m.cancel({}, o)} />
			</form>
		</Sheet>
	);
}
