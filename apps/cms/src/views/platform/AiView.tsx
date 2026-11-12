import { type AiSettings, settingsFor } from "@psi/cms-client";
import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import type { ReactElement } from "react";
import { z } from "zod";
import { brandsFor } from "../../authz/access";
import type { Brand } from "../../authz/types";
import { TestQuestion } from "../../components/TestQuestion";
import { scopeFor } from "../../platform/access";
import { type Questions, questionsSince, today } from "../../platform/questions";
import { SECTIONS } from "../../platform/sections";
import { controlFor, studioUrl } from "../../platform/services";
import { cell, Shell, sayer } from "../shell";
import { BrandTabs, box, buttonStyle, Flash, muted, problemWord, type Say, Table } from "./parts";

/**
 * /admin/platform/ai — the brand's guide on Mastra, read-only (the agent's voice, model, tools,
 * screening), its knowledge base (indexes and chunks, the embedder, the last rebuild), and the
 * operator's two actions: rebuild the index through the engine's ingestKnowledge workflow, and a
 * test question. Viewing needs `read` on the brand; acting needs `ai_operator`.
 */
const Counters = z.object({
	docs: z.array(z.object({ metric: z.string(), count: z.number() }).passthrough()),
});

const GUIDE_METRICS = [
	"guide_asked",
	"guide_unanswered",
	"guide_opened",
	"guide_nudge_shown",
	"guide_nudge_clicked",
];

async function guide30(
	props: AdminViewServerProps,
	brand: Brand,
): Promise<{ asked: number; unanswered: number; opened: number; shown: number; clicked: number }> {
	const { req } = props.initPageResult;
	const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
	const page = Counters.parse(
		await req.payload.find({
			collection: "analytics-daily",
			where: {
				and: [
					{ brand: { equals: brand } },
					{ day: { greater_than_equal: since } },
					{ metric: { in: GUIDE_METRICS } },
				],
			},
			pagination: false,
			depth: 0,
			overrideAccess: false,
			user: req.user,
			req,
		}),
	);
	const sum = (m: string) =>
		page.docs.filter((d) => d.metric === m).reduce((n, d) => n + d.count, 0);
	return {
		asked: sum("guide_asked"),
		unanswered: sum("guide_unanswered"),
		opened: sum("guide_opened"),
		shown: sum("guide_nudge_shown"),
		clicked: sum("guide_nudge_clicked"),
	};
}

async function settingsOf(props: AdminViewServerProps, brand: Brand): Promise<AiSettings | null> {
	const { req } = props.initPageResult;
	const raw = await req.payload
		.findGlobal({ slug: "ai-settings", depth: 0, overrideAccess: false, user: req.user, req })
		.catch(() => null);
	return settingsFor(raw, brand);
}

function Facts({ rows }: { rows: ReadonlyArray<readonly [string, string]> }): ReactElement {
	return (
		<dl
			style={{
				display: "grid",
				gridTemplateColumns: "max-content 1fr",
				gap: "4px 16px",
				margin: 0,
			}}
		>
			{rows.map(([k, v]) => (
				<div key={k} style={{ display: "contents" }}>
					<dt style={muted}>{k}</dt>
					<dd style={{ margin: 0 }}>{v}</dd>
				</div>
			))}
		</dl>
	);
}

export async function AiView(props: AdminViewServerProps): Promise<ReactElement> {
	const say: Say = sayer(props);
	const { req } = props.initPageResult;
	if (!req.user) redirect("/admin/login?redirect=%2Fadmin%2Fplatform%2Fai");
	const scope = await scopeFor(req, SECTIONS.ai.view, props.searchParams?.brand);
	const brand = scope.brand;
	if (brand === null) {
		return (
			<Shell props={props} title={say("aiTitle")} intro={say("aiIntro")}>
				<p>{say("noBrand")}</p>
			</Shell>
		);
	}
	const actor = String(req.user.id);
	const control = controlFor(brand);
	const operator = (await brandsFor(req, SECTIONS.ai.act)).includes(brand);
	const [agent, status, settings, counted, stored] = await Promise.all([
		control?.agent(actor) ?? null,
		control?.status(actor) ?? null,
		settingsOf(props, brand),
		guide30(props, brand).catch(() => ({
			asked: 0,
			unanswered: 0,
			opened: 0,
			shown: 0,
			clicked: 0,
		})),
		questionsSince(req, today()).catch((): Partial<Record<Brand, Questions>> => ({})),
	]);
	const kb = status?.ok ? status.data.knowledge : null;
	const todayQ = stored[brand] ?? { asked: 0, unanswered: 0 };
	const mismatch =
		kb?.embedder !== null &&
		kb?.embedder !== undefined &&
		settings !== null &&
		settings.embeddings === "openrouter" &&
		kb.embedder.kind === "openrouter" &&
		kb.embedder.model !== settings.embedModel;
	return (
		<Shell props={props} title={say("aiTitle")} intro={say("aiIntro")}>
			<BrandTabs path="/admin/platform/ai" brands={scope.brands} brand={brand} />
			<Flash props={props} say={say} />
			<p className="psi-studio-cta">
				<a className="psi-studio-cta__link" href={`/admin/platform/ai/behaviour?brand=${brand}`}>
					{say("stOpenStudio")} →
				</a>{" "}
				<span style={muted}>{say("stOpenStudioHint")}</span>
			</p>
			<p>
				<a href="/admin/globals/ai-settings">{say("navAiSettings")}</a> ·{" "}
				<a href={studioUrl()} target="_blank" rel="noreferrer">
					{say("studio")}
				</a>{" "}
				<span style={muted}>— {say("studioHint")}</span>
			</p>
			<section style={box}>
				<h2 style={{ marginTop: 0 }}>{say("agent")}</h2>
				{agent === null ? (
					<p>{say("notConfigured")}</p>
				) : !agent.ok ? (
					<p>{problemWord(say, agent.problem)}</p>
				) : (
					<>
						<Facts
							rows={[
								[say("agentId"), `${agent.data.name} (${agent.data.id})`],
								[
									say("model"),
									`${agent.data.model} · ${agent.data.hasKey ? say("keySet") : say("keyMissing")}`,
								],
								[say("screening"), agent.data.screeningLevel],
								[say("locales"), agent.data.locales.join(", ")],
								[say("workflows"), agent.data.workflows.join(", ")],
								...(agent.data.scheduling
									? [[say("svcScheduling"), say("schedulingAgent")] as const]
									: []),
							]}
						/>
						<h3>{say("tools")}</h3>
						<ul>
							{agent.data.tools.map((t) => (
								<li key={t.id}>
									<code>{t.id}</code> <span style={muted}>{t.description}</span>
								</li>
							))}
						</ul>
						<h3>
							{say("instructions")}{" "}
							<span style={{ ...muted, fontWeight: 400 }}>
								({agent.data.instructionsLength} {say("characters")})
							</span>
						</h3>
						<pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85em", ...muted }}>
							{agent.data.instructionsSummary}
						</pre>
					</>
				)}
			</section>
			<section style={box}>
				<h2 style={{ marginTop: 0 }}>{say("knowledgeBase")}</h2>
				{kb === null ? (
					<p>
						{status === null
							? say("notConfigured")
							: status.ok
								? ""
								: problemWord(say, status.problem)}
					</p>
				) : (
					<>
						<Facts
							rows={[
								[say("store"), kb.store ?? say("notConfigured")],
								[
									say("embedder"),
									kb.embedder === null ? "—" : `${kb.embedder.kind} (${kb.embedder.model})`,
								],
								[
									say("settingsEmbedModel"),
									settings === null ? "—" : `${settings.embeddings} (${settings.embedModel})`,
								],
								[
									say("lastIngest"),
									kb.lastIngest === null
										? say("never")
										: `${kb.lastIngest.at.slice(0, 16).replace("T", " ")} UTC · ${kb.lastIngest.entries} ${say("entries")} · ${kb.lastIngest.chunks} ${say("chunks")}`,
								],
							]}
						/>
						{mismatch ? (
							<p style={{ color: "var(--theme-warning-500)" }}>{say("embedMismatch")}</p>
						) : null}
						<Table
							head={[say("colIndex"), say("colLocale"), say("colChunks"), say("colDimension")]}
						>
							{kb.indexes.map((i) => (
								<tr key={i.name}>
									<td style={cell}>
										<code>{i.name}</code>
									</td>
									<td style={cell}>{i.locale}</td>
									<td style={{ ...cell, fontVariantNumeric: "tabular-nums" }}>{i.chunks}</td>
									<td style={cell}>{i.dimension ?? "—"}</td>
								</tr>
							))}
						</Table>
					</>
				)}
				<p>
					{say("unanswered30")}: {counted.unanswered} / {counted.asked}
					{` · ${say("todayQuestions")}: ${todayQ.asked} (${todayQ.unanswered} ${say("todayUnanswered")})`}
				</p>
				<p>
					{say("uptake30")}: {counted.opened} / {counted.shown} / {counted.clicked}
				</p>
			</section>
			{operator && control !== null ? (
				<>
					<section style={box}>
						<h2 style={{ marginTop: 0 }}>{say("rebuild")}</h2>
						<p style={muted}>{say("rebuildHint")}</p>
						<form method="post" action="/api/platform/ai/ingest">
							<input type="hidden" name="brand" value={brand} />
							<label style={{ display: "block", marginBottom: 8 }}>
								<input type="checkbox" name="includeSeed" value="on" defaultChecked />{" "}
								{say("includeSeed")}
							</label>
							<button type="submit" style={buttonStyle}>
								{say("rebuild")}
							</button>
						</form>
					</section>
					<section style={box}>
						<h2 style={{ marginTop: 0 }}>{say("testTitle")}</h2>
						<TestQuestion
							brand={brand}
							labels={{
								ask: say("testAsk"),
								sources: say("testSources"),
								refused: say("testRefused"),
								failed: say("actionFailed"),
								hint: say("testHint"),
							}}
						/>
					</section>
				</>
			) : (
				<p style={muted}>{say("needOperator")}</p>
			)}
		</Shell>
	);
}
