import { signPreview } from "@psi/cms-client";
import { z } from "zod";
import { env } from "../env";

const Id = z.union([z.string(), z.number()]).transform(String);
const Locale = z.enum(["ro", "en"]).catch("ro");

/**
 * The blog's signed preview of one article's latest draft in one locale, rendered by the blog's
 * own templates (`/_preview/<token>` on BLOG_PREVIEW_URL). Null, and no preview pane, until the
 * document is saved once or when the preview is not configured.
 */
export function previewUrl(id: unknown, locale: unknown): string | null {
	const e = env();
	const parsed = Id.safeParse(id);
	if (!parsed.success || e.BLOG_PREVIEW_URL === undefined || e.PREVIEW_SECRET === undefined) {
		return null;
	}
	const token = signPreview(parsed.data, Locale.parse(locale), e.PREVIEW_SECRET);
	return `${e.BLOG_PREVIEW_URL}/_preview/${token}`;
}
