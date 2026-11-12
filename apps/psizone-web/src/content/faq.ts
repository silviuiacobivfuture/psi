import type { Localised } from "./localised";

/**
 * DRAFT — owner review pending (written 2026-11-12). Frequently asked questions.
 *
 * Every answer restates something already published or documented: the owners' story
 * (content/story.ts), the contact page and booking form (messages contact_*, form_*), the phones
 * published on psizone.ro, the guide's own limits (guide_footer, guide_refusal_out_of_scope) and
 * the closing band (cta_text). What no source answers (address, hours, prices, referrals) is a
 * `placeholder`, shown as such on the page.
 */
export interface FaqEntry {
	id: string;
	q: Localised;
	a: Localised;
	link?: { label: Localised; href: string };
	placeholder?: Localised;
}

export const FAQ: ReadonlyArray<FaqEntry> = [
	{
		id: "cine",
		q: { ro: "Cu cine lucrați?", en: "Who do you work with?" },
		a: {
			ro: "Cu copii, adolescenți, adulți și seniori, și cu familiile lor. Am început cu copiii, apoi am crescut echipa pentru adulți și seniori.",
			en: "With children, teenagers, adults and seniors, and with their families. We started with children, then grew the team for adults and seniors.",
		},
		link: { label: { ro: "Vezi temele", en: "See the topics" }, href: "/#pentru-cine" },
	},
	{
		id: "programare",
		q: { ro: "Cum fac o programare?", en: "How do I book?" },
		a: {
			ro: "Lasă-ne datele de contact în formular și te sunăm noi, sau sună-ne direct la 0748 017 752 sau 0752 466 792.",
			en: "Leave your contact details in the form and we call you, or call us directly on 0748 017 752 or 0752 466 792.",
		},
		link: { label: { ro: "Formularul de programare", en: "The booking form" }, href: "/contact" },
	},
	{
		id: "prima-vizita",
		q: { ro: "Ce se întâmplă la prima vizită?", en: "What happens at the first visit?" },
		a: {
			ro: "Prima discuție e despre voi, nu despre diagnostic. Urmează evaluarea, apoi un singur plan, cu specialiștii potriviți.",
			en: "The first conversation is about you, not about a diagnosis. Then comes the evaluation, then one plan, with the right specialists.",
		},
		link: { label: { ro: "Pașii, pe rând", en: "The steps, one by one" }, href: "/prima-vizita" },
	},
	{
		id: "cost",
		q: { ro: "Cât costă?", en: "How much does it cost?" },
		a: {
			ro: "Ne spui ce te îngrijorează, iar noi îți spunem ce urmează și cât costă.",
			en: "You tell us what worries you, and we tell you what comes next and what it costs.",
		},
		placeholder: {
			ro: "Prețurile sau intervalele de preț, dacă le publicăm.",
			en: "Prices or price ranges, if we publish them.",
		},
	},
	{
		id: "trimitere",
		q: {
			ro: "Am nevoie de un diagnostic sau de o trimitere?",
			en: "Do I need a diagnosis or a referral?",
		},
		a: {
			ro: "Nu ai nevoie de un diagnostic ca să ne suni: ne poți contacta și când ai doar preocupări legate de dezvoltare sau de starea ta. Prima discuție e despre voi, nu despre diagnostic.",
			en: "You do not need a diagnosis to call us: you can contact us when you only have concerns about development or about how you feel. The first conversation is about you, not about a diagnosis.",
		},
		placeholder: {
			ro: "Dacă și când e nevoie de o trimitere de la medic.",
			en: "Whether and when a doctor's referral is needed.",
		},
	},
	{
		id: "date",
		q: { ro: "Ce date îmi cereți în formular?", en: "What does the form ask for?" },
		a: {
			ro: "Numele, un e-mail sau un telefon, pentru cine e evaluarea și când te putem suna. Nu îți cerem detalii medicale; despre ce te îngrijorează vorbim la telefon.",
			en: "Your name, an email or a phone number, who the evaluation is for and when we can call. We don't ask for medical details; we talk about what worries you on the phone.",
		},
	},
	{
		id: "metode-proprii",
		q: { ro: "Ce sunt metodele voastre proprii?", en: "What are your own methods?" },
		a: {
			ro: "Din experiența și cercetările noastre s-au născut două metode proprii, brevetate.",
			en: "From our experience and research, two methods of our own were born, both patented.",
		},
		link: { label: { ro: "Toate metodele", en: "All methods" }, href: "/metode" },
	},
	{
		id: "ghid",
		q: {
			ro: "Ghidul Psizone îmi poate spune ce are copilul meu?",
			en: "Can the Psizone guide tell me what my child has?",
		},
		a: {
			ro: "Nu. Ghidul răspunde din conținut revizuit și nu înlocuiește consultul. Despre diagnostic, medicație sau tratament vorbim doar cu un specialist, față în față.",
			en: "No. The guide answers from reviewed content and does not replace a consultation. Diagnosis, medication or treatment we discuss only with a specialist, face to face.",
		},
	},
	{
		id: "durata",
		q: { ro: "Cât durează terapia?", en: "How long does therapy take?" },
		a: {
			ro: "Durata, frecvența și costul depind de nevoile fiecărei persoane și de serviciile din plan. O estimare responsabilă se poate face după evaluarea inițială, de aceea nu dăm termene la telefon.",
			en: "Duration, frequency and cost depend on each person's needs and on the services in the plan. A responsible estimate is possible after the first evaluation, which is why we do not quote timelines over the phone.",
		},
	},
	{
		id: "parinti",
		q: { ro: "Sunt implicați și părinții?", en: "Are parents involved?" },
		a: {
			ro: "Da. Colaborarea cu familia ajută strategiile să funcționeze și progresul să se vadă în viața de zi cu zi. Primești explicații și recomandări concrete.",
			en: "Yes. Working with the family helps strategies work and progress show in everyday life. You receive explanations and concrete recommendations.",
		},
	},
	{
		id: "neurofeedback",
		q: {
			ro: "QEEG și neurofeedbackul înlocuiesc terapia?",
			en: "Do QEEG and neurofeedback replace therapy?",
		},
		a: {
			ro: "Nu. Pot fi recomandate ca metode complementare, în anumite situații, după evaluarea individuală. Nu înlocuiesc intervențiile psihologice, educaționale sau logopedice și nici recomandările medicale.",
			en: "No. They can be recommended as complementary methods, in some situations, after the individual evaluation. They do not replace psychological, educational or speech interventions, nor medical advice.",
		},
		link: { label: { ro: "Toate metodele", en: "All methods" }, href: "/metode" },
	},
	{
		id: "online",
		q: { ro: "Se poate face terapia online?", en: "Can therapy be done online?" },
		a: {
			ro: "Da. Psihoterapia individuală, cea de familie și de cuplu și hipnoterapia se pot face online, cu o aplicație pe telefon sau calculator, căști și un loc liniștit.",
			en: "Yes. Individual psychotherapy, family and couple therapy and hypnotherapy can be done online, with an app on a phone or computer, headphones and a quiet place.",
		},
	},
	{
		id: "sport",
		q: {
			ro: "Lucrați și cu sportivi?",
			en: "Do you work with athletes too?",
		},
		a: {
			ro: "Da. Ne-am specializat în psihologie sportivă și am lucrat cu piloți de automobilism și cu sportivi de taekwondo, tenis, karate, gimnastică și înot.",
			en: "Yes. We specialised in sport psychology and have worked with racing drivers and with athletes in taekwondo, tennis, karate, gymnastics and swimming.",
		},
		link: { label: { ro: "Psihologie sportivă", en: "Sport psychology" }, href: "/programe/sport" },
	},
	{
		id: "unde",
		q: { ro: "Unde vă aflați?", en: "Where are you?" },
		a: {
			ro: "În Galați, pe strada General Alexandru Cernat nr. 126, așa cum este publicat pe site-ul centrului.",
			en: "In Galați, at Strada General Alexandru Cernat 126, as published on the centre's website.",
		},
		placeholder: {
			ro: "Programul centrului.",
			en: "The centre's opening hours.",
		},
	},
];

/** The questions the home page shows, by id. */
export const FAQ_HOME: ReadonlyArray<string> = ["prima-vizita", "cost", "date"];
