import { SENTINELS } from "./sentinels";

/** The four feedback tables of the synthetic export, in the real shapes (lists of objects, text numbers, blanks). */
export function feedbackTables(T: string): Record<string, unknown[]> {
	return {
		session_feedback: [
			{
				id: 1,
				appointment_id: 100,
				client_id: 1,
				therapist_id: 1,
				created_at: T,
				updated_at: T,
				programs: [
					{
						name: "Test program A",
						notes: "Test note A",
						prompt: "full",
						sd: "Test SD",
						status: "active",
						success: 80,
					},
					{
						name: "Test program B",
						notes: "",
						prompt: "",
						sd: "",
						status: "mastered",
						success: "3/5",
					},
				],
				reward_quality: "good",
				intervention_efficiency: "Eficient",
				parent_feedback: SENTINELS.feedback,
				behaviors: ["Test behaviour"],
			},
			{
				id: 2,
				appointment_id: null,
				client_id: 3,
				therapist_id: 3,
				created_at: T,
				updated_at: T,
				programs: [],
				intervention_efficiency: "",
				parent_feedback: "",
			},
		],
		racemeup_feedback: [
			{
				id: 1,
				appointment_id: null,
				client_id: 3,
				therapist_id: 3,
				created_at: T,
				updated_at: T,
				posts: [
					{ key: "p1", notes: "Test post note", success: 2 },
					{ key: "p2", notes: null, success: null },
				],
				emotional_states: null,
				intervention_efficiency: "Parțial",
			},
		],
		psychotherapy_feedback: [
			{
				id: 1,
				appointment_id: 777,
				client_id: 1,
				therapist_id: 88,
				created_at: T,
				updated_at: T,
				session_number: "5",
				duration_min: "50 min",
				nfb_duration: "30",
				next_session_date: "2026-11-01",
			},
			{
				id: 2,
				appointment_id: null,
				client_id: 1,
				therapist_id: null,
				created_at: T,
				updated_at: T,
				duration_min: "",
				nfb_duration: "30 min",
			},
			{
				id: 3,
				appointment_id: null,
				client_id: 1,
				therapist_id: null,
				created_at: T,
				updated_at: T,
				duration_min: "about an hour",
				nfb_duration: "",
			},
		],
		parent_feedback: [
			{
				id: 1,
				appointment_id: null,
				client_id: 1,
				therapist_id: null,
				created_at: T,
				updated_at: T,
				reception_rating: 5,
				would_recommend: true,
			},
		],
	};
}
