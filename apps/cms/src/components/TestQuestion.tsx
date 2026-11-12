"use client";
import { type FormEvent, type ReactElement, useState } from "react";
import { z } from "zod";

/**
 * The AI section's test question: posts to /api/platform/ai/ask and shows the guide's answer as it
 * streams (NDJSON lines), then the sources it cited. Nothing is kept: not the question, not the
 * answer. The words come from the server view (the admin's language).
 */
const Line = z.discriminatedUnion("type", [
	z.object({ type: z.literal("text"), text: z.string() }),
	z.object({
		type: z.literal("sources"),
		sources: z.array(z.object({ title: z.string(), url: z.string() })),
	}),
	z.object({ type: z.literal("refusal"), reason: z.string() }),
	z.object({ type: z.literal("done") }),
]);

export interface TestQuestionProps {
	brand: string;
	labels: { ask: string; sources: string; refused: string; failed: string; hint: string };
}

function parse(raw: string): z.infer<typeof Line> | null {
	try {
		const r = Line.safeParse(JSON.parse(raw));
		return r.success ? r.data : null;
	} catch {
		return null;
	}
}

export function TestQuestion({ brand, labels }: TestQuestionProps): ReactElement {
	const [answer, setAnswer] = useState("");
	const [sources, setSources] = useState<ReadonlyArray<{ title: string; url: string }>>([]);
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);

	async function ask(e: FormEvent<HTMLFormElement>): Promise<void> {
		e.preventDefault();
		const form = new FormData(e.currentTarget);
		setAnswer("");
		setSources([]);
		setNote("");
		setBusy(true);
		try {
			const r = await fetch("/api/platform/ai/ask", {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ brand, question: form.get("question"), locale: form.get("locale") }),
			});
			if (!r.ok || r.body === null) {
				setNote(labels.failed);
				return;
			}
			const reader = r.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const parts = buffer.split("\n");
				buffer = parts.pop() ?? "";
				for (const raw of parts) {
					const line = parse(raw);
					if (line?.type === "text") setAnswer((a) => a + line.text);
					else if (line?.type === "sources") {
						// One line per cited page: two passages of the same page are one source.
						const seen = new Set<string>();
						setSources(
							line.sources.filter(
								(x) => !seen.has(`${x.title}|${x.url}`) && seen.add(`${x.title}|${x.url}`),
							),
						);
					} else if (line?.type === "refusal") setNote(`${labels.refused}: ${line.reason}`);
				}
			}
		} catch {
			setNote(labels.failed);
		} finally {
			setBusy(false);
		}
	}

	return (
		<form onSubmit={(e) => void ask(e)} style={{ display: "grid", gap: 8, maxWidth: "70ch" }}>
			<p style={{ color: "var(--theme-elevation-600)", margin: 0 }}>{labels.hint}</p>
			<textarea name="question" required minLength={3} maxLength={500} rows={3} />
			<div style={{ display: "flex", gap: 8 }}>
				<select name="locale" defaultValue="ro" aria-label="locale">
					<option value="ro">ro</option>
					<option value="en">en</option>
				</select>
				<button type="submit" disabled={busy}>
					{labels.ask}
				</button>
			</div>
			<output name="answer" aria-live="polite" style={{ whiteSpace: "pre-wrap" }}>
				{answer}
			</output>
			{note === "" ? null : <p>{note}</p>}
			{sources.length === 0 ? null : (
				<div>
					<strong>{labels.sources}</strong>
					<ul>
						{sources.map((s) => (
							<li key={`${s.title}|${s.url}`}>
								{s.title} <code>{s.url}</code>
							</li>
						))}
					</ul>
				</div>
			)}
		</form>
	);
}
