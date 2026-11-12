"use client";
import { Pill, useDocumentInfo, useLocale, useTranslation } from "@payloadcms/ui";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { z } from "zod";
import type { CustomKey, PsiKey } from "../i18n";

/**
 * The review panel in an article's sidebar: the stage, each language's review, the actions this
 * person may take (from the server: an author sees no approve buttons) and the document's log.
 * It only calls the review endpoints; every rule is enforced there.
 */
const Locale = z.object({
	exists: z.boolean(),
	state: z.string(),
	fresh: z.boolean(),
	reviewerName: z.string().nullable(),
	approvedAt: z.string().nullable(),
	notes: z.string().nullable(),
});
const Status = z.object({
	stage: z.string(),
	clinical: z.boolean(),
	locales: z.object({ ro: Locale, en: Locale }),
	can: z.object({ submit: z.boolean(), decide: z.boolean(), publish: z.boolean() }),
	trail: z.array(
		z.object({
			action: z.string(),
			locale: z.string().nullable(),
			notes: z.string().nullable(),
			at: z.string(),
			by: z.string().nullable(),
		}),
	),
});
type Status = z.infer<typeof Status>;
const Refusal = z.object({ error: z.string() });

const box = { marginBottom: "var(--base)", display: "grid", gap: "calc(var(--base) / 2)" } as const;
const muted = { color: "var(--theme-elevation-500)", fontSize: "0.85em" } as const;

export function ReviewPanel(): ReactElement | null {
	const { id, collectionSlug } = useDocumentInfo();
	const { code } = useLocale();
	const { t, i18n } = useTranslation<object, CustomKey>();
	const say = (k: PsiKey): string => t(`psi:${k}`);
	const [status, setStatus] = useState<Status | null>(null);
	const [notes, setNotes] = useState("");
	const [error, setError] = useState<string | null>(null);
	const base = `/api/review/${collectionSlug}/${id}`;

	const load = useCallback(async () => {
		if (id === undefined || id === null) return;
		const r = await fetch(`${base}/status`, { credentials: "include" });
		const parsed = Status.safeParse(r.ok ? await r.json() : null);
		setStatus(parsed.success ? parsed.data : null);
	}, [base, id]);
	useEffect(() => {
		void load();
	}, [load]);

	async function act(path: string, body?: object): Promise<void> {
		setError(null);
		const r = await fetch(`${base}/${path}`, {
			method: "POST",
			credentials: "include",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body ?? {}),
		});
		if (!r.ok) {
			const refusal = Refusal.safeParse(await r.json().catch(() => null));
			setError(refusal.success ? refusal.data.error : say("failed"));
			return;
		}
		setNotes("");
		// The form holds the document as it was loaded: reload so it shows the new stage.
		window.location.reload();
	}

	if (id === undefined || id === null) return <p style={muted}>{say("saveFirst")}</p>;
	if (status === null) return null;
	const locale = code === "en" ? "en" : "ro";
	const stageKey = `stage_${status.stage}`;
	const date = (iso: string): string => new Date(iso).toLocaleString(i18n.language);
	return (
		<div style={box}>
			<strong>{say("reviewTitle")}</strong>
			<div>
				<Pill>{isKey(stageKey) ? say(stageKey) : status.stage}</Pill>{" "}
				<span style={muted}>{say(status.clinical ? "clinicalGate" : "editorialGate")}</span>
			</div>
			{(["ro", "en"] as const).map((l) => {
				const s = status.locales[l];
				const stateKey = `state_${s.state}`;
				return (
					<div key={l} style={muted}>
						<b>{l.toUpperCase()}</b> {isKey(stateKey) ? say(stateKey) : s.state}
						{s.state === "approved" && !s.fresh ? ` (${say("stale")})` : ""}
						{s.reviewerName !== null ? ` · ${s.reviewerName}` : ""}
						{s.notes !== null ? ` · “${s.notes}”` : ""}
					</div>
				);
			})}
			{status.can.submit ? (
				<button
					type="button"
					className="btn btn--style-primary btn--size-small"
					onClick={() => void act("submit")}
				>
					{say("submit")}
				</button>
			) : null}
			{status.can.decide ? (
				<>
					<label htmlFor="psi-review-notes" style={muted}>
						{say("notes")} ({locale.toUpperCase()})
					</label>
					<textarea
						id="psi-review-notes"
						rows={3}
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
					/>
					<div style={{ display: "flex", gap: "calc(var(--base) / 2)" }}>
						<button
							type="button"
							className="btn btn--style-primary btn--size-small"
							onClick={() => void act(`${locale}/approve`, { notes })}
						>
							{say("approve")} {locale.toUpperCase()}
						</button>
						<button
							type="button"
							className="btn btn--style-secondary btn--size-small"
							onClick={() =>
								notes.trim() === ""
									? setError(say("notesRequired"))
									: void act(`${locale}/reject`, { notes })
							}
						>
							{say("reject")}
						</button>
					</div>
				</>
			) : null}
			{status.stage === "in_review" && !status.can.decide ? (
				<p style={muted}>{say("authorHint")}</p>
			) : null}
			{status.can.publish ? <p style={muted}>{say("publishHint")}</p> : null}
			{error !== null ? <p style={{ color: "var(--theme-error-500)" }}>{error}</p> : null}
			{status.trail.length > 0 ? (
				<details>
					<summary style={muted}>{say("history")}</summary>
					<ul style={{ ...muted, paddingLeft: "1em" }}>
						{status.trail.map((e) => {
							const actionKey = `action_${e.action}`;
							return (
								<li key={`${e.at}-${e.action}-${e.locale ?? ""}`}>
									{date(e.at)} · {isKey(actionKey) ? say(actionKey) : e.action}
									{e.locale !== null ? ` (${e.locale})` : ""}
									{e.by !== null ? ` · ${e.by}` : ""}
									{e.notes !== null ? ` · “${e.notes}”` : ""}
								</li>
							);
						})}
					</ul>
				</details>
			) : null}
		</div>
	);
}

const KEYS = new Set<string>([
	"stage_draft",
	"stage_in_review",
	"stage_changes_requested",
	"stage_approved",
	"state_pending",
	"state_changes_requested",
	"state_approved",
	"action_submit",
	"action_approve",
	"action_reject",
	"action_publish",
	"action_unpublish",
	"action_invalidate",
	"action_delete",
]);
function isKey(k: string): k is PsiKey {
	return KEYS.has(k);
}
