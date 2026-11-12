import { EMERGENCY } from "./emergency";
import type { RichPage } from "./types";

/** Sources: see methods-neuro.ts. */
export const TMS: RichPage = {
	seoTitle: {
		ro: "TMS în Galați: stimulare magnetică transcraniană",
		en: "TMS in Galați: transcranial magnetic stimulation",
	},
	seoDescription: {
		ro: "TMS la Psizone, Galați: stimulare magnetică transcraniană, 20–30 de minute pe ședință, protocol stabilit după evaluare psihologică și QEEG. Cum decurge, pentru cine nu este.",
		en: "TMS at Psizone in Galați: transcranial magnetic stimulation, 20–30 minutes a session, a protocol set after psychological evaluation and QEEG. How it goes, who it is not for.",
	},
	lead: {
		ro: "TMS folosește impulsuri magnetice scurte, aplicate pe scalp deasupra unei zone a creierului. Nu începe niciodată dintr-o ședință: întâi evaluarea, apoi un protocol stabilit pentru tine. O ședință durează 20–30 de minute.",
		en: "TMS uses short magnetic pulses applied to the scalp above one area of the brain. It never starts from a first session: the evaluation comes first, then a protocol set for you. A session lasts 20 to 30 minutes.",
	},
	procedure: { type: "TherapeuticProcedure" },
	sections: [
		{
			kind: "what",
			id: "ce-este",
			h2: { ro: "Ce este TMS, pe înțeles?", en: "What is TMS, in plain words?" },
			paras: [
				{
					ro: "TMS înseamnă stimulare magnetică transcraniană. Un aparat produce impulsuri magnetice focalizate, pe care le așază pe scalp, deasupra zonei pe care o vizăm. Nu se folosește anestezie și nu se introduce nimic în corp. Rămâi treaz și poți vorbi cu noi pe parcurs.",
					en: "TMS stands for transcranial magnetic stimulation. A device produces focused magnetic pulses and places them on the scalp, above the area we are targeting. No anaesthetic is used and nothing is put into the body. You stay awake and can talk to us throughout.",
				},
				{
					ro: "Impulsurile pot stimula o zonă cu activitate scăzută sau pot reduce activitatea uneia prea active. La noi, TMS nu este o metodă de sine stătătoare: se alege după evaluare și se poate combina cu neurofeedback, EQ-SYNC și psihoterapie de sprijin.",
					en: "The pulses can stimulate an area with low activity or reduce the activity of one that is too active. With us, TMS is not a stand-alone method: it is chosen after the evaluation and can be combined with neurofeedback, EQ-SYNC and supportive psychotherapy.",
				},
				{
					ro: "Este o metodă pe care o discutăm cu grijă. Dacă nu este potrivită, îți spunem și propunem altceva.",
					en: "It is a method we discuss with care. If it is not suitable, we tell you and suggest something else.",
				},
			],
		},
		{
			kind: "session",
			id: "cum-decurge",
			h2: { ro: "Cum decurge o ședință TMS?", en: "How does a TMS session go?" },
			paras: [
				{
					ro: "Înainte de prima ședință ai o evaluare psihologică și, unde este cazul, o hartă QEEG. Pe baza lor se stabilește protocolul. Apoi o ședință arată așa:",
					en: "Before the first session you have a psychological evaluation and, where appropriate, a QEEG map. The protocol is set from them. Then a session looks like this:",
				},
			],
			ordered: true,
			list: [
				{
					ro: "Vorbim puțin despre cum te simți și despre ce s-a schimbat de la ultima ședință.",
					en: "We talk briefly about how you feel and what has changed since the last session.",
				},
				{
					ro: "Te așezi confortabil într-un scaun. Bobina se așază pe scalp, în locul stabilit prin protocol.",
					en: "You sit comfortably in a chair. The coil is placed on the scalp at the spot set by the protocol.",
				},
				{
					ro: "Aparatul emite impulsurile. Simți, de obicei, o bătaie ușoară pe scalp. Dacă ceva te deranjează, spui și ajustăm sau oprim.",
					en: "The device delivers the pulses. You usually feel a light tapping on the scalp. If anything bothers you, you say so and we adjust or stop.",
				},
				{
					ro: "La final stăm câteva minute de vorbă, apoi poți merge mai departe cu ziua ta.",
					en: "At the end we chat for a few minutes, and then you can carry on with your day.",
				},
			],
		},
		{
			kind: "measured",
			id: "ce-masoara",
			h2: {
				ro: "Cum urmărim progresul pe parcurs?",
				en: "How do we follow progress along the way?",
			},
			paras: [
				{
					ro: "Punctul de plecare este evaluarea psihologică și, unde este cazul, harta QEEG. La reevaluare le comparăm cu situația de atunci. Pe lângă ele, la fiecare ședință te întrebăm cum a fost perioada dintre ședințe: somn, dispoziție, concentrare, energie.",
					en: "The starting point is the psychological evaluation and, where appropriate, the QEEG map. At re-evaluation we compare them with the situation then. Alongside them, at each session we ask how the time between sessions has been: sleep, mood, concentration, energy.",
				},
				{
					ro: "Îți arătăm ce s-a schimbat și ce nu. Dacă nu vedem nicio mișcare, nu continuăm din inerție: revizuim protocolul sau planul.",
					en: "We show you what has changed and what has not. If we see no movement, we do not carry on out of habit: we review the protocol or the plan.",
				},
			],
		},
		{
			kind: "for",
			id: "pentru-cine",
			h2: { ro: "Pentru cine este TMS?", en: "Who is TMS for?" },
			paras: [
				{
					ro: "TMS se discută cu adolescenți și adulți, în anumite situații: dificultăți afective precum depresia sau anxietatea, probleme de concentrare, recuperarea cognitivă după un AVC în protocoale mixte, durerile de cap sau insomniile legate de stres. Nu este o listă de promisiuni, ci temele la care ne gândim când vorbim cu tine.",
					en: "TMS is discussed with teenagers and adults in certain situations: mood difficulties such as depression or anxiety, problems with concentration, cognitive recovery after a stroke in mixed protocols, headaches or insomnia linked to stress. It is not a list of promises, but the topics we think of when we talk with you.",
				},
				{
					ro: "Decizia și protocolul se stabilesc după evaluare, împreună cu tine. Metoda este efectuată de psihologi și personal medical instruit în neurotehnologie aplicată.",
					en: "The decision and the protocol are made after the evaluation, together with you. The method is carried out by psychologists and medical staff trained in applied neurotechnology.",
				},
			],
		},
		{
			kind: "not-for",
			id: "pentru-cine-nu",
			h2: { ro: "Pentru cine nu este TMS?", en: "Who is TMS not for?" },
			paras: [
				{
					ro: "TMS nu înlocuiește tratamentul medical, psihiatric sau neurologic. Despre medicație discuți cu medicul psihiatru, iar nimic din tratamentul tău nu se oprește sau se schimbă din cauza TMS.",
					en: "TMS does not replace medical, psychiatric or neurological treatment. You discuss medication with your psychiatrist, and nothing in your treatment is stopped or changed because of TMS.",
				},
				{
					ro: "Înainte de a începe, verificăm într-o discuție medicală dacă metoda este sigură în cazul tău, inclusiv istoricul tău de sănătate. Dacă răspunsul nu este clar sau dacă există un motiv de prudență, nu începem și îți explicăm de ce. Aceasta este o regulă de bază pentru orice stimulare a creierului.",
					en: "Before we begin, we check in a medical conversation whether the method is safe in your case, including your health history. If the answer is unclear, or there is a reason for caution, we do not start and we explain why. This is a basic rule for any stimulation of the brain.",
				},
				{
					ro: "Nu este pentru situații de urgență sau de criză.",
					en: "It is not for emergencies or crises.",
				},
				EMERGENCY,
			],
		},
		{
			kind: "duration",
			id: "durata",
			h2: {
				ro: "Cât durează și câte ședințe sunt?",
				en: "How long does it take, and how many sessions are there?",
			},
			paras: [
				{
					ro: "O ședință durează 20–30 de minute. Numărul de ședințe este de obicei de 20–30, în funcție de situație. Protocolul se stabilește după evaluarea psihologică și QEEG, iar ritmul în care vii îți este spus la început.",
					en: "A session lasts 20 to 30 minutes. The number of sessions is usually 20 to 30, depending on the situation. The protocol is set after the psychological evaluation and QEEG, and the pace at which you come is told to you at the start.",
				},
				{
					ro: "Aceste cifre sunt un ordin de mărime, nu o promisiune. Planul tău poate arăta altfel.",
					en: "These figures are an order of magnitude, not a promise. Your plan may look different.",
				},
			],
		},
		{
			kind: "more",
			id: "evaluarea-inainte",
			h2: {
				ro: "De ce începe totul cu evaluarea?",
				en: "Why does everything start with the evaluation?",
			},
			paras: [
				{
					ro: "Pentru că aceeași etichetă, de exemplu „depresie”, poate însemna lucruri diferite la oameni diferiți. Evaluarea psihologică ne spune ce se întâmplă la tine, iar harta QEEG, unde o facem, ne dă un reper măsurat. Fără ele nu am ști unde să stimulăm și cum să vedem, mai târziu, dacă ceva s-a mișcat.",
					en: "Because the same label, for example “depression”, can mean different things in different people. The psychological evaluation tells us what is happening for you, and the QEEG map, where we do one, gives us a measured reference. Without them we would not know where to stimulate and how to see, later, whether anything has moved.",
				},
				{
					ro: "Tot atunci vorbim despre ce ai încercat până acum, despre ce te sprijină acasă și despre ce te îngrijorează în legătură cu metoda. Poți pleca de la evaluare fără să începi nimic: decizia este a ta.",
					en: "That is also when we talk about what you have tried so far, what supports you at home and what worries you about the method. You can leave the evaluation without starting anything: the decision is yours.",
				},
				{
					ro: "TMS rămâne o parte a planului, nu planul întreg. Psihoterapia, somnul, rutina și sprijinul celor apropiați contează la fel de mult, iar noi le urmărim în paralel.",
					en: "TMS stays one part of the plan, not the whole plan. Psychotherapy, sleep, routine and the support of those close to you matter just as much, and we follow them alongside.",
				},
			],
		},
		{
			kind: "more",
			id: "sprijin",
			h2: {
				ro: "Ce rol are sprijinul din jurul tău?",
				en: "What role does the support around you play?",
			},
			paras: [
				{
					ro: "Spune-le celor apropiați ce faci și ce să observe. Un partener, un părinte sau un prieten vede uneori schimbări pe care tu nu le vezi încă. Notează și tu câteva rânduri după fiecare ședință: cum ai dormit, cum a mers ziua. La reevaluare, notițele acelea cântăresc mult.",
					en: "Tell those close to you what you are doing and what to look out for. A partner, a parent or a friend sometimes sees changes you cannot see yet. Write a few lines of your own after each session: how you slept, how the day went. At re-evaluation, those notes weigh a great deal.",
				},
			],
		},
		{
			kind: "where",
			id: "unde-o-folosim",
			h2: { ro: "Unde folosim TMS la Psizone?", en: "Where do we use TMS at Psizone?" },
			paras: [
				{
					ro: "Îl avem în vedere în planurile pentru adulți, în special în cele legate de anxietate și depresie, și în recuperarea cognitivă după un AVC, mereu împreună cu alte metode.",
					en: "We consider it in plans for adults, especially those linked to anxiety and depression, and in cognitive recovery after a stroke, always together with other methods.",
				},
			],
		},
	],
	faq: [
		{
			q: { ro: "Doare TMS?", en: "Does TMS hurt?" },
			a: {
				ro: "De obicei simți o bătaie ușoară pe scalp. Unii oameni simt disconfort local sau oboseală. Spune-ne dacă te deranjează și ajustăm sau oprim.",
				en: "You usually feel a light tapping on the scalp. Some people feel local discomfort or tiredness. Tell us if it bothers you and we adjust or stop.",
			},
		},
		{
			q: { ro: "Cine face ședințele de TMS?", en: "Who carries out the TMS sessions?" },
			a: {
				ro: "Psihologi și personal medical instruit în neurotehnologie aplicată. La programare îți spunem cine te preia.",
				en: "Psychologists and medical staff trained in applied neurotechnology. When you book, we tell you who will look after you.",
			},
		},
		{
			q: {
				ro: "Pot veni direct la TMS, fără evaluare?",
				en: "Can I come straight to TMS without an evaluation?",
			},
			a: {
				ro: "Nu. Protocolul se stabilește după evaluarea psihologică și, unde este cazul, după harta QEEG.",
				en: "No. The protocol is set after the psychological evaluation and, where appropriate, the QEEG map.",
			},
		},
		{
			q: { ro: "Câte ședințe sunt necesare?", en: "How many sessions are needed?" },
			a: {
				ro: "Pentru TMS se vorbește de obicei despre 20–30 de ședințe, în funcție de situație. Numărul exact îl stabilim în plan.",
				en: "For TMS we usually talk about 20 to 30 sessions, depending on the situation. We set the exact number in the plan.",
			},
		},
		{
			q: {
				ro: "Pot continua tratamentul pe care îl am?",
				en: "Can I continue the treatment I am on?",
			},
			a: {
				ro: "Tratamentul prescris se discută doar cu medicul tău. TMS nu schimbă nimic din el și noi nu dăm sfaturi despre medicație.",
				en: "Prescribed treatment is discussed only with your doctor. TMS changes nothing in it and we give no advice about medication.",
			},
		},
		{
			q: { ro: "Se poate combina cu alte metode?", en: "Can it be combined with other methods?" },
			a: {
				ro: "Da. La noi se combină cu neurofeedback, cu EQ-SYNC și cu psihoterapie de sprijin, în același plan.",
				en: "Yes. With us it is combined with neurofeedback, EQ-SYNC and supportive psychotherapy, in the same plan.",
			},
		},
	],
	links: [
		{ label: { ro: "Evaluare și QEEG", en: "Evaluation and QEEG" }, href: "/metode/evaluare-qeeg" },
		{ label: { ro: "Neurofeedback", en: "Neurofeedback" }, href: "/metode/neurofeedback" },
		{
			label: { ro: "Anxietate și depresie la adulți", en: "Anxiety and depression in adults" },
			href: "/adulti/anxietate-depresie",
		},
		{ label: { ro: "După un AVC", en: "After a stroke" }, href: "/adulti/post-avc" },
		{
			label: { ro: "Cum arată prima vizită", en: "What the first visit is like" },
			href: "/prima-vizita",
		},
	],
	nextStep: {
		ro: "Dacă te întrebi dacă TMS ar avea sens pentru tine, programează o evaluare. Acolo începe totul.",
		en: "If you wonder whether TMS would make sense for you, book an evaluation. That is where everything starts.",
	},
};
