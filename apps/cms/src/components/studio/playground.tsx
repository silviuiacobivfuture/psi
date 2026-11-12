"use client";
import type { CopyDefaults } from "@psi/cms-client/behaviour";
import { type FormEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { Segmented } from "./controls";
import { IconReset, IconSend, IconSpark } from "./icons";
import { previewLines } from "./stream";
import { type Brand, fill, type Settings, type T } from "./types";

type Locale = "ro" | "en";

interface Turn {
	id: number;
	role: "user" | "guide";
	text: string;
	sources?: ReadonlyArray<{ title: string; url: string }>;
	refusal?: string;
	timing?: { firstTextMs: number | null; totalMs: number; model: string };
	pending?: boolean;
	stage?: "thinking" | "searching" | "checking";
	failed?: boolean;
}

/** The preset test prompts: a greeting, a feeling, a fact (the brand's first chip), a price, a typo. */
function presets(locale: Locale, chip: string | undefined): ReadonlyArray<string> {
	return locale === "ro"
		? ["salut", "sunt cam trist", chip ?? "Cum fac o programare?", "cât costă?", "qwe"]
		: ["hi", "I feel a bit low", chip ?? "How do I book?", "how much does it cost?", "qwe"];
}

const secs = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/**
 * The live preview: a chat with the brand's real guide, answered on the site's engine with the
 * DRAFT settings (the page's, unsaved), streamed. The greeting and the chips are the draft's too.
 * Nothing is counted or stored; a new conversation starts clean.
 */
export function Playground({
	brand,
	settings,
	defaults,
	locale,
	setLocale,
	canPreview,
	canEdit,
	ready,
	dirty,
	t,
}: {
	brand: Brand;
	settings: Settings;
	defaults: { ro: CopyDefaults; en: CopyDefaults } | null;
	locale: Locale;
	setLocale: (l: Locale) => void;
	canPreview: boolean;
	canEdit: boolean;
	ready: boolean;
	dirty: boolean;
	t: T;
}): ReactElement {
	const [turns, setTurns] = useState<ReadonlyArray<Turn>>([]);
	const [text, setText] = useState("");
	const [busy, setBusy] = useState(false);
	const [olderSite, setOlderSite] = useState(false);
	const abort = useRef<AbortController | null>(null);
	const log = useRef<HTMLOListElement | null>(null);
	const nextId = useRef(1);
	const copy = settings.behaviour.copy[locale];
	const own = defaults?.[locale];
	const greeting = copy.welcome ?? own?.welcome ?? "";
	const chips = copy.chips ?? own?.chips ?? [];

	// A new language or brand is a new conversation.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on these two only.
	useEffect(() => {
		abort.current?.abort();
		setTurns([]);
	}, [locale, brand]);
	// Follow the conversation as it grows: every new or streamed turn scrolls the log down.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `turns` is the trigger, not an input.
	useEffect(() => {
		const el = log.current;
		if (el !== null) el.scrollTop = el.scrollHeight;
	}, [turns]);

	const update = (id: number, f: (t: Turn) => Turn): void =>
		setTurns((all) => all.map((x) => (x.id === id ? f(x) : x)));

	async function ask(question: string): Promise<void> {
		const q = question.trim();
		if (q === "" || busy || !canPreview) return;
		abort.current?.abort();
		const controller = new AbortController();
		abort.current = controller;
		const history = turns
			.filter((x) => !x.pending && !x.failed && x.text.trim() !== "")
			.slice(-20)
			.map((x) => ({ role: x.role, text: x.text.slice(0, 4000) }));
		const userId = nextId.current++;
		const guideId = nextId.current++;
		setTurns((all) => [
			...all,
			{ id: userId, role: "user", text: q },
			{ id: guideId, role: "guide", text: "", pending: true, stage: "thinking" },
		]);
		setText("");
		setBusy(true);
		try {
			const r = await fetch("/api/platform/ai/behaviour/preview", {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					brand,
					locale,
					question: q,
					history,
					...(canEdit ? { settings } : {}),
				}),
				signal: controller.signal,
			});
			if (!r.ok || r.body === null) {
				update(guideId, (x) => ({
					...x,
					pending: false,
					failed: true,
					text: t("psi:stPreviewFailed"),
				}));
				return;
			}
			let model = "";
			let sawMeta = false;
			for await (const line of previewLines(r.body)) {
				if (line.type === "meta") {
					sawMeta = true;
					model = line.model;
				} else if (line.type === "text")
					update(guideId, (x) => ({ ...x, text: x.text + line.text }));
				else if (line.type === "replace") update(guideId, (x) => ({ ...x, text: line.text }));
				else if (line.type === "stage") update(guideId, (x) => ({ ...x, stage: line.stage }));
				else if (line.type === "sources") {
					// One line per cited page: two passages of the same page are one source.
					const sources = [...new Map(line.sources.map((s) => [s.url, s])).values()];
					update(guideId, (x) => ({ ...x, sources }));
				} else if (line.type === "refusal")
					update(guideId, (x) => ({ ...x, refusal: line.reason }));
				else if (line.type === "timing") {
					update(guideId, (x) => ({
						...x,
						timing: { firstTextMs: line.firstTextMs, totalMs: line.totalMs, model },
					}));
				}
			}
			setOlderSite(!sawMeta);
			update(guideId, (x) => ({ ...x, pending: false }));
		} catch {
			if (!controller.signal.aborted) {
				update(guideId, (x) => ({
					...x,
					pending: false,
					failed: true,
					text: t("psi:stPreviewFailed"),
				}));
			}
		} finally {
			setBusy(false);
		}
	}

	const submit = (e: FormEvent<HTMLFormElement>): void => {
		e.preventDefault();
		void ask(text);
	};
	const stageWord = (s: Turn["stage"]): string =>
		s === "searching"
			? t("psi:stStageSearching")
			: s === "checking"
				? t("psi:stStageChecking")
				: t("psi:stStageThinking");
	const refusalWord = (reason: string): string => fill(t("psi:stRefusal"), { reason });

	return (
		<section className="psi-play" aria-labelledby="play-title">
			<header className="psi-play__head">
				<div>
					<h2 id="play-title" className="psi-play__title">
						<IconSpark /> {t("psi:stPlayTitle")}
					</h2>
					<p className="psi-play__sub">
						{!canEdit ? t("psi:stPlaySaved") : dirty ? t("psi:stPlayDraft") : t("psi:stPlayLive")}
					</p>
				</div>
				<div className="psi-play__tools">
					<Segmented
						name="play-locale"
						label={t("psi:stLanguage")}
						value={locale}
						onChange={setLocale}
						size="sm"
						options={[
							{ value: "ro", label: "RO" },
							{ value: "en", label: "EN" },
						]}
					/>
					<button
						type="button"
						className="psi-btn psi-btn--ghost psi-btn--sm"
						onClick={() => {
							abort.current?.abort();
							setTurns([]);
						}}
					>
						<IconReset /> {t("psi:stNewChat")}
					</button>
				</div>
			</header>
			{!canPreview ? (
				<p className="psi-note psi-note--warn">{t("psi:stNeedOperator")}</p>
			) : !ready ? (
				<p className="psi-note psi-note--warn">{t("psi:stNotReady")}</p>
			) : null}
			{olderSite ? <p className="psi-note psi-note--warn">{t("psi:stOlderSite")}</p> : null}
			<ol
				className="psi-play__log"
				ref={log}
				aria-live="polite"
				aria-label={t("psi:stConversation")}
			>
				<li className="psi-msg psi-msg--guide psi-msg--greeting">
					<span className="psi-msg__who">{t("psi:stGuide")}</span>
					<p>{greeting === "" ? t("psi:stNoGreeting") : greeting}</p>
					{turns.length === 0 && chips.length > 0 ? (
						<div className="psi-play__chips">
							{chips.map((c) => (
								<button
									key={c}
									type="button"
									className="psi-chip"
									disabled={!canPreview || !ready || busy}
									onClick={() => void ask(c)}
								>
									{c}
								</button>
							))}
						</div>
					) : null}
				</li>
				{turns.map((x) => (
					<li
						key={x.id}
						className={`psi-msg psi-msg--${x.role}${x.failed ? " psi-msg--failed" : ""}`}
					>
						<span className="psi-msg__who">
							{x.role === "user" ? t("psi:stYou") : t("psi:stGuide")}
						</span>
						{x.pending && x.text === "" ? (
							<p className="psi-msg__thinking">
								<span className="psi-dots" aria-hidden="true">
									<span />
									<span />
									<span />
								</span>
								{stageWord(x.stage)}
							</p>
						) : (
							<p>{x.text}</p>
						)}
						{x.refusal === undefined ? null : (
							<p className="psi-msg__refusal">{refusalWord(x.refusal)}</p>
						)}
						{x.sources === undefined || x.sources.length === 0 ? null : (
							<ul className="psi-msg__sources" aria-label={t("psi:stSources")}>
								{x.sources.map((s, i) => (
									<li key={s.url}>
										<span className="psi-msg__n">{i + 1}</span> {s.title}
									</li>
								))}
							</ul>
						)}
						{x.timing === undefined ? null : (
							<p className="psi-msg__timing">
								{fill(t("psi:stTiming"), {
									first: x.timing.firstTextMs === null ? "—" : secs(x.timing.firstTextMs),
									total: secs(x.timing.totalMs),
								})}
								{x.timing.model === "" ? "" : ` · ${x.timing.model}`}
							</p>
						)}
					</li>
				))}
			</ol>
			<fieldset className="psi-play__presets" aria-label={t("psi:stPresetsTry")}>
				{presets(locale, own?.chips[0]).map((p) => (
					<button
						key={p}
						type="button"
						className="psi-chip psi-chip--quiet"
						disabled={!canPreview || !ready || busy}
						onClick={() => void ask(p)}
					>
						{p}
					</button>
				))}
			</fieldset>
			<form className="psi-play__form" onSubmit={submit}>
				<label htmlFor="play-input" className="psi-visually-hidden">
					{t("psi:stAsk")}
				</label>
				<input
					id="play-input"
					value={text}
					maxLength={1000}
					placeholder={t("psi:stAskPlaceholder")}
					disabled={!canPreview || !ready}
					onChange={(e) => setText(e.currentTarget.value)}
				/>
				<button
					type="submit"
					className="psi-btn psi-btn--primary psi-btn--icon"
					aria-label={t("psi:stSend")}
					disabled={!canPreview || !ready || busy || text.trim() === ""}
				>
					<IconSend />
				</button>
			</form>
			<p className="psi-play__foot">{t("psi:stPlayFoot")}</p>
		</section>
	);
}
