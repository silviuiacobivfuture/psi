import { fold, matchesAny } from "./normalize";

/**
 * Crisis language in Romanian and English: suicide, self-harm, abuse and emergencies. Patterns run
 * on folded text (see `fold`), so they match with or without diacritics. They lean towards safety:
 * an informational question about suicide prevention still gets the fixed crisis message, while
 * idioms that only look alarming ("mă bate gândul", "mă omor după ciocolată", "I died laughing")
 * do not.
 */
/** First, second and third person, so a parent describing a child is heard too. */
const WANT_RO =
	"(vreau|vrea|vrei|vor|vrem|vreti|voia|voiam|voiai|as vrea|ar vrea|imi vine|ii vine|mi vine|i vine)";
const SELF_EN = "(my|him|her|them|your|our) ?(self|selves)";
const PERSON_EN = "(my|his|her|their|your)";

const SUICIDE: ReadonlyArray<RegExp> = [
	/\bsinuci[dg]/,
	/\bsuicid/,
	new RegExp(
		`\\b${WANT_RO} sa (mor|moara|mori|murim|muriti)\\b(?! de (ras|plictiseala|rusine|foame|ciuda))`,
	),
	/\bmai bine (as muri|ar muri|mor|moare|n as mai fi|n ar mai fi)\b/,
	new RegExp(
		`\\bnu mai ${WANT_RO} sa (traiesc|traiasca|traiesti|traim|fiu in viata|fie in viata|exist|existe)\\b`,
	),
	/\bnu mai are rost sa (traiesc|traiasca|exist|existe)\b/,
	/\b(sa|o sa) (ma|se|te) (omor|omoare|omori)\b/,
	/\b(mi|imi|isi|si|iti|ti) (iau|ia|iei) viata\b/,
	/\b(pun|puna|pune) capat (zilelor|vietii)\b/,
	new RegExp(`\\bkill(s|ing|ed)? ${SELF_EN}\\b`),
	new RegExp(
		`\\b(end|ends|ending|take|takes|taking) ${PERSON_EN} (own )?life\\b(?! (back|to|into|in|forward))`,
	),
	/\bend it all\b/,
	/\b(want|wants|wanted|wanna|wish|wishes) (to )?die\b/,
	/\bwish(es)? (i|he|she|they) (was|were) dead\b/,
	/\b(don t|doesn t|do not|does not|no longer) wants? to (live|be alive|exist)\b/,
	/\bno reason to live\b/,
	/\bbetter off dead\b/,
];

const SELF_HARM: ReadonlyArray<RegExp> = [
	/\bautovatam/,
	/\bautomutil/,
	/\b(sa|ca|iar) (ma|se|te) (tai|taie|ranesc|raneste)\b/,
	/\b(ma|se|te) (tai|taie|ranesc|raneste|ranesti|ard|arde|lovesc|loveste) (singur|singura|intentionat|pe maini|pe brate|pe picioare|cu lama|cu cutitul)\b/,
	/\b(sa|vreau sa|vrea sa) (mi|isi|si|iti|ti) (fac|faca|faci) rau\b/,
	/\b(imi|isi|iti) (fac|face|faci) rau (singur|singura|intentionat)\b/,
	/\bsupradoz/,
	/\bself ?harm/,
	new RegExp(`\\b(hurt|hurts|hurting|cut|cuts|cutting|burn|burns|burning) ${SELF_EN}\\b`),
	/\boverdos/,
];

const ABUSE: ReadonlyArray<RegExp> = [
	/\babuzat[ae]?\b/,
	/\babuzeaza\b/,
	/\babuz (sexual|fizic|emotional)\b/,
	/\b(viol|violul|violat|violata)\b/,
	/\bviolenta (domestica|in familie)\b/,
	/\b(ma|ne) (bate|bat|loveste|lovesc|agreseaza)\b(?! gandul)/,
	/\b(agresat|agresata|molestat|molestata) sexual\b/,
	/\bmolest/,
	/\babused\b/,
	/\babus(ing|es) (me|us|him|her|my)\b/,
	/\b(sexual|sexually|physical|child|domestic) abuse/,
	/\bdomestic violence\b/,
	/\b(rape|raped)\b/,
	/\b(hits|beats|is hitting|is beating) (me|us)\b/,
];

const EMERGENCY: ReadonlyArray<RegExp> = [
	/\b(e|este|am|avem) o urgenta\b/,
	/\burgenta medicala\b/,
	/\bambulanta\b/,
	/\bnu mai respira\b/,
	/\b(e|este|a ramas|a cazut) inconstient[ae]?\b/,
	/\ba lesinat\b/,
	/\b(this is|it s|it is|i have|we have|having) an emergency\b/,
	/\bmedical emergency\b/,
	/\bambulance\b/,
	/\b(stopped|isn t|is not|not) breathing\b/,
	/\b(is|he s|she s) unconscious\b/,
	/(?<![\d.])\b(112|911)\b(?![\d.])/,
];

const CRISIS: ReadonlyArray<RegExp> = [...SUICIDE, ...SELF_HARM, ...ABUSE, ...EMERGENCY];

/**
 * How much of an over-long question is still scanned for crisis language, so that a long message
 * from someone in crisis gets the crisis message rather than an input-length refusal.
 */
export const CRISIS_SCAN_LIMIT = 8000;

/** True when the text carries crisis language; such a question never reaches the model. */
export function isCrisis(text: string): boolean {
	return matchesAny(fold(text.slice(0, CRISIS_SCAN_LIMIT)), CRISIS);
}
