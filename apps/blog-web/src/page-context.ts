import { INCLUDE_DRAFTS } from "@psi/content";
import { createPageResolver, type PageResolve } from "@psi/guide";
import { createPageRegistry } from "@psi/ui";
import { findArticle } from "./content/articles";

/**
 * Where the blog's guide finds the page the visitor is reading: the blog's own articles (the CMS
 * snapshot over the repository's, read at the moment of the question) under the blog's draft
 * policy, and the blog's article policy for what a guide may read. A page it does not know, a draft
 * where drafts are not shown, or an article a brand's guide may not read, is no page at all.
 */
/**
 * Every other page of the blog (the index, a topic, an account page) as the blog renders it: title,
 * lead and headings. The index lists draft articles' cards, so no page here gives its text.
 */
export const pageRegistry = createPageRegistry({ withText: () => false });

export const pageResolver: PageResolve = createPageResolver({
	brand: "blog",
	rendered: pageRegistry.lookup,
	article: findArticle,
	includeDrafts: INCLUDE_DRAFTS,
});
