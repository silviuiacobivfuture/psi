import { jsString } from "./guide-exchange";

/*
 * The compass's behaviour, as the Datastar expressions its markup carries. Signals:
 * - `compassOpen`: the sheet is up; `compassChat`: the chat view (else the destinations);
 * - `compassQuery`: the draft in the field; `compassTurns`: the conversation (text turns);
 * - `compassPending`: the question waiting for its answer; `compassRemembered`: the conversation
 *   is kept on the server for this signed-in person (so the page keeps no copy of the turns).
 * Every request goes to the one guide URL: Datastar cancels the previous request to the same URL,
 * so a new question replaces one still streaming, and "New conversation" stops it.
 */

/** The signals the compass starts with, before the kept conversation is read. */
export const SIGNALS =
	"{compassOpen: false, compassQuery: '', compassTurns: [], compassPending: '', compassChat: false, compassRemembered: false}";

/** The longest question (characters), as `MAX_ASK_LENGTH` on the server. */
const MAX_ASK = 500;
/** The turns the page keeps, as `DISPLAY_TURNS` in the guide's contract. */
const MAX_TURNS = 20;

function post(action: string, payload: string): string {
	return `@post(${jsString(action)}, {payload: ${payload}, retry: 'never'})`;
}

/**
 * Sends a question. A question still waiting for its answer stays in the conversation as an
 * unanswered turn (its exchange settles itself as such); the field empties as the question leaves.
 */
export function send(action: string, question: string, fromField: boolean): string {
	const clear = fromField ? "$compassQuery = ''; " : "";
	const ask = post(action, "{compassOp: 'ask', compassQuery: q, compassTurns: $compassTurns}");
	return `const q = String(${question}).trim(); if (q !== '' && q.length <= ${MAX_ASK}) { if ($compassPending !== '' && $compassPending !== q) { $compassTurns = [...$compassTurns, {role: 'user', text: $compassPending}].slice(-${MAX_TURNS}) }; ${clear}$compassPending = q; $compassChat = true; $compassOpen = true; ${ask} }`;
}

/** The rows the arrow keys move through: the ask row first, then every destination on screen. */
const ROWS =
	"[el.closest('.pz-compass').querySelector('.pz-compass__ask'), ...el.closest('.pz-compass').querySelectorAll('.pz-compass__item')].filter((r) => r && r.offsetParent !== null)";

/**
 * Arrow keys pick a row among the destinations (the ask row is the default), only while they
 * show and the draft is one line; in the chat view they move the caret as usual.
 */
export const PICK = `if (!$compassChat && !el.value.includes('\\n') && (evt.key === 'ArrowDown' || evt.key === 'ArrowUp')) { const rows = ${ROWS}; if (rows.length > 0) { evt.preventDefault(); $compassOpen = true; const cur = Math.max(rows.findIndex((r) => r.classList.contains('is-picked')), rows[0].classList.contains('pz-compass__ask') ? 0 : -1); const next = evt.key === 'ArrowDown' ? Math.min(cur + 1, rows.length - 1) : Math.max(cur - 1, 0); rows.forEach((r, i) => r.classList.toggle('is-picked', i === next)); rows[next].scrollIntoView({ block: 'nearest' }); if (rows[next].id) el.setAttribute('aria-activedescendant', rows[next].id); else el.removeAttribute('aria-activedescendant') } }`;

/** Typing (or sending) puts the pick back on the ask row. */
export const UNPICK =
	"el.closest('.pz-compass').querySelectorAll('.is-picked').forEach((r) => r.classList.remove('is-picked')); el.closest('.pz-compass').querySelector('.pz-compass__input')?.removeAttribute('aria-activedescendant')";

/** A destination highlighted with the arrow keys, still on screen. */
const PICKED =
	"el.closest('.pz-compass').querySelector('.pz-compass__item.is-picked:not([style*=\"display: none\"])')";

/** Enter (or the send button): a picked destination opens; anything else is asked. */
export function submit(action: string): string {
	return `const a = ${PICKED}; if (a && a.offsetParent !== null) { window.location.href = a.href } else { ${UNPICK}; ${send(action, "$compassQuery", true)} }`;
}

/** Asks a question handed over by an event (a suggestion chip, a retry). */
export function askEvent(action: string): string {
	return send(action, "evt.detail", false);
}

/** A suggestion chip: the question goes through the field's form, like a typed one. */
export function suggest(text: string): string {
	return `el.closest('.pz-compass').querySelector('.pz-compass__bar').dispatchEvent(new CustomEvent('psi-guide-ask', { detail: ${jsString(text)} }))`;
}

/**
 * At load: the kept conversation comes back into the signals, and the transcript is asked for
 * (rendered on the server, from these turns, or from the remembered conversation).
 */
export function load(action: string, key: string): string {
	const restore = post(
		action,
		"{compassOp: 'restore', compassTurns: $compassTurns, compassPending: $compassPending}",
	);
	return [
		`const s = window.psiChat?.load(${jsString(key)})`,
		"if (s) { $compassTurns = s.turns; $compassPending = s.pending; $compassQuery = s.draft; $compassRemembered = s.remembered; $compassChat = s.turns.length > 0 || s.pending !== '' }",
		`if (s && (s.turns.length > 0 || s.pending !== '' || s.remembered) && window.psiChat.claim()) { ${restore} }`,
	].join("; ");
}

/**
 * Every change is kept (debounced in `psiChat`); the transcript itself is never stored as HTML.
 * The signals go through JSON first: Datastar's signal objects create any key that is read, so
 * reading a turn's absent `refused` would plant an empty one in the conversation.
 */
export function save(key: string): string {
	return `window.psiChat?.save(${jsString(key)}, JSON.parse(JSON.stringify({turns: $compassTurns, pending: $compassPending, draft: $compassQuery, remembered: $compassRemembered})))`;
}

/**
 * The first time the sheet opens with nothing kept on this device: ask once, so a person whose
 * conversation is remembered finds it here too (anyone else gets an empty transcript back).
 */
export function restoreOnOpen(action: string): string {
	return `if ($compassOpen && $compassTurns.length === 0 && $compassPending === '' && window.psiChat?.claim()) { ${post(action, "{compassOp: 'restore', compassTurns: [], compassPending: ''}")} }`;
}

/** "New conversation": everything goes at once, here and (for a remembered one) on the server. */
export function reset(action: string, key: string, target: string): string {
	return [
		"$compassTurns = []; $compassPending = ''; $compassQuery = ''; $compassRemembered = false; $compassChat = true",
		`document.getElementById(${jsString(target)})?.replaceChildren()`,
		`window.psiChat?.clear(${jsString(key)})`,
		"el.closest('.pz-compass').querySelector('.pz-compass__input')?.focus()",
		post(action, "{compassOp: 'reset'}"),
	].join("; ");
}

/** "/" opens the compass and focuses the field; Escape collapses it (nothing is cleared). */
export const KEYS = [
	"if (evt.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '') && !document.activeElement?.isContentEditable) { evt.preventDefault(); $compassOpen = true; el.querySelector('.pz-compass__input').focus() }",
	"else if (evt.key === 'Escape' && $compassOpen) { $compassOpen = false }",
].join(" ");
