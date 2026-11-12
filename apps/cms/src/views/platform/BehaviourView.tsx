import { type AgentInfo, AI_SETTINGS_DEFAULTS, settingsFor } from "@psi/cms-client";
import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import type { ReactElement } from "react";
import { brandsFor } from "../../authz/access";
import type { Brand } from "../../authz/types";
import { Studio } from "../../components/studio/Studio";
import type { StudioInitial } from "../../components/studio/types";
import { scopeFor } from "../../platform/access";
import { SECTIONS } from "../../platform/sections";
import { controlFor, SCHEDULING_TENANTS } from "../../platform/services";
import { modelChoices, topicSuggestions } from "../../studio/catalog";
import { readDraft, readHistory } from "../../studio/history";
import { studioSettingsOf } from "../../studio/settings";
import { Shell, sayer } from "../shell";
import { BRAND_NAMES, BrandTabs, type Say } from "./parts";

/**
 * /admin/platform/ai/behaviour — the AI behaviour studio: how the brand's guide speaks, what it
 * says first, what it focuses on, which model answers, with a live preview of the unsaved
 * settings beside the controls. Viewing needs `read` on the brand; changing needs `ai_admin`;
 * the preview needs `ai_operator`.
 */
const PATH = "/admin/platform/ai/behaviour";

async function agentOf(brand: Brand, actor: string): Promise<AgentInfo | null> {
	const control = controlFor(brand);
	if (control === null) return null;
	const r = await control.agent(actor).catch(() => null);
	return r?.ok === true ? r.data : null;
}

async function initialFor(props: AdminViewServerProps, brand: Brand): Promise<StudioInitial> {
	const { req } = props.initPageResult;
	const actor = String(req.user?.id ?? "");
	const raw = await req.payload
		.findGlobal({ slug: "ai-settings", depth: 0, overrideAccess: false, user: req.user, req })
		.catch(() => null);
	const [admin, operator, draft, history, agent, models, topics] = await Promise.all([
		brandsFor(req, "ai_admin"),
		brandsFor(req, "ai_operator"),
		readDraft(req, brand),
		readHistory(req, brand, 15),
		agentOf(brand, actor),
		modelChoices(),
		topicSuggestions(req, brand),
	]);
	const stamps = settingsFor(raw, brand);
	const { updatedBy: _by, updatedAt: _at, ...defaults } = AI_SETTINGS_DEFAULTS;
	return {
		brand,
		brandName: BRAND_NAMES[brand],
		live: studioSettingsOf(raw, brand) ?? defaults,
		liveStamp: { by: stamps?.updatedBy ?? null, at: stamps?.updatedAt ?? null },
		draft: draft === null ? null : { settings: draft.settings, by: draft.by, at: draft.at },
		history: history.map((v) => ({
			id: v.id,
			by: v.by,
			at: v.at,
			note: v.note,
			settings: v.settings,
		})),
		defaults: agent?.copyDefaults ?? null,
		siteModel: agent?.model ?? null,
		models: [...models],
		topics,
		canEdit: admin.includes(brand),
		canPreview: operator.includes(brand),
		previewReady: controlFor(brand) !== null,
		books: SCHEDULING_TENANTS.some((t) => t === brand),
	};
}

export async function BehaviourView(props: AdminViewServerProps): Promise<ReactElement> {
	const say: Say = sayer(props);
	const { req } = props.initPageResult;
	if (!req.user) redirect(`/admin/login?redirect=${encodeURIComponent(PATH)}`);
	const scope = await scopeFor(req, SECTIONS.ai.view, props.searchParams?.brand);
	const brand = scope.brand;
	if (brand === null) {
		return (
			<Shell props={props} title={say("stTitle")} intro={say("stIntro")}>
				<p>{say("noBrand")}</p>
			</Shell>
		);
	}
	const initial = await initialFor(props, brand);
	return (
		<Shell props={props} title={say("stTitle")} intro={say("stIntro")}>
			<div className="psi-studio-top">
				<BrandTabs path={PATH} brands={scope.brands} brand={brand} />
				<a className="psi-studio-top__back" href={`/admin/platform/ai?brand=${brand}`}>
					{say("stBackToAi")}
				</a>
			</div>
			<Studio key={brand} initial={initial} />
		</Shell>
	);
}
