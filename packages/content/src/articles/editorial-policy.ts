import type { ArticleInput } from "../schema";

/**
 * The one fully rendered article: how we write and review. It describes the editorial process
 * (content-strategy.md, "Editorial workflow"), not health facts, so it needs no clinical reviewer.
 * The owner still signs it off before it goes live.
 */
export const EDITORIAL_POLICY_SOURCE: ArticleInput = {
	slug: "cum-scriem-si-revizuim-articolele",
	brand: "psizone",
	topic: "editorial",
	backlogNo: null,
	status: "published",
	kind: "editorial",
	author: { team: { ro: "Redacția", en: "The editors" } },
	reviewer: null,
	publishedAt: "2026-11-11",
	title: {
		ro: "Cum scriem și revizuim articolele",
		en: "How we write and review our articles",
	},
	standfirst: {
		ro: "Fiecare articol de sănătate de aici are un autor cu nume și un clinician care îl verifică, semnează și datează revizia. Trimitem la surse, nu promitem vindecări și încheiem cu un singur pas următor.",
		en: "Every health article here has a named author and a clinician who checks it, signs the review and dates it. We link our sources, promise no cures, and end with one next step.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: înainte să ajungă la tine, un articol trece prin două perechi de mâini și primește o dată. Îl scrie cineva care își pune numele pe el. Îl citește apoi un clinician din echipă, care îl poate aproba, îl poate întoarce cu observații sau îl poate opri. După douăsprezece luni îl citim din nou, ca să nu rămână în urma a ceea ce se știe.",
				en: "In short: before an article reaches you, it passes through two pairs of hands and is given a date. Someone writes it and puts their name on it. A clinician from the team then reads it and can approve it, send it back with comments, or stop it. Twelve months later we read it again, so it does not fall behind what is known.",
			},
		},
		{
			type: "h2",
			text: { ro: "De ce începem cu răspunsul", en: "Why we start with the answer" },
		},
		{
			type: "p",
			text: {
				ro: "Multe întrebări ajung aici seara târziu, de pe telefon, de la cineva îngrijorat. De aceea primul paragraf răspunde la întrebarea din titlu. Abia apoi vin detaliile, exemplele și nuanțele. Dacă te oprești după primele rânduri, pleci totuși cu ce ai venit să afli.",
				en: "Many questions arrive here late in the evening, on a phone, from someone who is worried. So the first paragraph answers the question in the headline. The details, examples and nuances come after. If you stop after the first few lines, you still leave with what you came for.",
			},
		},
		{
			type: "h2",
			text: { ro: "Cine scrie și cine verifică", en: "Who writes and who checks" },
		},
		{
			type: "p",
			text: {
				ro: "Fiecare articol de sănătate are un autor numit și un recenzent clinic numit, iar data reviziei apare sub titlu. Recenzentul este un practician din echipă care citește textul ca pe ceva ce i-ar da unui părinte sau unui pacient în cabinet. Numele lui și data aprobării rămân păstrate lângă text.",
				en: "Every health article has a named author and a named clinical reviewer, and the review date sits under the headline. The reviewer is a practitioner from the team who reads the text as something they would hand to a parent or a patient in the consulting room. Their name and the date of approval stay on record next to the text.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un articol scris și revizuit o singură dată ajunge apoi în mai multe locuri: aici, pe blog, în paginile despre fiecare subiect, în întrebările frecvente și în răspunsurile ghidului. De aceea o corectură făcută într-un loc se vede peste tot.",
				en: "An article written and reviewed once then appears in several places: here on the blog, on the page for each topic, in the frequently asked questions and in the guide’s answers. So a correction made in one place shows everywhere.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Până când un articol are ambele nume, nu îl publicăm. Pe prima pagină vezi deja subiectele la care lucrăm, marcate „în lucru”, fără niciun rând de conținut.",
				en: "Until an article carries both names, we do not publish it. On the front page you can already see the subjects we are working on, marked “in progress”, without a single line of content.",
			},
		},
		{
			type: "quote",
			text: {
				ro: "O pagină goală e mai cinstită decât un sfat pe care nu l-a verificat nimeni.",
				en: "An empty page is more honest than advice nobody has checked.",
			},
		},
		{
			type: "h2",
			text: { ro: "Ce nu vei citi aici", en: "What you will not read here" },
		},
		{
			type: "list",
			items: [
				{
					ro: "Promisiuni de vindecare sau termene garantate.",
					en: "Promises of a cure, or guaranteed timelines.",
				},
				{
					ro: "Procente fără sursă sau cifre care sună bine, dar nu pot fi verificate.",
					en: "Percentages without a source, or figures that sound good but cannot be checked.",
				},
				{
					ro: "Mărturii folosite ca dovadă că ceva funcționează. Când publicăm povestea cuiva, o facem doar cu acordul lui scris și fără afirmații despre rezultate.",
					en: "Testimonials used as proof that something works. When we publish someone’s story, we do so only with their written consent and without claims about outcomes.",
				},
				{
					ro: "Texte generate automat și publicate fără ca un om să le fi citit și aprobat.",
					en: "Machine-written text published without a person having read and approved it.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Când descriem o metodă, explicăm cum se desfășoară și cum se măsoară progresul, nu ce minuni face. Paginile despre metode spun și pentru cine nu sunt potrivite.",
				en: "When we describe a method, we explain how it works and how progress is measured, not what wonders it performs. Method pages also say who they are not suitable for.",
			},
		},
		{
			type: "h2",
			text: { ro: "Sursele", en: "Sources" },
		},
		{
			type: "p",
			text: {
				ro: "Când un articol se sprijină pe un studiu, pe un ghid clinic sau pe o carte, legătura stă în text, acolo unde o folosim. Dacă nu putem cita ceva, nu afirmăm acel lucru.",
				en: "When an article rests on a study, a clinical guideline or a book, the link sits in the text, where we use it. If we cannot cite something, we do not claim it.",
			},
		},
		{
			type: "h2",
			text: { ro: "Ghidul și articolele", en: "The guide and the articles" },
		},
		{
			type: "p",
			text: {
				ro: "Ghidul răspunde doar din conținut publicat și revizuit și îți arată de unde a luat răspunsul. Nu pune diagnostice, nu recomandă tratamente individuale și nu vorbește despre medicamente. Ciornele nu ajung la el. Când nu are încă un răspuns verificat, îți spune asta și te îndrumă spre un om din echipă.",
				en: "The guide answers only from published, reviewed content and shows you where its answer came from. It does not diagnose, does not recommend individual treatment and does not talk about medication. Drafts never reach it. When it has no checked answer yet, it says so and points you to a person on the team.",
			},
		},
		{
			type: "p",
			text: {
				ro: "În situații de criză nu răspunde ghidul. Textul pe care îl vezi atunci e fix, scris și verificat de oameni, cu numărul 112 și telefonul clinicii.",
				en: "In a crisis, the guide does not answer. The text you see then is fixed, written and checked by people, with the 112 emergency number and the clinic’s phone.",
			},
		},
		{
			type: "h2",
			text: { ro: "Ritmul", en: "The pace" },
		},
		{
			type: "p",
			text: {
				ro: "Publicăm puțin și verificat: în jur de două articole pe lună. Paginile cele mai citite le recitim în fiecare trimestru, iar orice articol mai vechi de un an este semnalat pentru o nouă revizie. La revizie, clinicianul confirmă textul sau îl actualizează, iar noua dată apare sub titlu.",
				en: "We publish little, and checked: around two articles a month. We reread the most-read pages every quarter, and any article older than a year is flagged for a fresh review. At that review the clinician confirms the text or updates it, and the new date appears under the headline.",
			},
		},
		{
			type: "h2",
			text: { ro: "Un singur pas următor", en: "One next step" },
		},
		{
			type: "p",
			text: {
				ro: "Fiecare articol se încheie cu o singură propunere: o pagină unde afli mai mult, o întrebare pentru ghid sau o programare. Fără ferestre care apar în mijlocul textului și fără bannere între paragrafe. Citești în liniște, apoi alegi tu.",
				en: "Every article ends with a single suggestion: a page where you can learn more, a question for the guide, or a booking. No windows popping up mid-text and no banners between paragraphs. You read in peace, then you choose.",
			},
		},
	],
};
