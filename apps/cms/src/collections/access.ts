import type { Access, PayloadRequest } from "payload";

/** Anyone signed in to cms: the directory decides who can sign in at all. */
export const signedIn = ({ req }: { req: PayloadRequest }): boolean => Boolean(req.user);

/** Readers outside cms see published articles only; editors see every draft. */
export const publishedOrSignedIn: Access = ({ req }) =>
	req.user ? true : { status: { equals: "published" } };
