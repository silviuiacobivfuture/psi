import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const here = dirname(fileURLToPath(import.meta.url));

/** A self-contained server (`output: standalone`), traced from the repository root (pnpm links). */
const config: NextConfig = {
	output: "standalone",
	outputFileTracingRoot: join(here, "../.."),
	poweredByHeader: false,
};

export default withPayload(config, { devBundleServerPackages: false });
