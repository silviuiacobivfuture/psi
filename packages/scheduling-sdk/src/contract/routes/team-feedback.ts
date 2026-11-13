import { route } from "../define";
import {
	FeedbackDetail,
	FeedbackLink,
	FeedbackLinkIssue,
	FeedbackLinkOpen,
	FeedbackLinkQuery,
	FeedbackLinkSubmit,
	FeedbackList,
	FeedbackListQuery,
	FeedbackReplied,
	FeedbackReplyBody,
	FeedbackStatusBody,
	FeedbackStatusChanged,
	FeedbackStored,
} from "../entities-feedback";
import { AppParam, IdParam } from "../primitives";

/**
 * What clients say, and the staff's answers. `links` is declared before `:id` so its path is never read as an id.
 * The two visitor routes are the page a client reaches from the e-mail: they take the signed token and nothing else.
 */
export const FEEDBACK_ROUTES = [
	route({
		id: "feedback.linkInspect",
		method: "GET",
		path: "/v1/apps/:app/feedback/by-link",
		side: "visitor",
		summary: "Whether a feedback link can still be used, and until when; writes nothing",
		params: AppParam,
		query: FeedbackLinkQuery,
		response: FeedbackLinkOpen,
	}),
	route({
		id: "feedback.linkSubmit",
		method: "POST",
		path: "/v1/apps/:app/feedback/by-link",
		side: "visitor",
		summary: "Leave feedback through a one-time link; the link is used up by the first submission",
		params: AppParam,
		body: FeedbackLinkSubmit,
		response: FeedbackStored,
	}),
	route({
		id: "feedback.issueLink",
		method: "POST",
		path: "/v1/apps/:app/feedback/links",
		side: "team",
		summary:
			"Sign a one-time feedback link for a finished appointment (for the after-appointment e-mail)",
		params: AppParam,
		body: FeedbackLinkIssue,
		response: FeedbackLink,
		permission: { key: "feedback_reply", target: { kind: "app" } },
		audit: "feedback.link",
	}),
	route({
		id: "feedback.list",
		method: "GET",
		path: "/v1/apps/:app/feedback",
		side: "team",
		summary:
			"Feedback, newest first; the rating and text only with the core group, who wrote it only with the contact group",
		params: AppParam,
		query: FeedbackListQuery,
		response: FeedbackList,
		permission: { key: "feedback_view", target: { kind: "app" } },
	}),
	route({
		id: "feedback.get",
		method: "GET",
		path: "/v1/apps/:app/feedback/:id",
		side: "team",
		summary: "One item with its replies (the replies are the core group)",
		params: IdParam,
		response: FeedbackDetail,
		permission: { key: "feedback_view", target: { kind: "app" } },
	}),
	route({
		id: "feedback.reply",
		method: "POST",
		path: "/v1/apps/:app/feedback/:id/replies",
		side: "team",
		summary: "Answer an item; it becomes answered. A closed item takes no reply",
		params: IdParam,
		body: FeedbackReplyBody,
		response: FeedbackReplied,
		permission: { key: "feedback_reply", target: { kind: "app" } },
		audit: "feedback.reply",
	}),
	route({
		id: "feedback.setStatus",
		method: "POST",
		path: "/v1/apps/:app/feedback/:id/status",
		side: "team",
		summary: "Mark an item read, close it, or reopen a closed one",
		params: IdParam,
		body: FeedbackStatusBody,
		response: FeedbackStatusChanged,
		permission: {
			key: "feedback_view",
			target: {
				kind: "dynamic",
				type: "sched_role",
				candidates: ["feedback_view", "feedback_close"],
			},
		},
		audit: "feedback.status",
	}),
] as const;
