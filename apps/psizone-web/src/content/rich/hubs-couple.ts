import { buildHub, type HubSide } from "./hub-build";
import type { RichPage } from "./types";

/** DRAFT — clinical review pending; sources in hubs-adults.ts. */

const COUPLE_RO: HubSide = {
	seoTitle: "Terapie de cuplu și familie în Galați",
	seoDescription:
		"Terapie de cuplu și de familie la Psizone, Galați: cum decurge o ședință, cum urmărim progresul, pentru cine este și când nu este potrivită.",
	lead: "Certuri care se repetă, distanță între voi sau un copil care are nevoie de tot sprijinul familiei: lucrăm cu cuplul sau cu toată familia, ca să puteți vorbi din nou unii cu alții.",
	parts: [
		{
			h2: "Când ajută terapia de cuplu și de familie?",
			paras: [
				"Probabil te întrebi dacă problema e la tine, la celălalt sau la amândoi. De cele mai multe ori nu e vorba de vinovați, ci de un tipar în care v-ați prins: aceleași certuri, aceleași tăceri, aceleași replici spuse la 22:30, când toți sunt obosiți. Terapia ajută la a vedea tiparul și la a încerca altceva.",
				"Ședințele au loc cu două sau mai multe persoane: cei doi parteneri, părinții sau părinții împreună cu copiii. Psihologul nu dă verdicte și nu ia partea nimănui. Ține conversația într-un loc în care fiecare poate vorbi și fiecare poate fi auzit.",
				"La noi vin cupluri cu conflicte frecvente, cu distanțare emoțională, cu lipsă de încredere sau de intimitate, după o infidelitate, cu dificultăți de comunicare sau diferențe mari de stil de viață, ori cu probleme apărute în sarcină, după naștere sau în creșterea copiilor. Vin și familii cu comportamente dificile la copii sau adolescenți, cu conflicte între părinți și copii, în divorț sau în dispute de custodie, după pierderi sau schimbări mari, sau când un copil cu nevoi speciale intră în viața de zi cu zi a tuturor.",
			],
		},
		{
			h2: "Cum arată o ședință de terapie de cuplu sau de familie?",
			paras: [
				"Prima întâlnire este o discuție de cunoaștere: ce v-a adus aici, de cât timp durează, ce ați încercat deja și ce ați vrea să fie altfel. Nu trebuie să vii cu un discurs pregătit. Poți începe cu „nu știu de unde să încep”.",
				"Apoi ședințele urmează, în linii mari, același drum:",
			],
			list: [
				"Povestim pe rând, fiecare din locul lui, fără întreruperi.",
				"Stabilim împreună obiective: ce vrem să fie altfel peste câteva luni, spus în cuvinte concrete.",
				"Psihologul facilitează conversația și vă ajută să vă reglați emoțiile atunci când discuția se încinge.",
				"Primiți instrumente practice de încercat acasă, între ședințe.",
				"La ședința următoare ne uităm împreună la ce a mers și la ce nu.",
			],
		},
		{
			h2: "Cum știm dacă ne ajută terapia?",
			paras: [
				"Obiectivele le stabilim de comun acord, în cuvinte pe care le puteți verifica singuri. De exemplu: cum se termină o ceartă, câte seri pe săptămână aveți pentru voi, cine ce face când copilul face o criză, cum vă vorbiți când sunteți obosiți. Așa progresul nu rămâne o părere, ci ceva ce vedeți acasă.",
				"Nu promitem un rezultat și nu avem un număr fix de ședințe. Ne întoarcem periodic la obiective și ne întrebăm: ce s-a schimbat, ce nu, ce ajustăm. Dacă după un timp nu vedeți nicio mișcare, spuneți-o. Și asta e o informație bună pentru plan.",
			],
		},
		{
			h2: "Pentru cine este terapia de cuplu și de familie?",
			paras: [
				"Pentru oricine simte că în relațiile apropiate ceva s-a blocat și nu mai poate fi rezolvat doar prin discuții acasă. Nu trebuie să fiți „în pragul divorțului”. Mulți vin tocmai ca să nu ajungă acolo.",
			],
			list: [
				"Cupluri, căsătorite sau nu, la orice vârstă.",
				"Părinți care se simt depășiți de comportamentul unui copil sau al unui adolescent.",
				"Familii care trec printr-un divorț, o pierdere sau o schimbare mare.",
				"Familii în care un copil este deja în terapie la noi: o familie care înțelege ce se întâmplă cu copilul și se simte ea însăși sprijinită este un sprijin pentru copil.",
			],
		},
		{
			h2: "Ce metode folosim în terapia de cuplu și de familie?",
			paras: [
				"Toate fac parte din psihoterapie, iar psihologul le alege după ce vă cunoaște. Le explicăm pe înțelesul tuturor:",
			],
			list: [
				"Terapia sistemică de familie privește familia ca pe un întreg: comportamentul unuia are sens în raport cu ceilalți.",
				"Terapia de cuplu centrată pe emoții (EFT) urmărește emoțiile de sub ceartă, de exemplu frica de abandon sau nevoia de a fi văzut.",
				"Intervențiile cognitiv-comportamentale lucrează cu gândurile și cu obiceiurile care întrețin conflictul.",
				"Comunicarea nonviolentă ajută la a spune ce simți și ce ai nevoie fără să acuzi.",
				"Exercițiile de co-reglare emoțională și mindfulness vă învață să vă calmați împreună.",
			],
		},
		{
			h2: "Pentru cine nu este potrivită terapia de cuplu și de familie?",
			paras: [
				"Terapia nu înlocuiește îngrijirea medicală sau psihiatrică. Dacă unul dintre voi are o suferință care cere medic, psihologul vă va spune și vă va îndruma.",
				"Dacă în relația voastră există violență sau frica de celălalt, ședințele comune nu sunt locul potrivit pentru a începe. Spune-i psihologului deschis, de la primul contact, și cere ajutor specializat. Împreună decidem dacă, când și cum ședințe în doi sunt potrivite.",
				"Nu este un serviciu de urgență. Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112. În rest, dacă terapia vi se potrivește se hotărăște la evaluare, nu în prealabil.",
			],
		},
		{
			h2: "Cât durează o ședință și cât de des ne vedem?",
			paras: [
				"O ședință de terapie de cuplu sau de familie durează 60–90 de minute. De obicei ne vedem o dată pe săptămână sau o dată la două săptămâni. Câte ședințe sunt în total depinde de ce vă propuneți, nu avem un număr standard.",
			],
		},
		{
			h2: "Unde are loc terapia de cuplu și de familie în Galați?",
			paras: [
				"În centrul nostru din Galați. Adresa și telefoanele sunt pe pagina de contact. Dacă te întrebi dacă se poate și altfel decât față în față, întreabă când ne suni: îți spunem ce putem oferi în momentul acela.",
			],
		},
	],
	faq: [
		[
			"Trebuie să vină și partenerul meu?",
			"Ședințele au loc cu două sau mai multe persoane, pentru că lucrăm cu relația. Dacă celălalt ezită, spune-ne asta când te programezi și vorbim despre cum puteți începe.",
		],
		[
			"Copilul trebuie să participe la ședințe?",
			"Ședințele pot fi doar cu părinții sau cu părinții și copiii. Psihologul hotărăște cu voi, după vârstă și după motivul pentru care veniți.",
		],
		[
			"Psihologul ne va spune cine are dreptate?",
			"Nu. Nu căutăm un vinovat și nu luăm partea nimănui. Căutăm felul în care fiecare poate fi auzit și lucrurile pot merge altfel.",
		],
		[
			"Terapia de cuplu salvează o relație?",
			"Nu promitem un rezultat. Ajutăm ca ce decideți, fie să vă apropiați, fie să faceți alt drum, să fie decis cu cap limpede și cu respect unul pentru celălalt.",
		],
		[
			"Facem terapie de familie și când copilul este deja în terapie?",
			"Da. Când un copil are nevoie de sprijin special, schimbă viața întregii familii, iar părinții au și ei nevoie de loc să vorbească despre asta.",
		],
		[
			"Cum mă pregătesc pentru prima ședință?",
			"Nu e nevoie de pregătire. Te ajută dacă te gândești la două sau trei lucruri pe care ți-ai dori să fie altfel, dar poți veni și fără ele.",
		],
	],
	nextStep:
		"Dacă vrei să începi, programează o evaluare: povestești în ce punct sunteți și stabilim împreună cum arată primul pas.",
};

const COUPLE_EN: HubSide = {
	seoTitle: "Couples and family therapy in Galați",
	seoDescription:
		"Couples and family therapy at Psizone in Galați: how a session goes, how we follow progress, who it is for and when it is not the right fit.",
	lead: "Arguments that keep coming back, distance between you, or a child who needs the whole family behind them: we work with the couple or the whole family, so you can talk to each other again.",
	parts: [
		{
			h2: "When does couples and family therapy help?",
			paras: [
				"You may be wondering whether the problem is you, the other person, or both. Most of the time it is not about blame but about a pattern you have both got caught in: the same arguments, the same silences, the same lines said at 10:30 pm when everyone is tired. Therapy helps you see the pattern and try something else.",
				"Sessions include two or more people: the two partners, the parents, or the parents together with their children. The psychologist does not hand down verdicts and does not take sides. They hold the conversation in a place where everyone can speak and everyone can be heard.",
				"Couples come to us with frequent conflict, emotional distance, a lack of trust or intimacy, after an affair, with communication difficulties or big differences in lifestyle, or with problems that arose in pregnancy, after a birth or in raising children. Families come with difficult behaviour in children or teenagers, parent and child conflict, a divorce or a custody dispute, after a loss or a big change, or when a child with special needs becomes part of everyone's daily life.",
			],
		},
		{
			h2: "What does a couples or family session look like?",
			paras: [
				"The first meeting is a conversation to get to know you: what brought you here, how long it has been going on, what you have already tried and what you would like to be different. You do not need a prepared speech. You can start with “I don’t know where to begin”.",
				"After that, sessions broadly follow the same path:",
			],
			list: [
				"We each tell our side in turn, without interruptions.",
				"We set goals together: what we want to be different in a few months, put in concrete words.",
				"The psychologist guides the conversation and helps you steady your emotions when it gets heated.",
				"You are given practical tools to try at home between sessions.",
				"At the next session we look together at what worked and what did not.",
			],
		},
		{
			h2: "How do we know whether therapy is helping?",
			paras: [
				"We set the goals together, in words you can check for yourselves. For example: how an argument ends, how many evenings a week you have for yourselves, who does what when the child has a meltdown, how you speak to each other when you are tired. That way progress is not an opinion but something you see at home.",
				"We do not promise a result and we have no fixed number of sessions. We come back to the goals regularly and ask: what has changed, what has not, what do we adjust. If you see no movement after a while, say so. That is useful information for the plan too.",
			],
		},
		{
			h2: "Who is couples and family therapy for?",
			paras: [
				"For anyone who feels that something in their close relationships has stuck and cannot be solved by talking at home. You do not have to be “on the brink of divorce”. Many people come precisely so as not to get there.",
			],
			list: [
				"Couples, married or not, of any age.",
				"Parents who feel overwhelmed by a child’s or a teenager’s behaviour.",
				"Families going through a divorce, a loss or a big change.",
				"Families in which a child is already in therapy with us: a family that understands what is happening to the child, and feels supported itself, is a support for the child.",
			],
		},
		{
			h2: "Which methods do we use in couples and family therapy?",
			paras: [
				"All of them are part of psychotherapy, and the psychologist chooses among them once they know you. In plain words:",
			],
			list: [
				"Systemic family therapy looks at the family as a whole: one person’s behaviour makes sense in relation to the others.",
				"Emotionally focused couples therapy (EFT) looks at the emotions beneath the argument, for example the fear of being left or the need to be seen.",
				"Cognitive behavioural interventions work with the thoughts and habits that keep the conflict going.",
				"Nonviolent communication helps you say what you feel and what you need without accusing.",
				"Emotional co-regulation exercises and mindfulness teach you to calm down together.",
			],
		},
		{
			h2: "Who is couples and family therapy not for?",
			paras: [
				"Therapy does not replace medical or psychiatric care. If one of you has a difficulty that needs a doctor, the psychologist will say so and point you to the right place.",
				"If there is violence in your relationship, or fear of the other person, joint sessions are not the right place to start. Tell the psychologist openly from the first contact and ask for specialist help. Together we decide whether, when and how sessions for two are appropriate.",
				"This is not an emergency service. If you or someone close to you is in immediate danger, call 112. Otherwise, whether therapy suits you is decided at the evaluation, not beforehand.",
			],
		},
		{
			h2: "How long is a session and how often do we meet?",
			paras: [
				"A couples or family session lasts 60–90 minutes. We usually meet once a week or once every two weeks. How many sessions there are in total depends on what you set out to do; there is no standard number.",
			],
		},
		{
			h2: "Where does couples and family therapy take place in Galați?",
			paras: [
				"At our centre in Galați. The address and phone numbers are on the contact page. If you wonder whether it can be done another way than face to face, ask when you call: we will tell you what we can offer at that moment.",
			],
		},
	],
	faq: [
		[
			"Does my partner have to come too?",
			"Sessions include two or more people, because we work with the relationship. If the other person hesitates, tell us when you book and we will talk about how you can begin.",
		],
		[
			"Does the child have to take part in the sessions?",
			"Sessions can be with the parents only or with the parents and the children. The psychologist decides with you, according to age and the reason you are coming.",
		],
		[
			"Will the psychologist tell us who is right?",
			"No. We are not looking for someone to blame and we do not take sides. We look for a way for each of you to be heard and for things to go differently.",
		],
		[
			"Does couples therapy save a relationship?",
			"We do not promise a result. We help whatever you decide, whether to grow closer or to take separate paths, to be decided with a clear head and with respect for each other.",
		],
		[
			"Do we do family therapy when the child is already in therapy?",
			"Yes. When a child needs special support, it changes the life of the whole family, and the parents need a place to talk about it too.",
		],
		[
			"How do I prepare for the first session?",
			"There is nothing to prepare. It helps to think of two or three things you would like to be different, but you can come without them.",
		],
	],
	nextStep:
		"If you would like to begin, book an evaluation: you tell us where you are now and we decide together what the first step looks like.",
};

export const COUPLE: RichPage = buildHub(COUPLE_RO, COUPLE_EN, [
	["/metode/psihoterapie", "Psihoterapia la Psizone", "Psychotherapy at Psizone"],
	[
		"/adulti/anxietate-depresie",
		"Anxietate și depresie la adulți",
		"Anxiety and depression in adults",
	],
	["/adolescenti", "Adolescenți", "Teenagers"],
	["/copii/autism", "Autism la copii", "Autism in children"],
	["/prima-vizita", "Cum decurge prima vizită", "What the first visit is like"],
	["/intrebari-frecvente", "Întrebări frecvente", "Frequently asked questions"],
]);
