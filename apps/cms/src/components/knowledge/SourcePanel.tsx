"use client";
import { useDocumentInfo, useTranslation } from "@payloadcms/ui";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { z } from "zod";
import type { CustomKey, PsiKey } from "../../i18n";
import { StatusChip } from "./StatusCell";
import { TestRetrieval } from "./TestRetrieval";

/**
 * The source's detail panel: whether the guide uses it (status, counts, embedder, error), the
 * review gate (approve / reject for those who may), the operator's actions (re-index, remove
 * from index), the extracted text's beginning, its sections and chunks, and the test-retrieval
 * box. It only calls the source's endpoints; every rule is enforced there.
 */
const Panel = z.object({
	status: z.string(),
	error: z.string().nullable(),
	chars: z.number(),
	chunks: z.number(),
	sectionCount: z.number(),
	indexedAt: z.string().nullable(),
	embedder: z.string().nullable(),
	contentHash: z.string().nullable(),
	approval: z.object({
		state: z.string(),
		byName: z.string().nullable(),
		at: z.string().nullable(),
		current: z.boolean(),
		clinical: z.boolean(),
	}),
	can: z.object({ approve: z.boolean(), operate: z.boolean() }),
	preview: z.string(),
	sections: z.array(
		z.object({ title: z.string(), anchor: z.string(), chunks: z.number(), excerpt: z.string() }),
	),
});
type Panel = z.infer<typeof Panel>;
const Done = z.object({ done: z.string() });
const DONE_KEYS: Readonly<Record<string, PsiKey>> = {
	approved: "ksDone_approved",
	rejected: "ksDone_rejected",
	reindexed: "ksDone_reindexed",
	unchanged: "ksDone_unchanged",
	removed: "ksDone_removed",
};

const box = {
	border: "1px solid var(--theme-elevation-150)",
	borderRadius: 8,
	padding: "var(--base)",
	marginBottom: "var(--base)",
	display: "grid",
	gap: "calc(var(--base) / 2)",
} as const;
const muted = { color: "var(--theme-elevation-600)" } as const;
const cell = {
	padding: "4px 8px",
	borderBottom: "1px solid var(--theme-elevation-100)",
	textAlign: "left",
	verticalAlign: "top",
} as const;
const button = { padding: "4px 12px", cursor: "pointer" } as const;

export function SourcePanel(): ReactElement | null {
	const { id } = useDocumentInfo();
	const { t, i18n } = useTranslation<object, CustomKey>();
	const say = (k: PsiKey): string => t(`psi:${k}`);
	const [panel, setPanel] = useState<Panel | null>(null);
	const [note, setNote] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const base = `/api/knowledge-sources/${String(id)}`;

	const load = useCallback(async () => {
		if (id === undefined || id === null) return;
		const r = await fetch(`${base}/panel`, { credentials: "include", cache: "no-store" });
		const p = Panel.safeParse(r.ok ? await r.json() : null);
		setPanel(p.success ? p.data : null);
	}, [base, id]);

	useEffect(() => {
		void load();
		// While the background run moves the status along, look again every few seconds.
		const timer = setInterval(() => void load(), 4000);
		return () => clearInterval(timer);
	}, [load]);

	async function act(action: "approve" | "reject" | "reindex" | "remove"): Promise<void> {
		setBusy(true);
		setNote(null);
		try {
			const r = await fetch(`${base}/${action}`, {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: "{}",
			});
			const d = Done.safeParse(await r.json().catch(() => null));
			const key = d.success ? DONE_KEYS[d.data.done] : undefined;
			setNote(r.ok && key !== undefined ? say(key) : `${say("ksTestFailed")} (${r.status})`);
			await load();
		} finally {
			setBusy(false);
		}
	}

	if (id === undefined || id === null) return <p style={muted}>{say("ksSaveFirst")}</p>;
	if (panel === null) return null;
	const date = (iso: string | null): string =>
		iso === null ? "—" : new Date(iso).toLocaleString(i18n.language);
	const facts: ReadonlyArray<readonly [PsiKey, string]> = [
		["ksChars", String(panel.chars)],
		["ksSections", String(panel.sectionCount)],
		["ksChunks", String(panel.chunks)],
		["ksIndexedAt", date(panel.indexedAt)],
		["ksEmbedder", panel.embedder ?? "—"],
		["ksHash", panel.contentHash === null ? "—" : `${panel.contentHash.slice(0, 12)}…`],
	];
	const approved = panel.approval.state === "approved" && panel.approval.current;
	return (
		<section aria-labelledby="ks-panel" style={{ margin: "var(--base) 0" }}>
			<div style={box}>
				<h3 id="ks-panel" style={{ margin: 0, display: "flex", gap: 12, alignItems: "center" }}>
					{say("ksPanelTitle")} <StatusChip status={panel.status} />
				</h3>
				{panel.status === "indexed_lexical" ? (
					<p style={{ margin: 0 }}>{say("ksLexicalNote")}</p>
				) : null}
				{panel.error === null ? null : (
					<p role="alert" style={{ margin: 0, color: "var(--theme-error-500)" }}>
						{say("ksError")}: {panel.error}
					</p>
				)}
				<dl
					style={{
						display: "grid",
						gridTemplateColumns: "max-content 1fr",
						gap: "4px 16px",
						margin: 0,
					}}
				>
					{facts.map(([k, v]) => (
						<div key={k} style={{ display: "contents" }}>
							<dt style={muted}>{say(k)}</dt>
							<dd style={{ margin: 0 }}>{v}</dd>
						</div>
					))}
				</dl>
			</div>

			<div style={box}>
				<strong>{say("ksApproval")}</strong>
				<p style={{ margin: 0 }}>
					{approved
						? `${say("ksApprovedBy")} ${panel.approval.byName ?? "—"} · ${date(panel.approval.at)}`
						: panel.approval.state === "rejected"
							? say("ksRejected")
							: say("ksApprovalPending")}
				</p>
				{panel.approval.clinical ? (
					<p style={{ margin: 0, ...muted }}>{say("ksApprovalClinical")}</p>
				) : null}
				<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
					{panel.can.approve && !approved ? (
						<button
							type="button"
							style={button}
							disabled={busy}
							onClick={() => void act("approve")}
						>
							{say("ksApprove")}
						</button>
					) : null}
					{panel.can.approve && panel.approval.state !== "rejected" ? (
						<button type="button" style={button} disabled={busy} onClick={() => void act("reject")}>
							{say("ksReject")}
						</button>
					) : null}
					{panel.can.operate ? (
						<>
							<button
								type="button"
								style={button}
								disabled={busy}
								onClick={() => void act("reindex")}
							>
								{say("ksReindex")}
							</button>
							<button
								type="button"
								style={button}
								disabled={busy}
								onClick={() => void act("remove")}
							>
								{say("ksRemove")}
							</button>
						</>
					) : null}
				</div>
				{!panel.can.approve && !panel.can.operate ? (
					<p style={{ margin: 0, ...muted }}>{say("ksNoRights")}</p>
				) : null}
				{note === null ? null : (
					<p role="status" style={{ margin: 0 }}>
						{note}
					</p>
				)}
			</div>

			{panel.can.operate ? <TestRetrieval base={base} /> : null}

			<div style={box}>
				<strong>{say("ksChunkList")}</strong>
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<thead>
						<tr>
							{(["ksColSection", "ksColAnchor", "ksColChunks", "ksColExcerpt"] as const).map(
								(k) => (
									<th key={k} style={cell}>
										{say(k)}
									</th>
								),
							)}
						</tr>
					</thead>
					<tbody>
						{panel.sections.map((s) => (
							<tr key={s.anchor}>
								<td style={cell}>{s.title || "—"}</td>
								<td style={{ ...cell, fontFamily: "monospace" }}>#{s.anchor}</td>
								<td style={cell}>{s.chunks}</td>
								<td style={{ ...cell, ...muted }}>{s.excerpt}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div style={box}>
				<strong>{say("ksPreview")}</strong>
				{panel.preview === "" ? (
					<p style={muted}>{say("ksPreviewEmpty")}</p>
				) : (
					<pre
						style={{
							whiteSpace: "pre-wrap",
							maxHeight: 320,
							overflow: "auto",
							margin: 0,
							fontSize: "0.85em",
						}}
					>
						{panel.preview}
					</pre>
				)}
			</div>
		</section>
	);
}
