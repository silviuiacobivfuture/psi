import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { s3Storage } from "@payloadcms/storage-s3";
import { buildConfig, type Plugin } from "payload";
import sharp from "sharp";
import { analyticsIngest } from "./analytics/ingest";
import { authentikSignIn } from "./auth/authentik";
import { brandListFilter } from "./brand/filter";
import { seedBreakGlass } from "./breakglass";
import { AnalyticsDaily } from "./collections/analytics-daily";
import { Articles, articleReview } from "./collections/articles";
import { KnowledgeEntries, knowledgeReview } from "./collections/knowledge-entries";
import { KnowledgeSources } from "./collections/knowledge-sources";
import { Media } from "./collections/media";
import { Offerings, offeringReview } from "./collections/offerings";
import { People } from "./collections/people";
import { ReviewEvents } from "./collections/review-events";
import { Users } from "./collections/users";
import { BRANDS as ARTICLE_BRANDS } from "./collections/vocabulary";
import { type Env, parseEnv, s3Of } from "./env";
import { AiSettingsGlobal } from "./globals/ai-settings";
import { SiteSettingsGlobal } from "./globals/site-settings";
import { i18n } from "./i18n";
import { migrations } from "./migrations";
import { aiEndpoints } from "./platform/endpoints-ai";
import { peopleEndpoints } from "./platform/endpoints-people";
import { schedulingEndpoints } from "./platform/endpoints-scheduling";
import { reviewEndpoints } from "./review/endpoints";
import { statusEndpoint } from "./review/status";

const env = parseEnv(process.env);
/** This directory, from the module URL (the dev bundler's `import.meta.dirname` is not it). */
const here = path.dirname(fileURLToPath(import.meta.url));

/** Media in the estate's object storage; on a workstation without S3_*, on local disk. */
function storage(e: Env): Plugin[] {
	const s3 = s3Of(e);
	if (s3 === null) return [];
	return [
		s3Storage({
			// One bucket per app per environment; this app's files under media/.
			collections: { media: { prefix: "media" }, "knowledge-sources": { prefix: "knowledge" } },
			bucket: s3.bucket,
			config: {
				endpoint: s3.endpoint,
				region: s3.region,
				forcePathStyle: true,
				credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
			},
		}),
	];
}

const REVIEWED = [articleReview, knowledgeReview, offeringReview];

export default buildConfig({
	secret: env.PAYLOAD_SECRET,
	serverURL: env.SERVER_URL,
	// Cookies are honoured from this origin only (Payload adds serverURL; stated for the reader).
	csrf: [env.SERVER_URL],
	cors: [],
	admin: {
		user: Users.slug,
		meta: { titleSuffix: " · Psi" },
		components: {
			afterLogin: ["/components/SignInWithDirectory#SignInWithDirectory"],
			beforeNavLinks: ["/components/AdminNav#AdminNav"],
			// psi's mark: the sign-in page (Logo) and the navigation's corner (Icon).
			graphics: {
				Logo: "/components/brand/PsiMark#PsiLogo",
				Icon: "/components/brand/PsiMark#PsiIcon",
			},
			views: {
				review: { Component: "/views/ReviewQueueView#ReviewQueueView", path: "/review" },
				analytics: { Component: "/views/AnalyticsView#AnalyticsView", path: "/analytics" },
				// The control plane: nav group "Platformă / Platform".
				platform: {
					Component: "/views/platform/OverviewView#OverviewView",
					path: "/platform",
					exact: true,
				},
				platformAi: { Component: "/views/platform/AiView#AiView", path: "/platform/ai" },
				platformScheduling: {
					Component: "/views/platform/SchedulingView#SchedulingView",
					path: "/platform/scheduling",
				},
				platformAccounts: {
					Component: "/views/platform/AccountsView#AccountsView",
					path: "/platform/accounts",
				},
				platformNotifications: {
					Component: "/views/platform/NotificationsView#NotificationsView",
					path: "/platform/notifications",
				},
			},
		},
		importMap: {
			baseDir: here,
			importMapFile: path.resolve(here, "app/(payload)/admin/importMap.js"),
		},
		livePreview: {
			breakpoints: [
				{ label: "Mobile", name: "mobile", width: 390, height: 844 },
				{ label: "Desktop", name: "desktop", width: 1280, height: 900 },
			],
		},
	},
	i18n,
	localization: { locales: ["ro", "en"], defaultLocale: "ro", fallback: false },
	collections: [
		Users,
		{ ...Articles, admin: { ...Articles.admin, baseListFilter: brandListFilter(ARTICLE_BRANDS) } },
		KnowledgeEntries,
		KnowledgeSources,
		Offerings,
		People,
		Media,
		ReviewEvents,
		AnalyticsDaily,
	],
	globals: [AiSettingsGlobal, SiteSettingsGlobal],
	endpoints: [
		...reviewEndpoints(REVIEWED),
		statusEndpoint(REVIEWED),
		analyticsIngest,
		...aiEndpoints,
		...schedulingEndpoints,
		...peopleEndpoints,
	],
	editor: lexicalEditor(),
	graphQL: { disable: true },
	telemetry: false,
	typescript: { outputFile: path.resolve(here, "payload-types.generated.ts") },
	db: postgresAdapter({
		pool: { connectionString: env.DATABASE_URI },
		// Schema changes ship as migrations (src/migrations), applied when the server starts.
		push: false,
		prodMigrations: migrations,
	}),
	sharp,
	plugins: [...storage(env), authentikSignIn(env)],
	onInit: async (payload) => {
		await seedBreakGlass(payload, env);
	},
});
