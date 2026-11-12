"use client";
import { useTranslation } from "@payloadcms/ui";
import type { AiBehaviour } from "@psi/cms-client/behaviour";
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomKey } from "../../i18n";
import { diffSettings, sameSettings } from "../../studio/diff";
import { CopyCard } from "./copy-card";
import { ChangeList, HistoryCard } from "./history-card";
import { ModelCard } from "./model-card";
import { Playground } from "./playground";
import { fill, type Settings, type StudioInitial, type T, type VersionRow } from "./types";
import { TopicsCard, VoiceCard } from "./voice-card";

type Busy = null | "draft" | "publish" | "discard" | "revert";
type Flash = { tone: "ok" | "bad"; text: string } | null;

async function post(path: string, body: unknown): Promise<Response> {
	return fetch(`/api/platform/ai/behaviour/${path}`, {
		method: "POST",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

/**
 * The AI behaviour studio for one brand: the controls on the left (voice, copy, topics, model and
 * safety, history), the live preview on the right, a sticky bar to save the draft, publish or
 * discard. Without `ai_admin` every control is read-only; the preview stays for `ai_operator`.
 */
export function Studio({ initial }: { initial: StudioInitial }): ReactElement {
	const { t: raw, i18n } = useTranslation<object, CustomKey>();
	const t: T = useCallback((k) => raw(k), [raw]);
	const [live] = useState<Settings>(initial.live);
	const [saved, setSaved] = useState(initial.draft);
	const [settings, setSettings] = useState<Settings>(initial.draft?.settings ?? initial.live);
	const [locale, setLocale] = useState<"ro" | "en">("ro");
	const [busy, setBusy] = useState<Busy>(null);
	const [flash, setFlash] = useState<Flash>(null);
	/** Set when the page leaves on purpose (after a publish), so the unsaved-changes guard keeps quiet. */
	const leaving = useRef(false);
	const disabled = !initial.canEdit;
	const baseline = saved?.settings ?? live;
	const dirty = !sameSettings(settings, baseline);
	const pending = useMemo(() => diffSettings(live, settings), [live, settings]);
	const when = (iso: string | null): string =>
		iso === null
			? "—"
			: new Date(iso).toLocaleString(i18n.language === "en" ? "en-GB" : "ro-RO", {
					dateStyle: "medium",
					timeStyle: "short",
				});

	useEffect(() => {
		const done = new URLSearchParams(window.location.search).get("done");
		if (done === "published") setFlash({ tone: "ok", text: t("psi:stPublished") });
		if (done === "reverted") setFlash({ tone: "ok", text: t("psi:stReverted") });
	}, [t]);
	useEffect(() => {
		if (!dirty) return;
		const warn = (e: BeforeUnloadEvent): void => {
			if (!leaving.current) e.preventDefault();
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);

	// Any edit clears the last action's message: the bar then says what is true now.
	const set = (s: Partial<Settings>): void => {
		setFlash(null);
		setSettings((x) => ({ ...x, ...s }));
	};
	const patch = (b: Partial<AiBehaviour>): void => {
		setFlash(null);
		setSettings((x) => ({ ...x, behaviour: { ...x.behaviour, ...b } }));
	};

	const reloadWith = (done: string): void => {
		leaving.current = true;
		const q = new URLSearchParams({ brand: initial.brand, done });
		window.location.assign(`${window.location.pathname}?${q.toString()}`);
	};

	async function act(
		kind: Exclude<Busy, null>,
		run: () => Promise<Response>,
		ok: () => void,
	): Promise<void> {
		setBusy(kind);
		setFlash(null);
		try {
			const r = await run();
			if (!r.ok) {
				setFlash({ tone: "bad", text: r.status === 403 ? t("psi:stRefused") : t("psi:stFailed") });
				return;
			}
			ok();
		} catch {
			setFlash({ tone: "bad", text: t("psi:stFailed") });
		} finally {
			setBusy(null);
		}
	}

	const saveDraft = (): Promise<void> =>
		act(
			"draft",
			() => post("draft", { brand: initial.brand, settings }),
			() => {
				setSaved({ settings, by: null, at: new Date().toISOString() });
				setFlash({ tone: "ok", text: t("psi:stDraftSaved") });
			},
		);
	const publish = (): Promise<void> =>
		act(
			"publish",
			() => post("publish", { brand: initial.brand, settings }),
			() => reloadWith("published"),
		);
	const discard = (): Promise<void> =>
		act(
			"discard",
			() => post("discard", { brand: initial.brand }),
			() => {
				setSaved(null);
				setSettings(live);
				setFlash({ tone: "ok", text: t("psi:stDiscarded") });
			},
		);
	const revert = (v: VersionRow): void => {
		if (!window.confirm(fill(t("psi:stRevertConfirm"), { when: when(v.at) }))) return;
		void act(
			"revert",
			() => post("revert", { brand: initial.brand, version: v.id }),
			() => reloadWith("reverted"),
		);
	};

	const status = dirty
		? { tone: "warn", text: t("psi:stUnsaved") }
		: saved !== null && pending.length > 0
			? { tone: "warn", text: fill(t("psi:stDraftAt"), { when: when(saved.at) }) }
			: {
					tone: "on",
					text: fill(t("psi:stLiveBy"), {
						who: initial.liveStamp.by ?? "—",
						when: when(initial.liveStamp.at),
					}),
				};

	return (
		<div className="psi-studio-wrap">
			<div className="psi-studio">
				<div className="psi-studio__controls">
					{disabled ? <p className="psi-note psi-note--lock">{t("psi:stReadOnly")}</p> : null}
					<VoiceCard behaviour={settings.behaviour} patch={patch} disabled={disabled} t={t} />
					<CopyCard
						behaviour={settings.behaviour}
						patch={patch}
						defaults={initial.defaults}
						locale={locale}
						setLocale={setLocale}
						disabled={disabled}
						t={t}
					/>
					<TopicsCard
						behaviour={settings.behaviour}
						patch={patch}
						disabled={disabled}
						suggestions={initial.topics}
						books={initial.books}
						t={t}
					/>
					<ModelCard
						settings={settings}
						set={set}
						patch={patch}
						models={initial.models}
						siteModel={initial.siteModel}
						disabled={disabled}
						t={t}
					/>
					<HistoryCard
						history={initial.history}
						canEdit={initial.canEdit}
						busy={busy !== null}
						onRevert={revert}
						adminLocale={i18n.language}
						t={t}
					/>
				</div>
				<aside className="psi-studio__preview">
					<Playground
						brand={initial.brand}
						settings={settings}
						defaults={initial.defaults}
						locale={locale}
						setLocale={setLocale}
						canPreview={initial.canPreview}
						canEdit={initial.canEdit}
						ready={initial.previewReady}
						dirty={pending.length > 0}
						t={t}
					/>
				</aside>
			</div>
			<section className="psi-bar" aria-label={t("psi:stActions")}>
				<div className="psi-bar__status" role="status" aria-live="polite">
					<span className={`psi-dot psi-dot--${status.tone}`} aria-hidden="true" />
					<span>{flash === null ? status.text : flash.text}</span>
					{pending.length > 0 ? (
						<details className="psi-bar__changes">
							<summary>{fill(t("psi:stPendingCount"), { n: pending.length })}</summary>
							<div className="psi-bar__popover">
								<ChangeList changes={pending} t={t} />
							</div>
						</details>
					) : null}
				</div>
				{disabled ? (
					<span className="psi-bar__lock">{t("psi:stReadOnlyShort")}</span>
				) : (
					<div className="psi-bar__actions">
						<button
							type="button"
							className="psi-btn psi-btn--ghost"
							disabled={busy !== null || (saved === null && !dirty)}
							onClick={() => void discard()}
						>
							{t("psi:stDiscard")}
						</button>
						<button
							type="button"
							className="psi-btn psi-btn--secondary"
							disabled={busy !== null || !dirty}
							onClick={() => void saveDraft()}
						>
							{busy === "draft" ? t("psi:stSaving") : t("psi:stSaveDraft")}
						</button>
						<button
							type="button"
							className="psi-btn psi-btn--primary"
							disabled={busy !== null || pending.length === 0}
							onClick={() => void publish()}
						>
							{busy === "publish" ? t("psi:stPublishing") : t("psi:stPublish")}
						</button>
					</div>
				)}
			</section>
		</div>
	);
}
