import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import type { ReactElement } from "react";
import { z } from "zod";
import type { PsiKey } from "../i18n";
import { previewUrl } from "../preview/url";
import { queueSources } from "./queue-sources";
import { cell, Shell, sayer } from "./shell";

/**
 * /admin/review — the review queue: everything submitted, sent back or approved and not yet
 * published, in the brands this person may read (the query runs with their access, not the
 * server's). Newest submission first.
 */
const STAGES = ["in_review", "changes_requested", "approved"] as const;
const Row = z
	.object({
		id: z.union([z.number(), z.string()]),
		brand: z.string(),
		kind: z.string().nullish(),
		_status: z.string().nullish(),
		workflow: z
			.object({ stage: z.string().nullish(), submittedAt: z.string().nullish() })
			.nullish(),
		review: z.record(z.object({ state: z.string().nullish() }).passthrough().nullish()).nullish(),
	})
	.passthrough();
const Page = z.object({ docs: z.array(Row) });

type Item = { collection: string; title: string; row: z.infer<typeof Row> };

async function queue(props: AdminViewServerProps): Promise<Item[]> {
	const { req } = props.initPageResult;
	const out: Item[] = [];
	for (const { slug: collection, titleField } of queueSources(req.payload.config.collections)) {
		const page = Page.parse(
			await req.payload.find({
				collection,
				where: {
					and: [
						{ "workflow.stage": { in: [...STAGES] } },
						{ _status: { not_equals: "published" } },
					],
				},
				draft: true,
				locale: "all",
				depth: 0,
				limit: 200,
				overrideAccess: false,
				user: req.user,
				req,
			}),
		);
		for (const row of page.docs) {
			const title = z
				.object({ ro: z.string().nullish(), en: z.string().nullish() })
				.safeParse(row[titleField]);
			out.push({
				collection,
				row,
				title: (title.success ? (title.data.ro ?? title.data.en) : null) ?? String(row.id),
			});
		}
	}
	return out.sort((a, b) =>
		(b.row.workflow?.submittedAt ?? "").localeCompare(a.row.workflow?.submittedAt ?? ""),
	);
}

const STAGE_KEYS: Readonly<Record<string, PsiKey>> = {
	in_review: "stage_in_review",
	changes_requested: "stage_changes_requested",
	approved: "stage_approved",
};
const STATE_KEYS: Readonly<Record<string, PsiKey>> = {
	pending: "state_pending",
	changes_requested: "state_changes_requested",
	approved: "state_approved",
};

export async function ReviewQueueView(props: AdminViewServerProps): Promise<ReactElement> {
	const say = sayer(props);
	// Payload renders a custom view for anyone: this one is for signed-in people only.
	if (!props.initPageResult.req.user) redirect("/admin/login?redirect=%2Fadmin%2Freview");
	const items = await queue(props).catch((err: unknown) => {
		props.initPageResult.req.payload.logger.error({ err: String(err) }, "review queue failed");
		return [];
	});
	const lang = props.initPageResult.req.i18n.language;
	return (
		<Shell props={props} title={say("queueTitle")} intro={say("queueIntro")}>
			{items.length === 0 ? (
				<p>{say("queueEmpty")}</p>
			) : (
				<table style={{ width: "100%", borderCollapse: "collapse", marginTop: "var(--base)" }}>
					<thead>
						<tr>
							{(
								[
									"colTitle",
									"colBrand",
									"colKind",
									"colStage",
									"colLocales",
									"colSubmitted",
									"colPreview",
								] as const
							).map((k) => (
								<th key={k} style={cell}>
									{say(k)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{items.map(({ collection, row, title }) => {
							const stage = row.workflow?.stage ?? "";
							const preview = collection === "articles" ? previewUrl(row.id, "ro") : null;
							const kind =
								collection === "articles"
									? row.kind === "editorial"
										? say("kind_editorial")
										: say("kind_health")
									: say("kind_knowledge");
							return (
								<tr key={`${collection}-${row.id}`}>
									<td style={cell}>
										<a href={`/admin/collections/${collection}/${row.id}`}>{title}</a>
									</td>
									<td style={cell}>{row.brand}</td>
									<td style={cell}>{kind}</td>
									<td style={cell}>
										{STAGE_KEYS[stage] !== undefined ? say(STAGE_KEYS[stage]) : stage}
									</td>
									<td style={cell}>
										{(["ro", "en"] as const).map((l) => {
											const s = row.review?.[l]?.state ?? "pending";
											const key = STATE_KEYS[s];
											return (
												<div key={l}>
													{l.toUpperCase()}: {key !== undefined ? say(key) : s}
												</div>
											);
										})}
									</td>
									<td style={cell}>
										{row.workflow?.submittedAt
											? new Date(row.workflow.submittedAt).toLocaleString(lang)
											: say("noData")}
									</td>
									<td style={cell}>
										{preview !== null ? (
											<a href={preview} target="_blank" rel="noreferrer">
												{say("openPreview")}
											</a>
										) : (
											say("noData")
										)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			)}
		</Shell>
	);
}
