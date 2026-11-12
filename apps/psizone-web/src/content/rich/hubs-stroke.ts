import { buildHub, type HubSide } from "./hub-build";
import type { RichPage } from "./types";

/** DRAFT — clinical review pending; sources in hubs-adults.ts. */

const STROKE_RO: HubSide = {
	seoTitle: "Sprijin psihologic după AVC, Galați",
	seoDescription:
		"Sprijin psihologic și recuperare cognitivă după un AVC la Psizone, Galați: evaluare, psihoterapie, neurofeedback și sprijin pentru familie.",
	lead: "După un AVC se schimbă corpul, dar adesea și felul în care gândești, simți și te raportezi la cei din jur. Lucrăm psihologic și cognitiv, ca un complement al recuperării medicale, și avem grijă și de familie.",
	parts: [
		{
			h2: "Ce se poate schimba emoțional și cognitiv după un AVC?",
			paras: [
				"Poate ai observat că tatăl tău a devenit irascibil, sau că tu te enervezi pentru lucruri mici. Că uită ce tocmai i-ai spus, caută cuvinte, se retrage din conversații. Că plânge fără motiv sau nu mai vrea să iasă din casă. Nu e capriciu și nu e lipsă de voință. După un AVC pot fi afectate atenția, memoria, limbajul și raționamentul, iar peste ele vin anxietatea, tristețea, iritabilitatea, rușinea și sentimentul că nu mai ești cel de dinainte.",
				"La Psizone lucrăm cu persoane după un AVC și cu familiile lor. Programul este un complement al recuperării medicale (neurologie, recuperare fizică, tratamentul pe care ți-l stabilește medicul), nu o alternativă la ea. Ne ocupăm de partea psihologică și cognitivă și de felul în care familia se descurcă în noua realitate.",
			],
		},
		{
			h2: "Cum decurge un program după AVC, pas cu pas?",
			paras: [
				"Programul are patru părți. Nu se fac toate la fel pentru toată lumea: ce intră în plan depinde de evaluare.",
			],
			list: [
				"Evaluarea inițială: testare neuropsihologică a funcțiilor afectate, evaluarea stării emoționale și harta cerebrală QEEG.",
				"Intervenția psihologică personalizată: terapie de sprijin, tehnici de adaptare la schimbare, psihoterapie cognitivă și existențială și consiliere pentru familie.",
				"Reabilitarea neurocognitivă: exerciții de orientare, de memorie de lucru, de atenție, de planificare și coordonare mentală, de recuperare a limbajului în afazii parțiale, neurofeedback personalizat și programul de sunet EQ-SYNC.",
				"Sprijinul pentru familie: ședințe de informare, ghidare în felul în care vorbiți cu persoana care a avut AVC și prevenirea epuizării celui care îngrijește.",
			],
		},
		{
			h2: "Cum vedem ce s-a schimbat?",
			paras: [
				"Evaluarea de la început este reperul. Ea ne arată de unde pornim, ce funcții sunt afectate și cum este starea emoțională. La reevaluare măsurăm din nou față de acest reper, ca să vă arătăm ce s-a schimbat și ce nu, în loc să ne bazăm pe impresii. Acolo unde am făcut o hartă QEEG, o putem compara cu una nouă.",
				"Alături de teste urmărim lucruri mai simple, pe care le vedeți voi: cât de bine ține persoana un fir într-o conversație, cum își organizează ziua, cum reacționează când se enervează, cât de obosită este familia. Obiectivele le stabilim cu voi, în cuvinte concrete, iar planul se ajustează când ceva nu merge.",
			],
		},
		{
			h2: "Pentru cine este programul după AVC?",
			paras: [
				"Pentru persoanele care au avut un AVC și pentru familiile și aparținătorii lor. Programul se adresează și celui care îngrijește, pentru că epuizarea celui care îngrijește este reală și se vede rar.",
			],
			list: [
				"Persoane care au avut un AVC și observă schimbări de atenție, memorie, limbaj sau raționament.",
				"Persoane care se simt anxioase, triste sau irascibile după AVC, care se rușinează sau se izolează.",
				"Soți, copii și părinți care nu mai știu cum să vorbească cu persoana dragă și simt că obosesc.",
			],
		},
		{
			h2: "Ce metode folosim după un AVC?",
			paras: [
				"Alegem din metodele centrului ce se potrivește situației, nu aplicăm același pachet tuturor:",
			],
			list: [
				"Evaluarea și harta cerebrală QEEG sunt punctul de pornire al planului.",
				"Psihoterapia: terapie de sprijin, psihoterapie cognitivă și existențială, consiliere pentru familie.",
				"Neurofeedback personalizat, în exercițiile de reabilitare neurocognitivă.",
				"TMS (stimularea magnetică transcraniană) poate face parte din protocoale mixte pentru recuperare cognitivă; se discută după evaluare.",
				"EQ-SYNC, un program de sunet ghidat, ca sprijin pentru relaxare și reglare. Nu este un tratament medical.",
			],
		},
		{
			h2: "Pentru cine nu este potrivit programul după AVC?",
			paras: [
				"Programul nu înlocuiește neurologul, recuperarea fizică sau tratamentul prescris de medic. Întrebările despre medicație sau despre orice simptom nou se discută cu medicul tău. Noi nu schimbăm și nu sfătuim nimic în privința medicației.",
				"Nu este un serviciu de urgență. Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112, la fel ca în cazul oricărui semn nou și brusc de AVC. Dacă programul ți se potrivește, stabilim la evaluare, nu înainte.",
			],
		},
		{
			h2: "Cât durează programul și cât de des venim?",
			paras: [
				"Nu avem o durată fixă și nu o publicăm dinainte, pentru că un AVC nu seamănă cu altul. Durata ședințelor, cât de des ne vedem și cât ține programul se stabilesc în planul personalizat, după evaluarea inițială, și se ajustează pe parcurs.",
			],
		},
		{
			h2: "Unde are loc programul după AVC în Galați?",
			paras: [
				"În centrul nostru din Galați. Adresa și telefoanele sunt pe pagina de contact. Dacă mobilitatea este o problemă, spune-ne când ne suni: o discutăm înainte de prima vizită.",
			],
		},
	],
	faq: [
		[
			"Este normal să fiu mai irascibil sau mai trist după un AVC?",
			"Schimbările emoționale sunt frecvente după un AVC și nu înseamnă slăbiciune. Merită discutate cu medicul și cu un psiholog, ca să știi ce se întâmplă și ce poți face.",
		],
		[
			"Programul înlocuiește recuperarea medicală?",
			"Nu. Este un complement. Recuperarea medicală și fizică, cu medicul tău, rămâne la locul ei.",
		],
		[
			"Dar dacă persoana nu poate vorbi bine?",
			"Planul se adaptează. Exercițiile de limbaj pentru afazii parțiale fac parte din reabilitarea neurocognitivă, iar evaluarea ne arată ce se poate face și cum.",
		],
		[
			"Pot veni și eu, ca membru al familiei?",
			"Da. Sprijinul pentru familie este o parte a programului: informare, ghidare în comunicare și prevenirea epuizării celui care îngrijește.",
		],
		[
			"Este nevoie de hartă cerebrală QEEG?",
			"Evaluarea inițială include testare neuropsihologică, evaluarea stării emoționale și QEEG. Dacă QEEG este potrivit în cazul tău, se hotărăște la evaluare.",
		],
		[
			"Se poate începe oricând după AVC?",
			"Momentul potrivit îl stabilești cu medicul tău. Când vrei să începi partea psihologică și cognitivă, ne poți contacta și te ghidăm.",
		],
	],
	nextStep:
		"Dacă vrei să începi, programează o evaluare: aflăm de unde pornim, iar planul îl construim împreună cu tine și cu familia.",
};

const STROKE_EN: HubSide = {
	seoTitle: "Support after a stroke, Galați",
	seoDescription:
		"Psychological support and cognitive recovery after a stroke at Psizone, Galați: evaluation, psychotherapy, neurofeedback and support for the family.",
	lead: "After a stroke the body changes, and often so do the way you think, feel and relate to the people around you. We work psychologically and cognitively, alongside medical recovery, and we look after the family too.",
	parts: [
		{
			h2: "What can change emotionally and cognitively after a stroke?",
			paras: [
				"You may have noticed that your father has become irritable, or that you lose your temper over small things. That he forgets what you have just told him, searches for words, withdraws from conversations. That he cries for no reason or no longer wants to leave the house. This is not a whim and it is not a lack of willpower. After a stroke, attention, memory, language and reasoning can be affected, and on top of that come anxiety, sadness, irritability, shame and the feeling that you are no longer who you were.",
				"At Psizone we work with people after a stroke and with their families. The programme complements medical recovery (neurology, physical rehabilitation, the treatment your doctor sets), it is not an alternative to it. We look after the psychological and cognitive side and how the family copes with the new reality.",
			],
		},
		{
			h2: "How does a post-stroke programme go, step by step?",
			paras: [
				"The programme has four parts. They are not all done the same way for everyone: what goes into the plan depends on the evaluation.",
			],
			list: [
				"The initial evaluation: neuropsychological testing of the affected functions, an assessment of the emotional state, and a QEEG brain map.",
				"Personalised psychological work: supportive therapy, techniques for adapting to change, cognitive and existential psychotherapy, and counselling for the family.",
				"Neurocognitive rehabilitation: exercises for orientation, working memory, attention, planning and mental coordination, language recovery in partial aphasia, personalised neurofeedback and the EQ-SYNC sound programme.",
				"Support for the family: information sessions, guidance on how to talk with the person who had the stroke, and preventing exhaustion in the person who cares for them.",
			],
		},
		{
			h2: "How do we see what has changed?",
			paras: [
				"The first evaluation is the reference. It shows us where we start, which functions are affected and how the emotional state is. At re-evaluation we measure again against that reference, so we can show you what has changed and what has not, rather than rely on impressions. Where we made a QEEG map, we can compare it with a new one.",
				"Alongside tests we follow simpler things that you can see: how well the person holds a thread in a conversation, how they organise their day, how they react when they get angry, how tired the family is. We set the goals with you, in concrete words, and the plan is adjusted when something is not working.",
			],
		},
		{
			h2: "Who is the post-stroke programme for?",
			paras: [
				"For people who have had a stroke and for their families and carers. The programme is also for the person who provides the care, because the exhaustion of a carer is real and is rarely seen.",
			],
			list: [
				"People who have had a stroke and notice changes in attention, memory, language or reasoning.",
				"People who feel anxious, sad or irritable after a stroke, who feel ashamed or are isolating themselves.",
				"Spouses, children and parents who no longer know how to talk to the person they love and feel themselves wearing out.",
			],
		},
		{
			h2: "Which methods do we use after a stroke?",
			paras: [
				"We choose from the centre’s methods what fits the situation; we do not apply the same package to everyone:",
			],
			list: [
				"Evaluation and the QEEG brain map are the starting point of the plan.",
				"Psychotherapy: supportive therapy, cognitive and existential psychotherapy, counselling for the family.",
				"Personalised neurofeedback, within the neurocognitive rehabilitation exercises.",
				"TMS (transcranial magnetic stimulation) can be part of mixed protocols for cognitive recovery; this is discussed after the evaluation.",
				"EQ-SYNC, a sound-guided programme, as support for relaxation and regulation. It is not a medical treatment.",
			],
		},
		{
			h2: "Who is the post-stroke programme not for?",
			paras: [
				"The programme does not replace your neurologist, physical rehabilitation or the treatment prescribed by your doctor. Questions about medication or any new symptom are for your doctor. We do not change or advise anything about medication.",
				"It is not an emergency service. If you or someone close to you is in immediate danger, call 112, as you would for any new and sudden sign of a stroke. Whether the programme suits you is decided at the evaluation, not beforehand.",
			],
		},
		{
			h2: "How long does the programme last and how often do we meet?",
			paras: [
				"We have no fixed length and we do not publish one in advance, because no stroke is like another. The length of the sessions, how often we meet and how long the programme runs are set in the personalised plan after the initial evaluation, and adjusted as we go.",
			],
		},
		{
			h2: "Where does the post-stroke programme take place in Galați?",
			paras: [
				"At our centre in Galați. The address and phone numbers are on the contact page. If getting around is difficult, tell us when you call: we will discuss it before the first visit.",
			],
		},
	],
	faq: [
		[
			"Is it normal to be more irritable or sadder after a stroke?",
			"Emotional changes are common after a stroke and they are not weakness. They are worth discussing with your doctor and with a psychologist, so you know what is happening and what you can do.",
		],
		[
			"Does the programme replace medical recovery?",
			"No. It is a complement. Medical and physical recovery with your doctor stays where it is.",
		],
		[
			"What if the person cannot speak well?",
			"The plan is adapted. Language exercises for partial aphasia are part of neurocognitive rehabilitation, and the evaluation shows us what can be done and how.",
		],
		[
			"Can I come too, as a family member?",
			"Yes. Support for the family is part of the programme: information, guidance on communication and preventing exhaustion in the carer.",
		],
		[
			"Is a QEEG brain map needed?",
			"The initial evaluation includes neuropsychological testing, an assessment of the emotional state and QEEG. Whether QEEG is right in your case is decided at the evaluation.",
		],
		[
			"Can we start at any point after a stroke?",
			"You settle the right moment with your doctor. When you want to start the psychological and cognitive side, contact us and we will guide you.",
		],
	],
	nextStep:
		"If you would like to begin, book an evaluation: we find out where we are starting from and build the plan together with you and your family.",
};

export const STROKE: RichPage = buildHub(STROKE_RO, STROKE_EN, [
	["/metode/evaluare-qeeg", "Evaluare și QEEG", "Evaluation and QEEG"],
	["/metode/neurofeedback", "Neurofeedback", "Neurofeedback"],
	["/metode/tms", "TMS", "TMS"],
	["/metode/psihoterapie", "Psihoterapia la Psizone", "Psychotherapy at Psizone"],
	["/metode/eq-sync", "EQ-SYNC, programul de sunet", "EQ-SYNC, the sound programme"],
	["/adulti/psiho-oncologie", "Psiho-oncologie", "Psycho-oncology"],
	["/intrebari-frecvente", "Întrebări frecvente", "Frequently asked questions"],
]);
