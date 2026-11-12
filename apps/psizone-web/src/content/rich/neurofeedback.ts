import { EMERGENCY } from "./emergency";
import type { RichPage } from "./types";

/** Sources: see methods-neuro.ts. */
export const NEUROFEEDBACK: RichPage = {
	seoTitle: {
		ro: "Neurofeedback în Galați: cum decurge o ședință",
		en: "Neurofeedback in Galați: how a session goes",
	},
	seoDescription: {
		ro: "Neurofeedback la Psizone, Galați: electrozi pe scalp, feedback prin joc, film sau sunet, 30–40 de minute pe ședință. Ce este, cum decurge, pentru cine nu este.",
		en: "Neurofeedback at Psizone in Galați: electrodes on the scalp, feedback through a game, film or sound, 30–40 minutes a session. What it is, how it goes, who it is not for.",
	},
	lead: {
		ro: "Neurofeedbackul este un antrenament asistat de calculator: creierul își vede propria activitate, într-un joc, un film sau un sunet, și învață, fără efort conștient, să lucreze mai echilibrat. O ședință durează aproximativ 30–40 de minute.",
		en: "Neurofeedback is computer-assisted training: the brain sees its own activity, in a game, a film or a sound, and learns, without conscious effort, to work in a more balanced way. A session lasts about 30 to 40 minutes.",
	},
	procedure: { type: "TherapeuticProcedure" },
	sections: [
		{
			kind: "what",
			id: "ce-este",
			h2: {
				ro: "Ce este neurofeedbackul, pe înțeles?",
				en: "What is neurofeedback, in plain words?",
			},
			paras: [
				{
					ro: "Gândește-te la o oglindă. Nu vezi creierul, dar vezi pe ecran o imagine a activității lui: un joc care merge mai bine sau un film care se luminează când tiparul se apropie de ținta stabilită. Creierul primește informația în timp real și, repetând, învață să-și ajusteze singur activitatea.",
					en: "Think of a mirror. You cannot see the brain, but you see on a screen an image of its activity: a game that runs better, or a film that brightens, when the pattern moves toward the target we have set. The brain receives the information in real time and, through repetition, learns to adjust its own activity.",
				},
				{
					ro: "Nu trebuie să te concentrezi cu forța și nu trebuie să „faci” nimic anume. Doar observi ce se întâmplă pe ecran. Senzorii citesc semnale, nu trimit nimic în tine.",
					en: "You do not have to concentrate hard or do anything in particular. You simply watch what happens on the screen. The sensors read signals, they do not send anything into you.",
				},
				{
					ro: "Neurofeedbackul este una dintre neurotehnologiile din planurile noastre. Nu îl folosim singur și nu ca soluție universală. Face parte dintr-un plan făcut după evaluare, alături de psihoterapie și de celelalte metode potrivite.",
					en: "Neurofeedback is one of the neurotechnologies in our plans. We do not use it alone, nor as a universal answer. It is part of a plan made after the evaluation, alongside psychotherapy and the other suitable methods.",
				},
			],
		},
		{
			kind: "session",
			id: "cum-decurge",
			h2: { ro: "Cum decurge o ședință, pas cu pas?", en: "How does a session go, step by step?" },
			paras: [
				{
					ro: "Prima ședință are aceeași formă ca celelalte, doar că începem simplu. Pașii sunt aceștia:",
					en: "The first session has the same shape as the others, only we begin simply. The steps are these:",
				},
			],
			ordered: true,
			list: [
				{
					ro: "Se fixează pe scalp electrozi de argint, cu o cremă de contact. Ei măsoară activitatea electrică a creierului.",
					en: "Silver electrodes are fixed to the scalp with a contact cream. They measure the brain's electrical activity.",
				},
				{
					ro: "Semnalele trec printr-un amplificator și ajung la calculator. În prima ședință pornim de la o singură poziție bipolară a electrozilor. Mai târziu pot fi adăugate și alte poziții.",
					en: "The signals pass through an amplifier to the computer. In the first session we start from a single bipolar electrode position. Other positions may be added later.",
				},
				{
					ro: "Alegi tipul de feedback: vizual, pe monitor, în joc sau în film; auditiv, în căști; sau tactil, cu un animal de pluș care vibrează.",
					en: "You choose the kind of feedback: visual, on a monitor, in a game or a film; auditory, through headphones; or tactile, with a plush animal that vibrates.",
				},
				{
					ro: "Urmărești ecranul sau asculți sunetul. Nu controlezi nimic conștient, doar observi schimbările, iar creierul învață din ele.",
					en: "You watch the screen or listen to the sound. You control nothing consciously, you only notice the changes, and the brain learns from them.",
				},
			],
		},
		{
			kind: "measured",
			id: "ce-masoara",
			h2: {
				ro: "Ce se măsoară și cum se vede progresul?",
				en: "What is measured, and how is progress shown?",
			},
			paras: [
				{
					ro: "În timpul ședinței se măsoară activitatea electrică a creierului, iar protocolul se bazează de regulă pe harta QEEG făcută la început. Aceeași hartă devine reperul de comparație.",
					en: "During the session the brain's electrical activity is measured, and the protocol is usually based on the QEEG map made at the start. That same map becomes the reference for comparison.",
				},
				{
					ro: "Progresul îl urmărim în trei locuri: în înregistrările din ședințe, în harta repetată la reevaluare și în ceea ce observi tu și cei apropiați acasă, la școală sau la serviciu. Dacă ceva nu se mișcă, o spunem și ajustăm protocolul sau planul.",
					en: "We follow progress in three places: in the recordings from the sessions, in the map repeated at re-evaluation, and in what you and those close to you notice at home, at school or at work. If something does not move, we say so and adjust the protocol or the plan.",
				},
			],
		},
		{
			kind: "for",
			id: "pentru-cine",
			h2: { ro: "Pentru cine este neurofeedbackul?", en: "Who is neurofeedback for?" },
			paras: [
				{
					ro: "Se adresează copiilor, adolescenților și adulților, după evaluare. Îl avem în vedere, de exemplu, pentru dificultăți de atenție, pentru anxietate și atacuri de panică, pentru stres și epuizare sau pentru pregătirea mentală a sportivilor. Mai multe despre aceste teme găsești în paginile dedicate.",
					en: "It is for children, teenagers and adults, after an evaluation. We consider it, for example, for difficulties with attention, for anxiety and panic attacks, for stress and exhaustion, or for the mental preparation of athletes. You will find more on these topics on the dedicated pages.",
				},
				{
					ro: "Varianta cu realitate virtuală folosește ochelari Oculus Quest. Te mută într-un mediu simulat, iar acolo, cu un psihoterapeut alături, te expui treptat la situații care îți provoacă teamă, în timp ce se aplică protocolul personalizat. Este gândită pentru frici și anxietate. Psihoterapeutul îți urmărește reacțiile și poate regla cât de grea este scena.",
					en: "The virtual reality version uses Oculus Quest glasses. It moves you into a simulated environment where, with a psychotherapist beside you, you are exposed gradually to situations that frighten you while a personalised protocol is applied. It is designed for fears and anxiety. The psychotherapist follows your reactions and can adjust how hard the scene is.",
				},
				{
					ro: "Mai există o variantă numită mindfulness cu neurofeedback. Urmărești feedback vizual și auditiv, iar neuroterapeutul orientează treptat frecvențele de lucru către un echilibru mai bun. Ideea este un efect asemănător practicii de mindfulness, fără să înveți o tehnică elaborată.",
					en: "Another version is called mindfulness with neurofeedback. You follow visual and auditory feedback while the neurotherapist gradually steers the working frequencies toward better balance. The idea is an effect similar to mindfulness practice, without learning an elaborate technique.",
				},
			],
		},
		{
			kind: "not-for",
			id: "pentru-cine-nu",
			h2: {
				ro: "Pentru cine nu este neurofeedbackul?",
				en: "Who is neurofeedback not for?",
			},
			paras: [
				{
					ro: "Neurofeedbackul nu înlocuiește îngrijirea medicală, tratamentul psihiatric sau neurologic și nu se oprește sau se schimbă nimic din tratamentul prescris fără medicul tău. Despre medicație discuți cu medicul psihiatru.",
					en: "Neurofeedback does not replace medical care or psychiatric or neurological treatment, and nothing in your prescribed treatment is stopped or changed without your doctor. You discuss medication with your psychiatrist.",
				},
				{
					ro: "Nu este pentru situații de urgență sau de criză.",
					en: "It is not for emergencies or crises.",
				},
				EMERGENCY,
				{
					ro: "Nu promitem un rezultat și nu este potrivit pentru oricine. La evaluare hotărâm dacă are sens pentru tine, cât de multă pregătire cere și cu ce se combină. Ți-l recomandăm doar dacă se potrivește situației tale.",
					en: "We do not promise a result and it does not suit everyone. At the evaluation we decide whether it makes sense for you, how much preparation it needs and what it is combined with. We recommend it only if it fits your situation.",
				},
			],
		},
		{
			kind: "duration",
			id: "durata",
			h2: {
				ro: "Cât durează și de câte ședințe este nevoie?",
				en: "How long does it take, and how many sessions are needed?",
			},
			paras: [
				{
					ro: "O ședință de antrenament durează aproximativ 30–40 de minute.",
					en: "A training session lasts about 30 to 40 minutes.",
				},
				{
					ro: "Numărul de ședințe și cât de des vii nu sunt fixe. Se stabilesc în planul făcut după evaluare și se reiau la reevaluare, în funcție de ce vedem.",
					en: "The number of sessions and how often you come are not fixed. They are set in the plan made after the evaluation and revisited at re-evaluation, depending on what we see.",
				},
			],
		},
		{
			kind: "more",
			id: "primele-saptamani",
			h2: {
				ro: "La ce mă aștept în primele ședințe?",
				en: "What should I expect in the first sessions?",
			},
			paras: [
				{
					ro: "Primele ședințe sunt și pentru obișnuire. Te familiarizezi cu electrozii, cu ecranul și cu faptul că nu ai nimic de „făcut”. Copiii aleg adesea jocul sau animalul de pluș care vibrează, iar cei care se plictisesc repede pot schimba tipul de feedback.",
					en: "The first sessions are also for getting used to it. You get familiar with the electrodes, the screen and the fact that there is nothing to “do”. Children often choose the game or the vibrating plush animal, and those who get bored quickly can change the kind of feedback.",
				},
				{
					ro: "Nu te aștepta la o schimbare imediată și nu o căuta la fiecare ședință. Ne interesează tendința în timp. Dacă ți se pare că ceva nu merge, spune-ne la începutul ședinței, nu la final, ca să putem ajusta chiar atunci.",
					en: "Do not expect an immediate change and do not look for one at every session. We are interested in the trend over time. If something seems wrong, tell us at the start of the session, not at the end, so we can adjust right then.",
				},
			],
		},
		{
			kind: "more",
			id: "copii-si-parinti",
			h2: {
				ro: "Ce rol au părinții într-un program de neurofeedback?",
				en: "What is the parents' role in a neurofeedback programme?",
			},
			paras: [
				{
					ro: "Dacă vine un copil, părintele este un partener, nu un spectator. Îți explicăm ce vedem, ce urmărim și ce poți observa acasă, în teme, în somn sau în felul în care se liniștește după o zi grea. Observațiile tale ne ajută să judecăm planul.",
					en: "If a child comes, the parent is a partner, not a spectator. We explain what we see, what we follow and what you can notice at home, in homework, in sleep or in the way they settle after a hard day. Your observations help us judge the plan.",
				},
			],
		},
		{
			kind: "where",
			id: "unde-o-folosim",
			h2: {
				ro: "Unde folosim neurofeedbackul la Psizone?",
				en: "Where do we use neurofeedback at Psizone?",
			},
			paras: [
				{
					ro: "Îl folosim în planurile pentru copii cu ADHD, în intervenția după un AVC, în pregătirea sportivilor și în planurile pentru anxietate, de multe ori împreună cu psihoterapia.",
					en: "We use it in plans for children with ADHD, in intervention after a stroke, in preparing athletes, and in plans for anxiety, often together with psychotherapy.",
				},
			],
		},
	],
	faq: [
		{
			q: { ro: "Trebuie să fac mai întâi o hartă QEEG?", en: "Do I need a QEEG map first?" },
			a: {
				ro: "De obicei da, pentru că harta oferă reperul pentru protocol și pentru comparația de la reevaluare. La evaluare îți spunem dacă este nevoie în cazul tău.",
				en: "Usually yes, because the map gives the reference for the protocol and for the comparison at re-evaluation. At the evaluation we tell you whether you need it.",
			},
		},
		{
			q: { ro: "Doare sau înțeapă?", en: "Does it hurt or sting?" },
			a: {
				ro: "Senzorii se pun pe scalp cu o cremă de contact și doar citesc semnalele. Nu se trimite nimic în creier.",
				en: "The sensors go on the scalp with a contact cream and only read the signals. Nothing is sent into the brain.",
			},
		},
		{
			q: { ro: "Ce fac în timpul ședinței?", en: "What do I do during the session?" },
			a: {
				ro: "Te așezi confortabil și urmărești un joc, un film sau un sunet. Nu încerci să controlezi feedbackul, doar observi.",
				en: "You sit comfortably and watch a game, a film or listen to a sound. You do not try to control the feedback, you just notice it.",
			},
		},
		{
			q: { ro: "Poate un copil să facă neurofeedback?", en: "Can a child do neurofeedback?" },
			a: {
				ro: "Da, se adresează și copiilor, după evaluare. Feedbackul sub formă de joc sau animal de pluș vibrant ajută la menținerea interesului.",
				en: "Yes, it is for children too, after an evaluation. Feedback in the form of a game or a vibrating plush animal helps keep their interest.",
			},
		},
		{
			q: { ro: "Cum aflu dacă ajută?", en: "How will I know whether it helps?" },
			a: {
				ro: "Comparăm înregistrările din ședințe și harta repetată la reevaluare, dar discutăm și ce se schimbă în viața ta. Nu promitem un rezultat anume.",
				en: "We compare the recordings from sessions and the map repeated at re-evaluation, and we also talk about what changes in your life. We do not promise a particular result.",
			},
		},
		{
			q: { ro: "Se combină cu psihoterapia?", en: "Is it combined with psychotherapy?" },
			a: {
				ro: "Da. De multe ori lucrăm în paralel cu psihoterapia, iar uneori cu EQ-SYNC sau cu alte metode, în același plan.",
				en: "Yes. We often work alongside psychotherapy, and sometimes with EQ-SYNC or other methods, within the same plan.",
			},
		},
	],
	links: [
		{ label: { ro: "Evaluare și QEEG", en: "Evaluation and QEEG" }, href: "/metode/evaluare-qeeg" },
		{ label: { ro: "Psihoterapie", en: "Psychotherapy" }, href: "/metode/psihoterapie" },
		{ label: { ro: "ADHD la copii", en: "ADHD in children" }, href: "/copii/adhd" },
		{ label: { ro: "După un AVC", en: "After a stroke" }, href: "/adulti/post-avc" },
		{ label: { ro: "Psihologie sportivă", en: "Sport psychology" }, href: "/programe/sport" },
	],
	nextStep: {
		ro: "Ai o întrebare despre neurofeedback? Întreabă ghidul sau programează o evaluare.",
		en: "Have a question about neurofeedback? Ask the guide or book an evaluation.",
	},
};
