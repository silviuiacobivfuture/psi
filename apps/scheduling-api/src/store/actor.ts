import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who is acting, for the store. A collection's `insert`/`replace`/`remove` carry a row, not a person, but the Convex
 * wrappers record WHO changed what in the same transaction as the write. The HTTP layer runs each handler inside
 * `withActor(subject, ...)`; the Convex adapter reads it with `currentActor()`. Outside a request (a job, a test of the
 * adapter) the actor is `system:api`.
 */
const scope = new AsyncLocalStorage<string>();

export const SYSTEM_ACTOR = "system:api";

export function withActor<T>(subject: string, run: () => Promise<T>): Promise<T> {
	return scope.run(subject, run);
}

export function currentActor(): string {
	return scope.getStore() ?? SYSTEM_ACTOR;
}
