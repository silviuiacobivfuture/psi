import type { RichPage } from "./types";

/**
 * DRAFT — written by an AI from the old psizone.ro pages
 * /terapie-individuala-interventie-in-anxietate-si-depresie/ and /anxietate-si-atac-de-panica/
 * (read 2026-11-12) and the repo's brand docs; clinical review pending. Kept: what individual
 * therapy is, when it is needed, how we work (initial evaluation, goals, monitoring), the methods
 * (CBT, ACT, mindfulness, supportive and exploratory), the complementary neurofeedback and TMS, the
 * autonomic-nervous-system explanation of panic. Left out on purpose: "neurofeedback rezolvă",
 * "corectăm nivelul de excitare", "obiective terapeutice" phrased as outcomes, EQ-SYNC. TMS is
 * stated as a medical method decided with a doctor. No dosage, no medication advice.
 */
export const ADULTS: RichPage = {
	seoTitle: {
		ro: "Terapie pentru anxietate și depresie, Galați",
		en: "Therapy for anxiety and depression in Galați",
	},
	seoDescription: {
		ro: "Psihoterapie individuală pentru adulți în Galați: anxietate, atacuri de panică, depresie, burnout. Evaluare, obiective clare, CBT, ACT, mindfulness.",
		en: "Individual psychotherapy for adults in Galați: anxiety, panic attacks, depression, burnout. Evaluation, clear goals, CBT, ACT, mindfulness, confidential.",
	},
	lead: {
		ro: "Dacă ai ajuns să te întrebi „oare mai fac față?”, nu ești slab, ești obosit. Terapia individuală e un loc în care vorbești cu un psiholog, fără grabă și fără judecată.",
		en: "If you have come to ask yourself “can I still cope?”, you are not weak, you are tired. Individual therapy is a place where you talk to a psychologist, without hurry and without judgement.",
	},
	sections: [
		{
			kind: "what",
			id: "ce-este",
			h2: { ro: "Ce este terapia individuală?", en: "What is individual therapy?" },
			paras: [
				{
					ro: "Este o formă de intervenție psihologică în care lucrezi unu-la-unu cu un psiholog. Scopul e să înțelegi de unde vine suferința emoțională, să îți gestionezi gândurile negative și temerile, să îți reglezi reacțiile emoționale și comportamentale și să-ți recapeți echilibrul și stima de sine.",
					en: "It is a form of psychological intervention in which you work one-to-one with a psychologist. The aim is to understand where emotional distress comes from, to manage negative thoughts and fears, to regulate emotional and behavioural reactions and to regain balance and self-esteem.",
				},
				{
					ro: "La Psizone lucrăm cu metode validate științific, într-un cadru empatic, profesionist și confidențial.",
					en: "At Psizone we use scientifically validated methods, in an empathic, professional and confidential setting.",
				},
			],
		},
		{
			kind: "for",
			id: "cand",
			h2: { ro: "Când merită să ceri ajutor?", en: "When is it worth asking for help?" },
			paras: [
				{
					ro: "Nu trebuie să ajungi la capăt ca să vii. E momentul să te gândești la terapie dacă, de luni de zile sau chiar mai mult, te regăsești în câteva dintre acestea:",
					en: "You do not have to reach the end of your rope to come. It is time to think about therapy if, for months or longer, you recognise yourself in several of these:",
				},
			],
			list: [
				{
					ro: "anxietate constantă, gânduri care se învârt, atacuri de panică;",
					en: "constant anxiety, racing thoughts, panic attacks;",
				},
				{
					ro: "tristețe profundă, lipsă de energie, retragere de la oameni;",
					en: "deep sadness, lack of energy, withdrawing from people;",
				},
				{
					ro: "stres cronic, epuizare psihică, burnout;",
					en: "chronic stress, mental exhaustion, burnout;",
				},
				{
					ro: "somn prost, insomnie sau somn agitat;",
					en: "poor sleep, insomnia or restless sleep;",
				},
				{
					ro: "lipsă de motivație, dificultate de concentrare sau de a lua decizii;",
					en: "lack of motivation, trouble concentrating or making decisions;",
				},
				{
					ro: "sentimentul că nu mai faci față vieții.",
					en: "the feeling that you can no longer cope with life.",
				},
			],
		},
		{
			kind: "what",
			id: "panica",
			h2: { ro: "Ce este un atac de panică?", en: "What is a panic attack?" },
			paras: [
				{
					ro: "Anxietatea apare în multe forme, de la fobii la anxietate generalizată. Ea e, la origine, un semnal de alarmă. Sistemul nervos autonom, cel care controlează ritmul inimii, tensiunea și respirația, devine foarte activ, iar simptomele pot escalada într-un atac de panică: palpitații, transpirații, agitație, senzația că ceva rău urmează. Sistemul de alarmă al creierului e greu de oprit după ce a fost supraactivat.",
					en: "Anxiety comes in many forms, from phobias to generalised anxiety. At its root it is an alarm signal. The autonomic nervous system, which controls heart rate, blood pressure and breathing, becomes very active, and the symptoms can escalate into a panic attack: palpitations, sweating, restlessness, a sense that something bad is about to happen. The brain's alarm system is hard to switch off once it has been overactivated.",
				},
				{
					ro: "Un atac de panică e înfricoșător, dar în sine nu e periculos. Dacă e prima dată, dacă ai dureri în piept sau simptome care te sperie, mergi întâi la medic, ca să excluzi o cauză fizică. Terapia lucrează apoi cu frica de frică.",
					en: "A panic attack is frightening, but in itself it is not dangerous. If it is the first time, or you have chest pain or symptoms that scare you, see a doctor first to rule out a physical cause. Therapy then works with the fear of the fear.",
				},
			],
		},
		{
			kind: "measured",
			id: "cum-lucram",
			h2: { ro: "Cum lucrăm?", en: "How do we work?" },
			paras: [
				{
					ro: "Începem cu o evaluare inițială detaliată: vorbim despre simptome, despre istoria ta emoțională și despre nevoile de acum. Stabilim obiective terapeutice realiste, concentrate pe lucruri concrete, de exemplu să poți conduce fără panică sau să adormi mai ușor. Apoi urmărim progresul și te sprijinim activ pe parcurs, cu un ritm adaptat personalității tale.",
					en: "We begin with a detailed initial evaluation: we talk about your symptoms, your emotional history and your needs right now. We set realistic therapeutic goals focused on concrete things, such as being able to drive without panic or falling asleep more easily. Then we follow your progress and support you actively along the way, at a pace adapted to your personality.",
				},
			],
		},
		{
			kind: "more",
			id: "metode",
			h2: { ro: "Ce metode folosim?", en: "Which methods do we use?" },
			paras: [],
			list: [
				{
					ro: "Terapie cognitiv-comportamentală (CBT): identificăm gândurile negative și le restructurăm.",
					en: "Cognitive-behavioural therapy (CBT): we identify negative thoughts and restructure them.",
				},
				{
					ro: "ACT (terapia prin acceptare și angajament): lucrăm cu valorile tale personale și cu acceptarea emoțiilor.",
					en: "ACT (acceptance and commitment therapy): we work with your personal values and with accepting emotions.",
				},
				{
					ro: "Mindfulness și reglare emoțională: exerciții care reduc anxietatea și te ancorează în prezent.",
					en: "Mindfulness and emotional regulation: exercises that reduce anxiety and anchor you in the present.",
				},
				{
					ro: "Terapie suportivă și de explorare, pentru claritate, validare și creștere interioară.",
					en: "Supportive and exploratory therapy, for clarity, validation and inner growth.",
				},
			],
		},
		{
			kind: "more",
			id: "complementare",
			h2: {
				ro: "Când se adaugă neurofeedback sau TMS?",
				en: "When are neurofeedback or TMS added?",
			},
			paras: [
				{
					ro: "Unde evaluarea o justifică, putem recomanda o hartă cerebrală QEEG și neurofeedback, un antrenament prin care înveți să-ți reglezi activitatea creierului, ca metodă complementară pentru anxietate, stres și somn. TMS (stimulare magnetică transcraniană) este o metodă medicală, discutată cu medicul, pentru depresia care nu s-a ameliorat cu alte tratamente. Nu înlocuiesc terapia psihologică sau recomandările medicale.",
					en: "Where the evaluation justifies it, we can recommend a QEEG brain map and neurofeedback, a training in which you learn to regulate your brain activity, as a complementary method for anxiety, stress and sleep. TMS (transcranial magnetic stimulation) is a medical method, discussed with your doctor, for depression that has not improved with other treatments. Neither replaces psychological therapy or medical advice.",
				},
			],
		},
		{
			kind: "session",
			id: "sedinta",
			h2: { ro: "Cum arată o ședință?", en: "What does a session look like?" },
			paras: [
				{
					ro: "Vii, te așezi, vorbești despre ce s-a întâmplat de la ultima întâlnire. Psihologul ascultă, pune întrebări și, când se potrivește, îți propune un exercițiu: un mod nou de a privi o situație, o tehnică de respirație, o temă mică pentru săptămâna următoare. Nu trebuie să știi ce vrei să spui, nici să ai o „problemă destul de mare”. Prima ședință e despre a ne cunoaște, iar durata și frecvența se stabilesc împreună, după evaluare.",
					en: "You come, you sit down, you talk about what has happened since the last time. The psychologist listens, asks questions and, when it fits, suggests an exercise: a new way of looking at a situation, a breathing technique, a small task for the coming week. You do not need to know what you want to say, nor to have a “big enough problem”. The first session is about getting to know each other, and length and frequency are set together, after the evaluation.",
				},
			],
		},
		{
			kind: "more",
			id: "forme",
			h2: {
				ro: "Individual, în cuplu, în grup sau online?",
				en: "Individual, as a couple, in a group or online?",
			},
			paras: [
				{
					ro: "Pentru anxietate și depresie, punctul de pornire e de obicei terapia individuală. Dacă tensiunea e în relație, există terapie de cuplu și de familie. Pentru probleme anume, de exemplu o boală gravă sau dezvoltarea personală, se pot forma grupuri de intervenție specifică. Ședințele se pot face și online, de pe telefon sau calculator, cu căști, de oriunde ai liniște, ceea ce ajută când nu ai timp sau nu poți ajunge la cabinet.",
					en: "For anxiety and depression the starting point is usually individual therapy. If the tension is in the relationship, there is couple and family therapy. For specific issues, such as a serious illness or personal development, groups with a specific focus can be formed. Sessions can also be held online, from a phone or computer with headphones, from wherever you have quiet, which helps when you are short of time or cannot get to the practice.",
				},
			],
		},
		{
			kind: "not-for",
			id: "limite",
			h2: {
				ro: "Ce nu poate face terapia și ce nu promitem?",
				en: "What can therapy not do, and what do we not promise?",
			},
			paras: [
				{
					ro: "Terapia nu e un înlocuitor pentru un consult medical sau psihiatric atunci când e nevoie de el, iar despre medicație vorbești cu medicul tău: noi nu o recomandăm și nu o oprim. Nu promitem vindecare și nici un număr de ședințe. Promitem un cadru sigur, obiective clare și o măsurare cinstită a progresului.",
					en: "Therapy is not a substitute for a medical or psychiatric consultation when you need one, and medication is something you discuss with your doctor: we neither recommend nor stop it. We promise neither a cure nor a number of sessions. We promise a safe setting, clear goals and an honest measure of progress.",
				},
				{
					ro: "Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.",
					en: "If you or someone close to you is in immediate danger, call 112.",
				},
			],
		},
	],
	faq: [
		{
			q: {
				ro: "Cum știu dacă am nevoie de terapie?",
				en: "How do I know whether I need therapy?",
			},
			a: {
				ro: "Dacă un tipar de anxietate, tristețe sau epuizare durează de luni de zile și îți afectează somnul, munca sau relațiile, merită o discuție. Nu trebuie să fie „destul de grav”.",
				en: "If a pattern of anxiety, sadness or exhaustion has lasted for months and affects your sleep, work or relationships, it is worth a conversation. It does not have to be “serious enough”.",
			},
		},
		{
			q: {
				ro: "Ce se întâmplă la prima ședință?",
				en: "What happens at the first session?",
			},
			a: {
				ro: "Vorbim despre simptomele tale, istoria ta emoțională și ce speri să se schimbe. La final stabilim împreună obiective și un ritm.",
				en: "We talk about your symptoms, your emotional history and what you hope will change. At the end we set goals and a rhythm together.",
			},
		},
		{
			q: {
				ro: "Ce diferență e între burnout și depresie?",
				en: "What is the difference between burnout and depression?",
			},
			a: {
				ro: "Burnoutul pornește de obicei din epuizare legată de muncă sau de rol, iar depresia se întinde în toate zonele vieții. Se pot suprapune, de aceea nu le diferențiem singuri: evaluarea clarifică.",
				en: "Burnout usually starts from exhaustion linked to work or a role, whereas depression spreads across every area of life. They can overlap, which is why you should not tell them apart alone: an evaluation clarifies.",
			},
		},
		{
			q: {
				ro: "Terapia e confidențială?",
				en: "Is therapy confidential?",
			},
			a: {
				ro: "Da. Lucrăm într-un cadru confidențial și respectuos, iar psihologii respectă regulile profesiei.",
				en: "Yes. We work in a confidential, respectful setting, and psychologists follow the rules of the profession.",
			},
		},
		{
			q: {
				ro: "Neurofeedbackul sau TMS înlocuiesc terapia?",
				en: "Do neurofeedback or TMS replace therapy?",
			},
			a: {
				ro: "Nu. Sunt metode complementare, recomandate doar când evaluarea le justifică. TMS este o metodă medicală pe care o discuți cu medicul.",
				en: "No. They are complementary methods, recommended only when the evaluation justifies them. TMS is a medical method you discuss with your doctor.",
			},
		},
		{
			q: {
				ro: "Cât durează terapia?",
				en: "How long does therapy last?",
			},
			a: {
				ro: "Depinde de obiective și de ritmul tău. O estimare cinstită putem face după evaluare și o revizuim periodic.",
				en: "It depends on your goals and your pace. We can give an honest estimate after the evaluation and review it regularly.",
			},
		},
		{
			q: {
				ro: "Se poate face terapia online?",
				en: "Can therapy be done online?",
			},
			a: {
				ro: "Da. Psihoterapia individuală, cea de familie și de cuplu și hipnoterapia se pot face online, cu o aplicație pe telefon sau calculator, căști și un loc liniștit.",
				en: "Yes. Individual psychotherapy, family and couple therapy and hypnotherapy can be done online, with an app on a phone or computer, headphones and a quiet place.",
			},
		},
	],
	links: [
		{ label: { ro: "Cuplu și familie", en: "Couples and family" }, href: "/adulti/cuplu-familie" },
		{
			label: { ro: "Metoda: psihoterapie", en: "The method: psychotherapy" },
			href: "/metode/psihoterapie",
		},
		{
			label: { ro: "Prima vizită, pas cu pas", en: "The first visit, step by step" },
			href: "/prima-vizita",
		},
	],
	nextStep: {
		ro: "Următorul pas: programează o evaluare. Prima discuție e despre tine, nu despre diagnostic.",
		en: "Next step: book an evaluation. The first conversation is about you, not about a diagnosis.",
	},
};
