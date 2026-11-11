import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { s3Storage } from "@payloadcms/storage-s3";
import { buildConfig } from "payload";
import sharp from "sharp";
import { authentikSignIn } from "./auth/authentik";
import { seedBreakGlass } from "./breakglass";
import { Articles } from "./collections/articles";
import { Media } from "./collections/media";
import { People } from "./collections/people";
import { Users } from "./collections/users";
import { parseEnv } from "./env";
import { i18n } from "./i18n";
import { migrations } from "./migrations";

const env = parseEnv(process.env);

export default buildConfig({
	secret: env.PAYLOAD_SECRET,
	serverURL: env.SERVER_URL,
	admin: {
		user: Users.slug,
		meta: { titleSuffix: " · Psi" },
		components: { afterLogin: ["/components/SignInWithDirectory#SignInWithDirectory"] },
		importMap: { baseDir: import.meta.dirname },
	},
	i18n,
	localization: { locales: ["ro", "en"], defaultLocale: "ro", fallback: false },
	collections: [Users, Articles, People, Media],
	editor: lexicalEditor(),
	graphQL: { disable: true },
	telemetry: false,
	typescript: { outputFile: `${import.meta.dirname}/payload-types.generated.ts` },
	db: postgresAdapter({
		pool: { connectionString: env.DATABASE_URI },
		// Schema changes ship as migrations (src/migrations), applied when the server starts.
		push: false,
		prodMigrations: migrations,
	}),
	sharp,
	plugins: [
		s3Storage({
			// One bucket per app per environment; this app's files under media/.
			collections: { media: { prefix: "media" } },
			bucket: env.S3_BUCKET,
			config: {
				endpoint: env.S3_ENDPOINT,
				region: env.S3_REGION,
				forcePathStyle: true,
				credentials: {
					accessKeyId: env.S3_ACCESS_KEY_ID,
					secretAccessKey: env.S3_SECRET_ACCESS_KEY,
				},
			},
		}),
		authentikSignIn(env),
	],
	onInit: async (payload) => {
		await seedBreakGlass(payload, env);
	},
});
