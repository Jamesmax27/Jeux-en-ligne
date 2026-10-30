// =============================================================================
// Pseudos interdits — modération des pseudos du classement public
// =============================================================================
//
// Rôle : listes des racines et des mots refusés dans les pseudos que les
// joueurs choisissent (classement public, vu par des enfants), et fonctions
// de contrôle. Utilisé par functions/_profil.js : le serveur appelle
// pseudoInterdit(texte) et refuse le pseudo si la réponse n'est pas null.
//
// Comparaison :
// 1. Le pseudo est d'abord normalisé (normaliserPseudo) : minuscules, accents
//    retirés (ß → ss, œ → oe, æ → ae), chiffres et symboles de contournement
//    remplacés (0 → o, 1 → i, 3 → e, 4 → a, 5 → s, 7 → t, 8 → b, @ → a,
//    $ → s, ! → i, | → i, € → e), tout ce qui n'est pas a-z retiré, lettres
//    répétées réduites à une seule (« F.u.u.u.c.k » → « fuck »).
// 2. RACINES_INTERDITES et NOMS_RESERVES : refusés s'ils apparaissent
//    N'IMPORTE OÙ dans le pseudo normalisé (sous-chaîne).
// 3. MOTS_INTERDITS : refusés seulement s'ils forment un MOT ENTIER du pseudo
//    (motsDuPseudo : découpe aux espaces, tirets, soulignés, points, autres
//    signes, et aux passages lettres ↔ chiffres ; des lettres isolées qui se
//    suivent sont recollées : « c o n » → « con ») ou le pseudo entier.
// 4. Avant la recherche des sous-chaînes, les mots innocents de
//    MOTS_TOLERES sont retirés (« badminton » contient « admin »).
//
// Pourquoi deux listes : un mot trop court ou trop courant, cherché partout,
// ferait refuser des pseudos innocents (« con » est dans « conte », « ass »
// dans « classe », « puta » dans « computador » et « disputa », « cunt » dans
// « Scunthorpe », « dick » dans « Dickens », « anal » dans « analyse »). Ces
// mots-là vont dans MOTS_INTERDITS. Les racines longues et propres à
// l'insulte (« merde », « putain », « fuck ») vont dans RACINES_INTERDITES.
// Attention aussi aux lettres répétées réduites : « ass » devient « as » (mot
// français et espagnol courant) et « kkk » devient « k » : ces deux-là ne sont
// pas dans les listes ; « root » (→ « rot », rouge en allemand) non plus.
//
// Pour ajouter une entrée :
// - une racine par entrée, écrite DÉJÀ NORMALISÉE (sans accent, sans
//   majuscule, lettres répétées réduites : « salope » et non « saloppe »,
//   « scheis » pour « Scheiße », « ashole » pour « asshole ») ;
// - dans la bonne langue, en gardant l'ordre alphabétique ;
// - avant d'ajouter une racine, chercher si elle apparaît dans un mot
//   innocent courant des 5 langues ; si oui, la mettre dans MOTS_INTERDITS.
// =============================================================================

// Racines refusées n'importe où dans le pseudo normalisé (sous-chaîne).
export const RACINES_INTERDITES = Object.freeze([
  // français
  'abruti', 'batard', 'bougnoule', 'branlete', 'branleur', 'canabis',
  'chiase', 'chinetoque', 'clito', 'conard', 'conase', 'couile', 'cretin',
  'debile', 'ejacul', 'encul', 'enfoire', 'filsdepute', 'fiote', 'foutre',
  'gouine', 'grognase', 'haschisch', 'imbecil', 'jetetue', 'jihad', 'masturb',
  'merde', 'negre', 'niquetamere',
  'orgasm', 'partouze', 'pedophil', 'petase', 'poufiase', 'putain', 'salaud',
  'salearabe', 'salejuif', 'salenoir', 'salopard', 'sodomi', 'suceuse',
  'suicid', 'tafiole', 'tagueule', 'tantouze', 'tarlouze', 'terorist', 'tetuer',
  'teub', 'trouducul', 'violer', 'violeur', 'youpin',
  // anglais
  'ashole', 'bastard', 'biatch', 'bitch', 'blowjob', 'bolocks', 'cocain',
  'cocksucker', 'crackhead', 'dickhead', 'dildo', 'douchebag', 'dumbas',
  'ecstasy', 'fck', 'fuck', 'handjob', 'hentai', 'hitler', 'idiot', 'incest',
  'jackas', 'kilyou', 'kukluxklan', 'molest', 'penis', 'phuck', 'porno',
  'retarded', 'sexe', 'sexy', 'shit', 'skank', 'slut', 'tities', 'twat',
  'vagina', 'wanker', 'wetback', 'whitepower', 'whore',
  // espagnol
  'cabron', 'chinga', 'chupamela', 'cojon', 'conchatumadre', 'culero',
  'estupid', 'folar', 'gilipolas', 'hijodeputa', 'hijueputa', 'jodid',
  'joder', 'malparido', 'maricon', 'marihuana', 'marijuana', 'matarte',
  'mierda', 'negrata', 'panocha', 'pendej', 'sudaca', 'temato', 'violador',
  // portugais (Brésil)
  'arombad', 'babaca', 'boiola', 'buceta', 'caralho', 'cuzao', 'desgracad',
  'estupro', 'filhodaputa', 'foda', 'foder', 'maconha', 'merda', 'mongoloide',
  'otario', 'piroca', 'punheta', 'retardad', 'sapatao', 'tematar', 'tesao',
  'tomarnocu', 'viadinho', 'xoxota',
  // allemand
  'arschloch', 'bumsen', 'ficken', 'ficker', 'fotze', 'haltdiefrese',
  'hakenkreuz', 'hurensohn', 'ichbringdichum', 'judensau', 'judenschwein',
  'kanacke', 'kanake', 'kifer', 'kokain', 'misgeburt', 'neger', 'pimel',
  'polacke', 'scheis', 'schlampe', 'schwuchtel', 'selbstmord', 'siegheil',
  'titen', 'trotel', 'umbringen', 'untermensch', 'verecke', 'verpis',
  'wichser', 'wixer', 'zigeuner',
]);

// Mots refusés seulement s'ils forment un mot entier du pseudo, ou le pseudo
// entier (trop courts ou présents dans des mots innocents).
export const MOTS_INTERDITS = Object.freeze([
  // français
  'baise', 'baiseur', 'beuh', 'bicot' /* « abricot » */, 'bite',
  'bordel' /* « bordelais » */, 'chier' /* « fichier » */, 'con', 'creve'
  /* « crevette » */, 'cul', 'drogue' /* « droguerie » */, 'fdp', 'ftg',
  'nichon' /* « cornichon » */, 'nichons', 'nique' /* « technique » */, 'niquer', 'ntm', 'pd', 'pede', 'pute' /* « dispute », « computer » */,
  'putes', 'salope' /* « salopette » */, 'salopes', 'suce' /* « sucette » */,
  'suceur', 'tamere', 'viol' /* « violon », « violet » */, 'zob',
  // anglais
  'anal' /* « analyse » */, 'anus' /* « manuscrit » */, 'arse' /* « Arsène » */,
  'boner', 'chink', 'cock' /* « peacock » */, 'crap' /* « scrap » */, 'cum',
  'cunt' /* « Scunthorpe » */, 'dick' /* « Dickens » */, 'dyke', 'fag', 'fagot',
  'fuk' /* « Fukushima » */, 'gok', 'hoe', 'horny' /* « thorny » */, 'jiz',
  'kike', 'kys', 'meth' /* « method » */, 'milf', 'niga', 'nigas', 'nigaz',
  'niger', 'nigers', 'nudes', 'pedo' /* « torpedo » */, 'porn' /* « Pornic » */,
  'pusy' /* « pussycat » */, 'rape' /* « grape » */, 'rapist'
  /* « therapist » */, 'sex' /* « Essex » */, 'spic' /* « spicy » */, 'stfu',
  'stoner', 'tits', 'trany', 'wed' /* « weed » */, 'wtf',
  // espagnol
  'capulo', 'cono' /* « cône » */, 'culo' /* « cálculo », « músculo » */,
  'droga' /* « drogaria » */, 'huevon', 'joto', 'mamada', 'marica'
  /* « Maricarmen » */, 'pajero', 'pinche', 'poro' /* « porro » */, 'puta'
  /* « computadora », « disputa », « reputación » */, 'putas', 'putita', 'puto',
  'putos', 'tetas', 'tumadre', 'verga' /* « vergar » */,
  // portugais (Brésil)
  'bicha', 'boquete', 'bosta', 'cacete', 'corno', 'pora' /* « porra »,
  « temporada » */, 'pqp', 'safada', 'safado', 'vagabunda', 'viado'
  /* « enviado » */, 'vsf', 'vtnc',
  // allemand
  'arsch' /* « Barsch » */, 'droge', 'drogen', 'fick' /* « fickle » */,
  'frese', 'heil' /* « Heilbronn » */, 'hure', 'kacke', 'mord' /* « Mordor » */,
  'muschi', 'nazi' /* « Nazim » */, 'nazis', 'nute', 'spast', 'spasti',
]);

// Racines refusées n'importe où : elles imitent l'équipe du site ou une marque.
export const NOMS_RESERVES = Object.freeze([
  'admin', 'anthropic', 'claude', 'cloudflare', 'fremicrogames', 'gogle',
  'microgames', 'moderador', 'moderat', 'modo', 'oficial', 'oficiel', 'staf',
  'suport', 'system', 'webmaster',
]);

// Mots innocents (déjà normalisés) retirés du pseudo normalisé avant la
// recherche des sous-chaînes, parce qu'ils contiennent une racine ci-dessus.
export const MOTS_TOLERES = Object.freeze([
  'badminton', 'claudete', 'comodo', 'ecosystem', 'jeanclaude', 'stafel',
  'suporter', 'suporteur', 'suportrice',
]);

// Chiffres et symboles de contournement.
const REMPLACEMENTS = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '€': 'e',
};

// Forme comparée d'un texte : minuscules, sans accent, contournements
// remplacés, lettres a-z seules, lettres répétées réduites.
export function normaliserPseudo(texte) {
  return String(texte ?? '')
    .normalize('NFKD') // sépare les accents, ramène les caractères « pleine largeur »
    .toLowerCase()
    .replace(/ß/g, 'ss').replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/đ/g, 'd')
    .replace(/\p{M}+/gu, '') // diacritiques
    .replace(/[0134578@$!|€]/g, (c) => REMPLACEMENTS[c])
    .replace(/[^a-z]+/g, '')
    .replace(/([a-z])\1+/g, '$1');
}

// Mots du pseudo d'origine, normalisés : découpe aux espaces, tirets,
// soulignés, points (et tout autre signe qui n'est pas un symbole de
// contournement), puis aux passages lettres ↔ chiffres.
export function motsDuPseudo(texte) {
  const mots = [];
  for (const morceau of String(texte ?? '').split(/[^\p{L}\p{N}\p{M}@$!|€]+/u)) {
    for (const partie of morceau.split(/(?<=\p{L}|\p{M})(?=\p{N})|(?<=\p{N})(?=\p{L})/u)) {
      const mot = normaliserPseudo(partie);
      if (mot) mots.push(mot);
    }
  }
  return mots;
}

const ENSEMBLE_MOTS = new Set(MOTS_INTERDITS);

// Mots à comparer à MOTS_INTERDITS : les mots du pseudo, plus les lettres
// isolées qui se suivent recollées (« c.o.n », « gros c u l »).
function motsAComparer(texte) {
  const mots = motsDuPseudo(texte);
  const resultat = [...mots];
  let suite = '';
  for (const mot of [...mots, '']) {
    if (mot.length === 1) { suite += mot; continue; }
    if (suite.length > 1) resultat.push(normaliserPseudo(suite));
    suite = '';
  }
  return resultat;
}

// null si le pseudo est accepté, sinon la raison : 'grossier' ou 'reserve'.
export function pseudoInterdit(texte) {
  const entier = normaliserPseudo(texte);
  let compare = entier;
  for (const tolere of MOTS_TOLERES) compare = compare.split(tolere).join(' ');
  if (RACINES_INTERDITES.some((r) => compare.includes(r))) return 'grossier';
  if (ENSEMBLE_MOTS.has(entier) || motsAComparer(texte).some((m) => ENSEMBLE_MOTS.has(m))) {
    return 'grossier';
  }
  if (NOMS_RESERVES.some((r) => compare.includes(r))) return 'reserve';
  return null;
}
