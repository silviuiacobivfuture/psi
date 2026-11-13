import { route } from "../define";
import { SeriesCancel, SeriesCreate, SeriesEdit, SeriesResult } from "../entities-series";
import { AppParam, Id } from "../primitives";

const SeriesParam = AppParam.extend({ seriesId: Id });

/**
 * Weekly series of appointments: made in one step, edited and cancelled as a whole, all or nothing. A refusal is a 409
 * whose `detail.conflicts` lists every occurrence that stopped it (see `SeriesConflict`); nothing is written.
 */
export const SERIES_ROUTES = [
	route({
		id: "series.create",
		method: "POST",
		path: "/v1/apps/:app/series",
		side: "team",
		summary:
			"Book a weekly series (until a date, or a number of times, at most 52): every appointment or none, with a series id",
		params: AppParam,
		body: SeriesCreate,
		response: SeriesResult,
		permission: {
			key: "appointments_create",
			target: {
				kind: "object",
				type: "sched_calendar",
				idFrom: { in: "body", key: "practitionerId" },
			},
		},
		audit: "series.create",
	}),
	route({
		id: "series.get",
		method: "GET",
		path: "/v1/apps/:app/series/:seriesId",
		side: "team",
		summary: "The appointments of one series, in time order, those the caller may see",
		params: SeriesParam,
		response: SeriesResult,
		permission: { key: "appointments_view", target: { kind: "list", type: "sched_appointment" } },
	}),
	route({
		id: "series.update",
		method: "PATCH",
		path: "/v1/apps/:app/series/:seriesId",
		side: "team",
		summary:
			"Change this appointment, this and the following, or the whole series, all or nothing; each one the caller must be allowed to edit",
		params: SeriesParam,
		body: SeriesEdit,
		response: SeriesResult,
		permission: {
			key: "appointments_edit",
			target: { kind: "dynamic", type: "sched_appointment", candidates: ["appointments_edit"] },
		},
		audit: "series.update",
	}),
	route({
		id: "series.cancel",
		method: "POST",
		path: "/v1/apps/:app/series/:seriesId/cancel",
		side: "team",
		summary:
			"Cancel this appointment, this and the following, or every one still to come, with the reason, all or nothing",
		params: SeriesParam,
		body: SeriesCancel,
		response: SeriesResult,
		permission: {
			key: "appointments_cancel",
			target: { kind: "dynamic", type: "sched_appointment", candidates: ["appointments_cancel"] },
		},
		audit: "series.cancel",
	}),
] as const;
