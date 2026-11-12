"use client";
import { useTranslation } from "@payloadcms/ui";
import { type ReactElement, useState } from "react";
import { z } from "zod";
import type { CustomKey, PsiKey } from "../../i18n";

/**
 * "Test retrieval": a query against the brand's index (the same tiers the guide searches),
 * showing the top chunks with scores and marking those from this source. No chat model.
 */
const Result = z.object({
	mode: z.enum(["semantic", "lexical"]),
	note: z.string().nullable(),
	hits: z.array(
		z.object({
			entryId: z.string(),
			title: z.string(),
			url: z.string(),
			text: z.string(),
			score: z.number(),
			fromThis: z.boolean(),
		}),
	),
});
type Result = z.infer<typeof Result>;

export function TestRetrieval({ base }: { base: string }): ReactElement {
	const { t } = useTranslation<object, CustomKey>();
	const say = (k: PsiKey): string => t(`psi:${k}`);
	const [query, setQuery] = useState("");
	const [result, setResult] = useState<Result | null>(null);
	const [failed, setFailed] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function run(): Promise<void> {
		if (query.trim() === "") return;
		setBusy(true);
		setFailed(null);
		try {
			const r = await fetch(`${base}/test-retrieval`, {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ query }),
			});
			const parsed = Result.safeParse(r.ok ? await r.json() : null);
			setResult(parsed.success ? parsed.data : null);
			if (!parsed.success) setFailed(`${say("ksTestFailed")} (${r.status})`);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div
			style={{
				border: "1px solid var(--theme-elevation-150)",
				borderRadius: 8,
				padding: "var(--base)",
				marginBottom: "var(--base)",
				display: "grid",
				gap: "calc(var(--base) / 2)",
			}}
		>
			<strong>{say("ksTest")}</strong>
			<p style={{ margin: 0, color: "var(--theme-elevation-600)" }}>{say("ksTestHint")}</p>
			{/* Not a <form>: this box sits inside the document's edit form, and forms do not nest. */}
			<div style={{ display: "flex", gap: 8 }}>
				<input
					type="search"
					value={query}
					maxLength={500}
					aria-label={say("ksTest")}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key !== "Enter") return;
						e.preventDefault();
						void run();
					}}
					style={{ flex: 1, padding: "4px 8px" }}
				/>
				<button
					type="button"
					disabled={busy}
					onClick={() => void run()}
					style={{ padding: "4px 12px", cursor: "pointer" }}
				>
					{say("ksTestAsk")}
				</button>
			</div>
			{failed === null ? null : <p role="alert">{failed}</p>}
			{result === null ? null : (
				<div role="status" style={{ display: "grid", gap: 6 }}>
					<span style={{ color: "var(--theme-elevation-600)" }}>
						{say("ksTestMode")}: {result.mode}
						{result.note === null ? "" : ` · ${result.note}`}
					</span>
					{result.hits.length === 0 ? <p>{say("ksTestNone")}</p> : null}
					<ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
						{result.hits.map((h) => (
							<li
								key={`${h.entryId}-${h.text.slice(0, 20)}`}
								style={{ fontWeight: h.fromThis ? 600 : 400 }}
							>
								<span style={{ fontFamily: "monospace" }}>{h.score.toFixed(3)}</span> · {h.title}
								{h.fromThis ? ` (${say("ksTestThis")})` : ""}
								<div
									style={{
										fontWeight: 400,
										color: "var(--theme-elevation-600)",
										fontSize: "0.85em",
									}}
								>
									{h.text}
								</div>
							</li>
						))}
					</ol>
				</div>
			)}
		</div>
	);
}
