import type { Feed } from "@psi/notify/inbox";

/**
 * The person's notifications as the bell lists them: read, mark one and mark all as read, keyed by their estate
 * subject. In development an in-memory feed answers; with `NOVU_*` set, Novu's inbox does.
 */
export type NotificationsPort = Feed;
