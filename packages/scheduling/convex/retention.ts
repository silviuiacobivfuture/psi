import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { retentionAction } from "../src/domain/retention";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";

const PAGE = 200;
const MAX_PAGES = 100;

/** Applies the retention policy to one page of appointments; returns where to continue. */
export const purgePage = internalMutation({
	args: { now: v.number(), paginationOpts: paginationOptsValidator },
	handler: async (ctx, args): Promise<{ done: boolean; cursor: string }> => {
		const page = await ctx.db.query("appointments").paginate(args.paginationOpts);
		for (const row of page.page) {
			const action = retentionAction(
				{
					status: row.status,
					end: row.end,
					updatedAt: row.updatedAt,
					hasContact: row.contact !== undefined,
					submitted: row.submittedAt !== undefined,
				},
				args.now,
			);
			if (action === "delete") await ctx.db.delete(row._id);
			else if (action === "erase_contact") await ctx.db.patch(row._id, { contact: undefined });
		}
		return { done: page.isDone, cursor: page.continueCursor };
	},
});

/** The daily retention run: erases contacts and deletes records (appointments, then callback requests) past the policy's limits. */
export const purge = internalAction({
	args: {},
	handler: async (ctx): Promise<void> => {
		const now = Date.now();
		for (const page of [internal.retention.purgePage, internal.callbacks.purgePage]) {
			let cursor: string | null = null;
			for (let i = 0; i < MAX_PAGES; i += 1) {
				const result: { done: boolean; cursor: string } = await ctx.runMutation(page, {
					now,
					paginationOpts: { numItems: PAGE, cursor },
				});
				if (result.done) break;
				cursor = result.cursor;
			}
		}
	},
});
