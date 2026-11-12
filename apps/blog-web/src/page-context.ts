import { INCLUDE_DRAFTS } from "@psi/content";
import { createPageResolver, type PageResolve } from "@psi/guide";
import { findArticle } from "./content/articles";

/**
 * Where the blog's guide finds the page the visitor is reading: the blog's own articles (the CMS
 * snapshot over the repository's, read at the moment of the question) under the blog's draft
 * policy, and the blog's article policy for what a guide may read. A page it does not know, a draft
 * where drafts are not shown, or an article a brand's guide may not read, is no page at all.
 */
export const pageResolver: PageResolve = createPageResolver({
	brand: "blog",
	article: findArticle,
	includeDrafts: INCLUDE_DRAFTS,
});
