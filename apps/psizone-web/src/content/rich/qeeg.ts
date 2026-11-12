import { EMERGENCY } from "./emergency";
import type { RichPage } from "./types";

/** Sources: see methods-neuro.ts. */
export const QEEG: RichPage = {
	seoTitle: {
		ro: "Hartă cerebrală QEEG în Galați: cum decurge",
		en: "QEEG brain map in Galați: how it works",
	},
	seoDescription: {
		ro: "QEEG la Psizone, Galați: cască cu electrozi, fără curent electric, raport cu interpretare clinică și reper pentru reevaluare. Ce măsoară și pentru cine este.",
		en: "QEEG at Psizone in Galați: an electrode cap, no electric current, a report with clinical interpretation and a reference for re-evaluation. What it measures and who it is for.",
	},
	lead: {
		ro: "QEEG este o hartă a activității electrice a creierului, făcută cu o cască cu electrozi pusă pe scalp. Nu trimite curent în tine, doar înregistrează. O folosim ca punct de pornire al planului și ca reper la reevaluare.",
		en: "QEEG is a map of the brain's electrical activity, made with an electrode cap placed on the scalp. It sends no current into you, it only records. We use it as the starting point of the plan and as the reference at re-evaluation.",
	},
	procedure: { type: "DiagnosticProcedure" },
	sections: [
		{
			kind: "what",
			id: "ce-este",
			h2: { ro: "Ce este o hartă cerebrală QEEG?", en: "What is a QEEG brain map?" },
			paras: [
				{
					ro: "QEEG vine de la „electroencefalografie cantitativă”. Creierul produce tot timpul semnale electrice foarte mici. O cască cu electrozi le înregistrează, iar un program le transformă în cifre și în hărți colorate, pe care le putem citi împreună cu tine.",
					en: "QEEG stands for quantitative electroencephalography. The brain produces tiny electrical signals all the time. A cap with electrodes records them, and software turns them into numbers and coloured maps that we can read together with you.",
				},
				{
					ro: "Harta nu pune un diagnostic și nu înlocuiește discuția cu psihologul. Ea adaugă o informație măsurată la ceea ce știm deja din povestea ta sau a copilului tău și din observație. Uneori ne ajută să alegem mai bine ce urmează. Alteori ne arată că nu este nevoie de ea.",
					en: "The map does not make a diagnosis and does not replace the conversation with the psychologist. It adds a measured piece of information to what we already know from your story, or your child's, and from observation. Sometimes it helps us choose better what comes next. Sometimes it shows that we do not need it.",
				},
				{
					ro: "Pe scurt: este un instrument de înțelegere. Îl folosim când răspunde unei întrebări concrete și nu îl facem din rutină.",
					en: "In short: it is a tool for understanding. We use it when it answers a concrete question, not out of routine.",
				},
			],
		},
		{
			kind: "session",
			id: "cum-decurge",
			h2: {
				ro: "Cum decurge o evaluare QEEG, pas cu pas?",
				en: "How does a QEEG recording go, step by step?",
			},
			paras: [
				{
					ro: "Înainte de înregistrare vorbim: ce te aduce la noi, ce ai observat, ce ai încercat deja. Apoi trecem la hartă, care are patru pași.",
					en: "Before the recording we talk: what brings you to us, what you have noticed, what you have already tried. Then we move to the map, which has four steps.",
				},
			],
			ordered: true,
			list: [
				{
					ro: "Se așază pe scalp o cască cu electrozi. Casca nu implică curent electric.",
					en: "An electrode cap is placed on the scalp. The cap involves no electric current.",
				},
				{
					ro: "Se înregistrează activitatea creierului în repaus, mai întâi cu ochii închiși, apoi cu ochii deschiși. Uneori adăugăm și sarcini cognitive scurte.",
					en: "The brain's activity is recorded at rest, first with the eyes closed, then with the eyes open. Sometimes we add short cognitive tasks.",
				},
				{
					ro: "Datele sunt analizate cu un program specializat și comparate cu baze de date normative.",
					en: "The data are analysed with specialised software and compared with normative databases.",
				},
				{
					ro: "Rezultă un raport cu interpretare clinică și recomandări, pe care ți-l explicăm pe înțelesul tău.",
					en: "The result is a report with a clinical interpretation and recommendations, which we explain in plain words.",
				},
			],
		},
		{
			kind: "measured",
			id: "ce-masoara",
			h2: {
				ro: "Ce măsoară harta și cum îți arătăm progresul?",
				en: "What does the map measure, and how do we show progress?",
			},
			paras: [
				{
					ro: "Harta urmărește ritmurile cerebrale: delta, theta, alfa, beta, beta înaltă și gama. Fiecare apare în cantități diferite în zone diferite, iar raportul dintre ele ne spune ceva despre cum lucrează creierul în repaus.",
					en: "The map follows the brain rhythms: delta, theta, alpha, beta, high beta and gamma. Each one appears in different amounts in different areas, and the balance between them tells us something about how the brain works at rest.",
				},
				{
					ro: "Pe lângă ritmuri, harta ne arată unde activitatea pare mai mare sau mai mică decât în baza de comparație, dacă cele două emisfere diferă între ele și cât de bine „vorbesc” între ele diferitele regiuni. Sunt informații pe care observația singură nu le poate da.",
					en: "Besides the rhythms, the map shows where activity looks higher or lower than in the comparison database, whether the two hemispheres differ from each other, and how well different regions “talk” to each other. This is information that observation alone cannot give.",
				},
				{
					ro: "Progresul se vede prin comparație. Harta de la început rămâne reperul, iar la reevaluare facem din nou înregistrarea, în aceleași condiții, și punem cele două hărți una lângă alta. Îți arătăm ce s-a schimbat și ce nu. Harta este o parte a imaginii, alături de ce observi tu acasă și la școală sau la serviciu.",
					en: "Progress is seen by comparison. The first map stays as the reference, and at re-evaluation we record again, in the same conditions, and put the two maps side by side. We show you what has changed and what has not. The map is one part of the picture, next to what you see at home and at school or work.",
				},
			],
		},
		{
			kind: "for",
			id: "pentru-cine",
			h2: { ro: "Pentru cine este recomandat QEEG?", en: "Who is QEEG recommended for?" },
			paras: [
				{
					ro: "Îl recomandăm după o discuție de evaluare, când o hartă poate răspunde la o întrebare. Printre situațiile în care îl avem în vedere:",
					en: "We recommend it after an evaluation conversation, when a map can answer a question. Situations in which we consider it include:",
				},
			],
			list: [
				{
					ro: "copii cu întârziere în dezvoltare, ADHD, tulburare de spectru autist sau dificultăți de atenție și de învățare;",
					en: "children with developmental delay, ADHD, autism spectrum disorder or difficulties with attention and learning;",
				},
				{
					ro: "adolescenți și adulți cu anxietate, depresie, burnout sau tulburări de somn;",
					en: "teenagers and adults with anxiety, depression, burnout or sleep problems;",
				},
				{
					ro: "persoane care au avut un AVC sau un traumatism cranian;",
					en: "people who have had a stroke or a head injury;",
				},
				{
					ro: "cei care se pregătesc pentru un program de neurofeedback și au nevoie de un reper de la care să pornească protocolul.",
					en: "those preparing for a neurofeedback programme who need a reference from which to build the protocol.",
				},
			],
		},
		{
			kind: "not-for",
			id: "pentru-cine-nu",
			h2: {
				ro: "Pentru cine nu este QEEG, sau nu este de ajuns?",
				en: "Who is QEEG not for, or not enough for?",
			},
			paras: [
				{
					ro: "QEEG nu este un test care „spune ce ai”. Nu pune singur un diagnostic și nu înlocuiește evaluarea psihologică, consultul medical, psihiatric sau neurologic. Dacă ai simptome noi, bruște sau îngrijorătoare, primul pas este medicul tău.",
					en: "QEEG is not a test that “tells you what you have”. It does not make a diagnosis on its own and does not replace a psychological evaluation or a medical, psychiatric or neurological consultation. If you have new, sudden or worrying symptoms, the first step is your doctor.",
				},
				{
					ro: "Nu este nici pentru urgențe. Nu fixăm o hartă în loc de ajutor imediat.",
					en: "Nor is it for emergencies. We do not book a map in place of immediate help.",
				},
				EMERGENCY,
				{
					ro: "Dacă harta nu ar schimba cu nimic planul, îți spunem asta și nu o facem. Dacă ești nesigur, la evaluare decidem împreună dacă este potrivită pentru tine sau pentru copilul tău.",
					en: "If a map would change nothing in the plan, we tell you so and do not do it. If you are unsure, at the evaluation we decide together whether it suits you or your child.",
				},
			],
		},
		{
			kind: "duration",
			id: "durata",
			h2: {
				ro: "Cât durează și cât de des se face?",
				en: "How long does it take and how often is it done?",
			},
			paras: [
				{
					ro: "Nu publicăm o durată fixă a înregistrării, pentru că depinde de vârstă și de ce urmărim. Ți-o spunem clar la programare, ca să știi la ce să te aștepți.",
					en: "We do not publish a fixed length for the recording, because it depends on age and on what we are looking for. We tell you clearly when you book, so you know what to expect.",
				},
				{
					ro: "O facem de obicei la început și apoi la reevaluare, când vrem să comparăm. Câte ședințe urmează după hartă și în ce ritm se stabilește în plan, după evaluare.",
					en: "We usually do it at the start and again at re-evaluation, when we want to compare. How many sessions follow the map, and at what pace, is set in the plan after the evaluation.",
				},
			],
		},
		{
			kind: "more",
			id: "pregatire",
			h2: {
				ro: "Cum mă pregătesc pentru o hartă cerebrală?",
				en: "How do I prepare for a brain map?",
			},
			paras: [
				{
					ro: "Te rugăm să vii cu părul curat și uscat, ca electrozii să se așeze bine pe scalp. Dacă ai rapoarte medicale, evaluări sau o hartă mai veche, adu-le: ne ajută să vedem povestea întreagă și nu o singură fotografie.",
					en: "Please come with clean, dry hair so that the electrodes sit well on the scalp. If you have medical reports, evaluations or an older map, bring them: they help us see the whole story and not a single snapshot.",
				},
				{
					ro: "Spune-ne dacă tu sau copilul tău luați vreun medicament. Nu îți cerem să îl oprești și nu îți dăm sfaturi despre el, dar informația ne ajută să citim corect harta. Despre tratament vorbești doar cu medicul tău.",
					en: "Tell us if you or your child take any medication. We do not ask you to stop it and we give no advice about it, but the information helps us read the map correctly. You discuss treatment only with your doctor.",
				},
			],
		},
		{
			kind: "where",
			id: "unde-o-folosim",
			h2: { ro: "Unde folosim QEEG la Psizone?", en: "Where do we use QEEG at Psizone?" },
			paras: [
				{
					ro: "Îl folosim în evaluările pentru copii cu autism sau ADHD, în evaluările de limbaj și vorbire și în planurile după un AVC. Dacă harta arată că neurofeedbackul sau alte metode ar putea ajuta, ea devine baza protocolului.",
					en: "We use it in evaluations for children with autism or ADHD, in language and speech evaluations, and in plans after a stroke. If the map suggests that neurofeedback or other methods might help, it becomes the basis of the protocol.",
				},
			],
		},
	],
	faq: [
		{
			q: { ro: "Doare harta cerebrală QEEG?", en: "Does a QEEG brain map hurt?" },
			a: {
				ro: "Nu. Casca se așază pe scalp și doar înregistrează activitatea creierului, fără curent electric. Copiii mici pot fi nerăbdători să stea locului, așa că adaptăm ritmul la vârsta lor.",
				en: "No. The cap sits on the scalp and only records the brain's activity, with no electric current. Small children may find it hard to sit still, so we adapt the pace to their age.",
			},
		},
		{
			q: {
				ro: "Trebuie să fac QEEG pentru orice evaluare?",
				en: "Do I need a QEEG for every evaluation?",
			},
			a: {
				ro: "Nu. Evaluarea începe cu o discuție și cu observație. Propunem QEEG doar acolo unde ajută și îți spunem de ce.",
				en: "No. The evaluation starts with a conversation and observation. We suggest QEEG only where it helps, and we tell you why.",
			},
		},
		{
			q: { ro: "Ce primesc la final?", en: "What do I receive at the end?" },
			a: {
				ro: "Un raport cu hărțile, interpretare clinică și recomandări, explicat în persoană. Îl poți păstra și îl poți arăta medicului tău.",
				en: "A report with the maps, a clinical interpretation and recommendations, explained in person. You can keep it and show it to your doctor.",
			},
		},
		{
			q: { ro: "Harta spune ce diagnostic am?", en: "Does the map tell me my diagnosis?" },
			a: {
				ro: "Nu. Harta arată cum arată activitatea electrică a creierului în acel moment. Diagnosticul se pune pe baza evaluării complete, nu a unui singur test.",
				en: "No. The map shows what the brain's electrical activity looks like at that moment. A diagnosis rests on the full evaluation, not on one test.",
			},
		},
		{
			q: {
				ro: "Cum văd dacă s-a schimbat ceva?",
				en: "How do I see whether anything has changed?",
			},
			a: {
				ro: "Repetăm înregistrarea la reevaluare și punem hărțile una lângă alta. Pe lângă ele, contează și ce observi tu în viața de zi cu zi.",
				en: "We repeat the recording at re-evaluation and put the maps side by side. Alongside them, what you notice in daily life matters too.",
			},
		},
		{
			q: { ro: "Se poate face și la copii mici?", en: "Can it be done with young children?" },
			a: {
				ro: "Da, copiii sunt printre cei pentru care îl recomandăm. Vârsta minimă și durata se discută la programare, în funcție de copil.",
				en: "Yes, children are among those we recommend it for. The minimum age and the length are discussed when you book, depending on the child.",
			},
		},
	],
	links: [
		{ label: { ro: "Neurofeedback", en: "Neurofeedback" }, href: "/metode/neurofeedback" },
		{ label: { ro: "TMS", en: "TMS" }, href: "/metode/tms" },
		{ label: { ro: "Autism la copii", en: "Autism in children" }, href: "/copii/autism" },
		{ label: { ro: "ADHD la copii", en: "ADHD in children" }, href: "/copii/adhd" },
		{
			label: { ro: "Cum arată prima vizită", en: "What the first visit is like" },
			href: "/prima-vizita",
		},
	],
	nextStep: {
		ro: "Vrei să știi dacă o hartă ți-ar folosi? Programează o evaluare și hotărâm împreună.",
		en: "Want to know whether a map would help? Book an evaluation and we decide together.",
	},
};
