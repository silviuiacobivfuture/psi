import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("expire lapsed holds", { minutes: 1 }, internal.expiry.sweep, {});
crons.daily(
	"clinic erasure of deleted clients",
	{ hourUTC: 3, minuteUTC: 0 },
	internal.clinicRetention.erase,
	{},
);
crons.daily("change log retention", { hourUTC: 3, minuteUTC: 20 }, internal.changes.purge, {});
crons.daily("retention", { hourUTC: 2, minuteUTC: 30 }, internal.retention.purge, {});

export default crons;
