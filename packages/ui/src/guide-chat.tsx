/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import {
	type ConversationTurn,
	type Guide,
	type Locale,
	type PageResolve,
	parseConversation,
} from "@psi/guide";
import type { Context } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import { streamSSE } from "hono/streaming";
import { type AnswerTarget, GuideAnswer, regionClass } from "./components/guide-answer";
import type { GuideLabels } from "./components/guide-labels";
import { devLog } from "./dev-log";
import type { GuideMemory } from "./guide-memory";
import {
	type AskSignals,
	MAX_ASK_LENGTH,
	PAGE_SIGNAL,
	parseAnswerTarget,
	parseAskSignals,
	questionFor,
	streamGuideAnswer,
} from "./guide-stream";

/** The largest body `/ghid` reads: twenty bounded turns fit with room to spare. */
export const MAX_GUIDE_BODY = 256 * 1024;

export interface GuidePostOptions {
	locale: Locale;
	labels: GuideLabels;
	/** The page's answer region classes (the compass has its own). */
	class?: string;
	/** The guide for this request (remembering, for a person who consented); only asked to answer. */
	guide: () => Promise<Guide>;
	/**
	 * The signed-in person's kept conversation, when they gave the "remember my conversations"
	 * consent (`accountMemory`); `null` for everyone else. Only read to restore or reset.
	 */
	memory?: () => Promise<GuideMemory | null>;
	/**
	 * Finds the page a question is asked on in the site's own content (`createPageResolver`): the
	 * page's reference comes from the browser, its text only ever from here. Without it the guide
	 * does not know which page the visitor is on.
	 */
	page?: PageResolve;
}

/** The text of the last question in `turns`, if any. */
function lastQuestion(turns: ReadonlyArray<ConversationTurn>): string | undefined {
	for (let i = turns.length - 1; i >= 0; i--) {
		const turn = turns[i];
		if (turn?.role === "user") return turn.text;
	}
	return undefined;
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** A question still waiting, as the page posted it: trimmed and within the asking field's limit. */
export function parsePending(raw: string | undefined): string {
	const pending = raw?.trim() ?? "";
	return pending.length <= MAX_ASK_LENGTH ? pending : "";
}

/**
 * The transcript for a person whose conversation is remembered: the kept turns are the source (they
 * follow the person across devices); the page adds only what came after the last kept question on
 * this device (a refusal, an unanswered question), since only answered turns are kept.
 */
export function mergeRemembered(
	remembered: ReadonlyArray<ConversationTurn>,
	local: ReadonlyArray<ConversationTurn>,
): ReadonlyArray<ConversationTurn> {
	if (remembered.length === 0) return parseConversation(local);
	const last = lastQuestion(remembered);
	let at = -1;
	local.forEach((t, i) => {
		if (t.role === "user" && t.text === last) at = i;
	});
	const after = at < 0 ? [] : local.slice(at + 1);
	const tail = after[0]?.role === "guide" ? after.slice(1) : after;
	return parseConversation([...remembered, ...tail]);
}

/** A write from this very site: browsers say so in `Sec-Fetch-Site`; an older one, by `Origin`. */
export function sameOriginWrite(c: Context): boolean {
	const site = c.req.header("sec-fetch-site");
	if (site !== undefined) return site === "same-origin";
	const origin = c.req.header("origin");
	if (origin === undefined) return true;
	try {
		return new URL(origin).host === c.req.header("host");
	} catch {
		return false;
	}
}

function respond(
	c: Context,
	elements: JSX.Element,
	signals: Readonly<Record<string, unknown>>,
): Response {
	return streamSSE(c, async (stream) => {
		const html = (await elements.toString()).replace(/\n/g, " ");
		await stream.writeSSE({
			event: "datastar-patch-elements",
			data: `elements ${html}`,
		});
		await stream.writeSSE({
			event: "datastar-patch-signals",
			data: `signals ${JSON.stringify(signals)}`,
		});
	});
}

/**
 * The compass's transcript, rendered again from the turns the page kept (and, for a person who
 * consented, from their remembered conversation), so a reload or another page shows it as it was.
 */
async function restore(
	c: Context,
	signals: AskSignals,
	opts: GuidePostOptions,
	target: AnswerTarget,
): Promise<Response> {
	const memory = (await opts.memory?.().catch(() => null)) ?? null;
	const remembered = memory === null ? [] : await memory.turns().catch(() => []);
	const turns = mergeRemembered(remembered, signals.compassTurns ?? []);
	// Answered on the server after the page went away: the kept turns already hold it.
	const posted = parsePending(signals.compassPending);
	const lastKept = lastQuestion(remembered);
	const pending = posted !== "" && posted === lastKept ? "" : posted;
	devLog("guide.restore", {
		path: c.req.path,
		turns: turns.length,
		remembered: memory !== null,
	});
	return respond(
		c,
		<GuideAnswer labels={opts.labels} turns={turns} pending={pending} target={target} />,
		{
			compassTurns: turns,
			compassPending: pending,
			compassRemembered: memory !== null,
		},
	);
}

/**
 * "New conversation": the page has already cleared itself; a remembered conversation is deleted
 * too (the only honest fresh start, since the guide reads it back on every question), and only on
 * a same-origin request.
 */
async function reset(c: Context, opts: GuidePostOptions, target: AnswerTarget): Promise<Response> {
	const memory = (await opts.memory?.().catch(() => null)) ?? null;
	if (memory !== null && sameOriginWrite(c)) {
		await memory.forget().catch((error: unknown) => {
			console.error(`guide reset: ${error instanceof Error ? error.name : "error"}`);
		});
	}
	devLog("guide.reset", { path: c.req.path, remembered: memory !== null });
	return respond(
		c,
		<div id={target} class={regionClass(target, opts.class)} role="log" aria-live="polite" />,
		{ compassTurns: [], compassPending: "", compassRemembered: false },
	);
}

/**
 * The page a question is asked on: resolved by the site from the posted reference, with the titles
 * of the pages earlier turns were asked on (each found again by its path, never taken from the
 * browser). Undefined when the site resolves no pages.
 */
function pageFor(
	opts: GuidePostOptions,
	signals: AskSignals,
	target: AnswerTarget,
	question: string,
): NonNullable<Parameters<typeof streamGuideAnswer>[1]["page"]> | undefined {
	const resolve = opts.page;
	if (resolve === undefined) return undefined;
	const ref = signals[PAGE_SIGNAL[target]];
	const titles = new Map<string, string | undefined>();
	const titleOf = (path: string): string | undefined => {
		if (!titles.has(path)) titles.set(path, resolve({ path }, opts.locale, "")?.title);
		return titles.get(path);
	};
	return {
		context: ref === undefined ? undefined : resolve(ref, opts.locale, question),
		path: ref?.path === "" ? undefined : ref?.path,
		titleOf,
	};
}

/**
 * The one `/ghid` route every site mounts (POST, `?target=`): a question streams its answer; for
 * the compass, `compassOp: "restore"` sends the transcript back and `"reset"` starts over. One URL
 * on purpose: Datastar cancels the previous request to the same URL, so a new question cancels a
 * restore, and a reset cancels an answer still streaming. The body is bounded and parsed (zod).
 */
export async function answerGuidePost(c: Context, opts: GuidePostOptions): Promise<Response> {
	const declared = Number.parseInt(c.req.header("content-length") ?? "0", 10);
	if (declared > MAX_GUIDE_BODY) return c.body(null, 413);
	const raw = await c.req.text().catch(() => "");
	if (raw.length > MAX_GUIDE_BODY) return c.body(null, 413);
	const signals = parseAskSignals(parseJson(raw));
	const target = parseAnswerTarget(c.req.query("target"));
	if (signals === null) return c.body(null, 204);
	if (target === "compass-answer" && signals.compassOp === "restore") {
		return restore(c, signals, opts, target);
	}
	if (target === "compass-answer" && signals.compassOp === "reset") return reset(c, opts, target);
	const question = questionFor(target, signals);
	if (question === null) return c.body(null, 204);
	return streamGuideAnswer(c, {
		page: pageFor(opts, signals, target, question),
		guide: await opts.guide(),
		locale: opts.locale,
		question,
		target,
		labels: opts.labels,
		signals,
	});
}
