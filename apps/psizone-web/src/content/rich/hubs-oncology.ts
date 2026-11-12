import { buildHub, type HubSide } from "./hub-build";
import type { RichPage } from "./types";

/** DRAFT — clinical review pending; sources in hubs-adults.ts. */

const ONCOLOGY_RO: HubSide = {
	seoTitle: "Psiho-oncologie în Galați",
	seoDescription:
		"Sprijin psihologic la un diagnostic de cancer, pentru pacient și familie, la Psizone Galați: evaluare, psihoterapie, relaxare, consiliere familială.",
	lead: "Un diagnostic de cancer schimbă viața pacientului și a celor apropiați. Oferim sprijin psihologic, alături de tratamentul medical, pentru cel bolnav, pentru familie și pentru cei aflați în remisie.",
	parts: [
		{
			h2: "Ce este psiho-oncologia și când ajută?",
			paras: [
				"Probabil ți-ai spus deja că „trebuie să fii tare”. Poate o spui și celorlalți. Dar frica, furia, nopțile fără somn și senzația că nu mai controlezi nimic sunt reacții firești la un diagnostic de cancer, și nu trebuie să le duci singur.",
				"Psiho-oncologia este o ramură a psihologiei clinice care sprijină persoanele cu cancer și familiile lor. Se ocupă de felul în care boala schimbă emoțiile, gândurile și relațiile, din momentul diagnosticului și pe tot parcursul bolii, inclusiv la o recădere. Nu ne ocupăm doar de suferință, ci și de resursele pe care le ai și de sensul pe care îl dai acestui timp.",
				"Psiho-oncologia nu este tratament oncologic. Este sprijin psihologic care merge alături de el.",
			],
		},
		{
			h2: "Cum decurge sprijinul psiho-oncologic, pas cu pas?",
			paras: ["Începem cu o discuție, nu cu un formular. Pașii sunt, în linii mari, aceștia:"],
			list: [
				"Evaluarea psihologică inițială: cât de mare este distresul, cum faci față până acum și ce sprijin ai în familie.",
				"Planul personalizat: stabilim împreună cât de des ne vedem, ce urmărim și cum se potrivește sprijinul nostru cu tratamentele medicale.",
				"Intervenția propriu-zisă, cu metodele care ți se potrivesc, descrise mai jos.",
			],
		},
		{
			h2: "Cum urmărim progresul în psiho-oncologie?",
			paras: [
				"Nu există un scor al „curajului”, iar noi nu măsurăm ce nu se poate măsura. Pornim de la evaluarea inițială: cât de greu îți este, ce te apasă cel mai tare, cum dormi, cum vorbești cu cei apropiați. Obiectivele sunt ale tale și sunt scrise în cuvinte simple, de exemplu: să pot dormi mai bine, să pot vorbi cu soțul meu despre ce urmează.",
				"Revenim periodic la ele și ne întrebăm ce s-a schimbat și ce mai este greu. Unele zile vor fi mai bune, altele mai rele, iar planul se ajustează după tratamentele tale și după cum te simți. Nu așteptăm să te simți bine ca să continuăm.",
			],
		},
		{
			h2: "Pentru cine este sprijinul psiho-oncologic?",
			paras: [
				"Pentru pacient, pentru familie și pentru cei care au trecut prin boală. Nu contează tipul de cancer sau stadiul.",
			],
			list: [
				"Persoane diagnosticate cu cancer, în orice stadiu, la început de drum sau cu o recădere.",
				"Soți, copii și părinți, aparținători care au nevoie de sprijin emoțional și de consiliere.",
				"Persoane aflate în remisie, care se confruntă cu frica de recidivă, cu o criză de identitate sau cu greutăți la reintegrare.",
			],
		},
		{
			h2: "Ce metode folosim în psiho-oncologie?",
			paras: [
				"Alegem împreună ce ți se potrivește. Toate se folosesc ca sprijin psihologic, alături de îngrijirea oncologică:",
			],
			list: [
				"Psihoterapia individuală, de sprijin sau de explorare, pentru frică, tristețe, furie și pierderea controlului.",
				"Consilierea de familie și de cuplu, pentru conversațiile pe care nu știți cum să le începeți.",
				"Tehnici de relaxare, de respirație și mindfulness.",
				"EQ-SYNC, un program de relaxare ghidată prin sunet, folosit pentru somn și anxietate. Nu este un tratament medical.",
				"Hipnoterapia, ca sprijin psihologic alături de îngrijirea medicală pentru durere, greață, insomnie sau amintiri dificile.",
				"Terapia existențială, pentru sens, frica de moarte, acceptare și reconstrucție.",
			],
		},
		{
			h2: "Pentru cine nu este potrivită psiho-oncologia?",
			paras: [
				"Sprijinul nostru nu înlocuiește oncologul, tratamentul medical sau îngrijirea paliativă și nu schimbă nimic din ce ți-a recomandat medicul. Nu discutăm medicație: întrebările despre ea sunt pentru medicul tău. Dacă dorești, putem colabora cu medicii oncologi.",
				"Hipnoterapia și relaxarea sunt un sprijin psihologic. Nu opresc și nu tratează boala, iar pentru durere sau greață rămâi sub îngrijirea medicului.",
				"Nu este un serviciu de urgență. Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112. Dacă sprijinul ni se potrivește, stabilim la evaluare, nu înainte.",
			],
		},
		{
			h2: "Cât durează și cât de des ne vedem?",
			paras: [
				"Nu avem o durată standard sau un număr fix de ședințe. Cât durează o ședință, cât de des ne vedem și cât continuăm se stabilesc în planul personalizat, după evaluarea inițială, și se pot schimba odată cu tratamentele și cu starea ta.",
			],
		},
		{
			h2: "Unde are loc sprijinul psiho-oncologic în Galați?",
			paras: [
				"În centrul nostru din Galați. Adresa și telefoanele sunt pe pagina de contact. Dacă drumul este greu pentru tine în perioada tratamentului, spune-ne când ne suni.",
				"Prima întâlnire este o discuție, nu un interogatoriu: spui cât vrei și când vrei, în ritmul tău. Poți veni singur sau împreună cu cineva apropiat, iar dacă nu știi de unde să începi, spune-ne asta și începem de acolo.",
			],
		},
	],
	faq: [
		[
			"Trebuie să fiu bolnav ca să vin, sau pot veni ca aparținător?",
			"Poți veni ca aparținător. Soții, copiii și părinții au și ei nevoie de sprijin, iar sprijinul pentru ei este o parte a muncii noastre.",
		],
		[
			"Pot veni dacă sunt în remisie?",
			"Da. Frica de recidivă, schimbarea identității și reintegrarea sunt motive pentru care vin mulți oameni după tratament.",
		],
		[
			"Ce îi spun cuiva drag, în care nu știu cum să vorbesc?",
			"Nu există o formulă. Poți începe cu „nu știu ce să spun, dar vreau să fiu aici”. În consilierea de familie lucrăm tocmai la astfel de conversații.",
		],
		[
			"Hipnoterapia vindecă durerea sau greața?",
			"Nu promitem asta. Hipnoterapia este un sprijin psihologic, folosit alături de îngrijirea medicală. Pentru durere sau greață, medicul tău rămâne cel care te îngrijește.",
		],
		[
			"Colaborați cu oncologul meu?",
			"Putem colabora cu medicii oncologi, la cererea ta. Spune-ne dacă vrei acest lucru.",
		],
		[
			"Trebuie să mă simt bine ca să încep?",
			"Nu. Vii exact cum ești în ziua aceea. Cu cât ne spui mai sincer cum este, cu atât planul se potrivește mai bine.",
		],
	],
	nextStep:
		"Dacă vrei să începi, programează o evaluare: povestești cum este acum, iar noi construim împreună un plan potrivit tratamentului tău.",
};

const ONCOLOGY_EN: HubSide = {
	seoTitle: "Psycho-oncology in Galați",
	seoDescription:
		"Psychological support with a cancer diagnosis, for the patient and the family, at Psizone in Galați: evaluation, psychotherapy, relaxation, family counselling.",
	lead: "A cancer diagnosis changes the life of the patient and of the people close to them. We offer psychological support alongside medical treatment, for the person who is ill, for the family and for those in remission.",
	parts: [
		{
			h2: "What is psycho-oncology and when does it help?",
			paras: [
				"You have probably told yourself already that you “have to be strong”. Perhaps you say it to others too. But fear, anger, sleepless nights and the feeling that you no longer control anything are natural reactions to a cancer diagnosis, and you do not have to carry them alone.",
				"Psycho-oncology is a branch of clinical psychology that supports people with cancer and their families. It looks at how the illness changes emotions, thoughts and relationships, from the moment of diagnosis and throughout the illness, including a relapse. We do not only deal with suffering, but also with the resources you have and the meaning you give to this time.",
				"Psycho-oncology is not cancer treatment. It is psychological support that goes alongside it.",
			],
		},
		{
			h2: "How does psycho-oncological support go, step by step?",
			paras: ["We begin with a conversation, not a form. The steps are, broadly, these:"],
			list: [
				"The initial psychological evaluation: how great the distress is, how you have been coping and what support you have in your family.",
				"The personalised plan: together we set how often we meet, what we are working towards and how our support fits with your medical treatment.",
				"The work itself, using the methods that suit you, described below.",
			],
		},
		{
			h2: "How do we follow progress in psycho-oncology?",
			paras: [
				"There is no score for “courage”, and we do not measure what cannot be measured. We start from the initial evaluation: how hard it is for you, what weighs on you most, how you sleep, how you talk to the people close to you. The goals are yours and are written in simple words, for example: to sleep better, to be able to talk to my husband about what comes next.",
				"We come back to them regularly and ask what has changed and what is still hard. Some days will be better, others worse, and the plan adjusts to your treatment and to how you feel. We do not wait for you to feel well before we carry on.",
			],
		},
		{
			h2: "Who is psycho-oncological support for?",
			paras: [
				"For the patient, for the family and for those who have been through the illness. The type of cancer or the stage does not matter.",
			],
			list: [
				"People diagnosed with cancer, at any stage, at the start of the road or with a relapse.",
				"Spouses, children and parents, relatives who need emotional support and counselling.",
				"People in remission who face fear of recurrence, a crisis of identity or difficulty returning to everyday life.",
			],
		},
		{
			h2: "Which methods do we use in psycho-oncology?",
			paras: [
				"We choose together what suits you. All of them are used as psychological support, alongside oncological care:",
			],
			list: [
				"Individual psychotherapy, supportive or exploratory, for fear, sadness, anger and the loss of control.",
				"Family and couples counselling, for the conversations you do not know how to begin.",
				"Relaxation, breathing and mindfulness techniques.",
				"EQ-SYNC, a guided relaxation programme using sound, used for sleep and anxiety. It is not a medical treatment.",
				"Hypnotherapy, as psychological support alongside medical care for pain, nausea, insomnia or difficult memories.",
				"Existential therapy, for meaning, the fear of death, acceptance and rebuilding.",
			],
		},
		{
			h2: "Who is psycho-oncology not for?",
			paras: [
				"Our support does not replace your oncologist, medical treatment or palliative care, and it changes nothing of what your doctor has recommended. We do not discuss medication: questions about it are for your doctor. If you wish, we can work with oncologists.",
				"Hypnotherapy and relaxation are psychological support. They do not stop or treat the illness, and for pain or nausea you stay under your doctor’s care.",
				"This is not an emergency service. If you or someone close to you is in immediate danger, call 112. Whether our support suits you is decided at the evaluation, not beforehand.",
			],
		},
		{
			h2: "How long does it last and how often do we meet?",
			paras: [
				"There is no standard length or fixed number of sessions. How long a session lasts, how often we meet and how long we continue are set in the personalised plan after the initial evaluation, and can change with your treatment and your condition.",
			],
		},
		{
			h2: "Where does psycho-oncological support take place in Galați?",
			paras: [
				"At our centre in Galați. The address and phone numbers are on the contact page. If the journey is hard for you during treatment, tell us when you call.",
				"The first meeting is a conversation, not an interrogation: you say as much as you want, when you want, at your own pace. You can come alone or with someone close to you, and if you do not know where to begin, tell us so and we will begin there.",
			],
		},
	],
	faq: [
		[
			"Do I have to be the patient, or can I come as a relative?",
			"You can come as a relative. Spouses, children and parents need support too, and supporting them is part of our work.",
		],
		[
			"Can I come if I am in remission?",
			"Yes. Fear of recurrence, a changed sense of identity and getting back to everyday life are reasons many people come after treatment.",
		],
		[
			"What do I say to someone I love when I do not know how to talk to them?",
			"There is no formula. You can start with “I don’t know what to say, but I want to be here”. In family counselling we work on exactly this kind of conversation.",
		],
		[
			"Does hypnotherapy cure pain or nausea?",
			"We do not promise that. Hypnotherapy is psychological support, used alongside medical care. For pain or nausea your doctor remains the one who looks after you.",
		],
		[
			"Do you work with my oncologist?",
			"We can work with oncologists, at your request. Tell us if you would like that.",
		],
		[
			"Do I have to feel well to start?",
			"No. You come exactly as you are that day. The more honestly you tell us how things are, the better the plan fits.",
		],
	],
	nextStep:
		"If you would like to begin, book an evaluation: you tell us how things are now and together we build a plan that fits your treatment.",
};

export const ONCOLOGY: RichPage = buildHub(ONCOLOGY_RO, ONCOLOGY_EN, [
	["/metode/psihoterapie", "Psihoterapia la Psizone", "Psychotherapy at Psizone"],
	["/adulti/cuplu-familie", "Cuplu și familie", "Couples and family"],
	["/adulti/post-avc", "După un AVC", "After a stroke"],
	[
		"/adulti/anxietate-depresie",
		"Anxietate și depresie la adulți",
		"Anxiety and depression in adults",
	],
	["/prima-vizita", "Cum decurge prima vizită", "What the first visit is like"],
	["/intrebari-frecvente", "Întrebări frecvente", "Frequently asked questions"],
]);
