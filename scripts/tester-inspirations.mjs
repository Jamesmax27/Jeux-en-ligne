// ==========================================================================
// tester-inspirations.mjs — tests des saisons et tendances de la boucle de
// nuit (scripts/inspirations.mjs et leur usage par scripts/idees.mjs), sans
// réseau
//
//   node scripts/tester-inspirations.mjs
//
// Vérifie : dates des fêtes (Pâques, Ne jour du mois, dates uniques), fenêtre
// de fabrication, calendrier-saisons.json, lecture du flux RSS de Google
// Trends (exemple écrit ici), filtre de l'actualité, relevés gardés 14 jours,
// classement des recherches, contrôle des idées proposées par l'agent ; puis,
// dans une copie du dépôt (dossier temporaire, date du jour imposée par
// BOUCLE_AUJOURDHUI) : ajout des idées inspirées (une par fête, pas sans
// TENDANCES_BOUCLE), choix (fête hors de sa fenêtre jamais choisie, quota,
// tendance périmée devenue ordinaire), report d'une fête passée à l'année
// suivante, manque-tendances. Code de sortie 1 si un test échoue.
// ==========================================================================

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dateFete, prochaineFete, fenetreOuverte, chargerCalendrier, lireFlux, raisonFiltre, fusionner, score, idRecherche,
} from './inspirations.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let echecs = 0;
let reussis = 0;
function test(nom, fn) {
  try {
    fn();
    reussis++;
    console.log(`  ok   ${nom}`);
  } catch (e) {
    echecs++;
    console.log(`  ÉCHEC ${nom}\n       ${String(e.message).split('\n').join('\n       ')}`);
  }
}

// --- Dates et calendrier -----------------------------------------------------------

console.log('Dates et calendrier');
const FENETRE = { avant: 42, fin: 7 };

test('dates des fêtes (Pâques, Mardi gras, Ne jour du mois, dates fixes et uniques)', () => {
  assert.equal(dateFete('paques', 2026), '2026-04-05');
  assert.equal(dateFete('paques', 2027), '2027-03-28');
  assert.equal(dateFete('paques', 2030), '2030-04-21');
  assert.equal(dateFete('paques-47', 2026), '2026-02-17');
  assert.equal(dateFete('paques+1', 2026), '2026-04-06');
  assert.equal(dateFete('4-jeudi-11', 2026), '2026-11-26');
  assert.equal(dateFete('4-jeudi-11', 2027), '2027-11-25');
  assert.equal(dateFete('2-dimanche-05', 2026), '2026-05-10');
  assert.equal(dateFete('dernier-dimanche-05', 2026), '2026-05-31');
  assert.equal(dateFete('5-lundi-02', 2026), '', 'pas de 5e lundi en février 2026');
  assert.equal(dateFete('12-25', 2026), '2026-12-25');
  assert.equal(dateFete('02-29', 2027), '');
  assert.equal(dateFete('02-29', 2028), '2028-02-29');
  assert.equal(dateFete('2028-07-14', 2027), '');
  assert.equal(dateFete('2028-07-14', 2028), '2028-07-14');
  assert.equal(dateFete('noel', 2026), '');
});

test('prochaine fête : celle de l\'année suivante une fois la fenêtre fermée', () => {
  const noel = { date: '12-25' };
  assert.equal(prochaineFete(noel, '2026-11-02', FENETRE), '2026-12-25');
  assert.equal(prochaineFete(noel, '2026-12-18', FENETRE), '2026-12-25');
  assert.equal(prochaineFete(noel, '2026-12-19', FENETRE), '2027-12-25');
  assert.equal(prochaineFete({ date: '2026-07-14' }, '2026-08-01', FENETRE), '', 'fête unique passée');
});

test('fenêtre de fabrication : de 42 à 7 jours avant la fête', () => {
  assert.equal(fenetreOuverte('2026-12-25', '2026-11-12', FENETRE), false);
  assert.equal(fenetreOuverte('2026-12-25', '2026-11-13', FENETRE), true);
  assert.equal(fenetreOuverte('2026-12-25', '2026-12-18', FENETRE), true);
  assert.equal(fenetreOuverte('2026-12-25', '2026-12-19', FENETRE), false);
  assert.equal(fenetreOuverte('', '2026-12-01', FENETRE), false);
});

test('calendrier-saisons.json lisible et complet (une date chaque année)', () => {
  const c = chargerCalendrier();
  assert.ok(c.evenements.length >= 10);
  for (const e of c.evenements) {
    if (/^\d{4}-/.test(e.date)) continue;
    for (const a of [2026, 2027, 2028]) assert.ok(dateFete(e.date, a), `${e.id} sans date en ${a}`);
  }
});

test('calendrier invalide refusé avec la raison', () => {
  const dossier = mkdtempSync(path.join(os.tmpdir(), 'fmg-calendrier-'));
  const fichier = path.join(dossier, 'calendrier.json');
  writeFileSync(fichier, JSON.stringify({ fenetre: { avant: 7, fin: 7 }, evenements: [
    { id: 'Noël', nom: 'Noël', date: '12-25', pays: 'tous', themes: 'sapin et cadeaux' },
    { id: 'fete', nom: 'Fête', date: 'bientot', pays: ['XX'], themes: 'court', univers: ['licornes'] },
  ] }));
  try {
    assert.throws(() => chargerCalendrier(fichier), (e) => /fenetre/.test(e.message) && /"id"/.test(e.message)
      && /"date" illisible/.test(e.message) && /"pays"/.test(e.message) && /"themes"/.test(e.message) && /"univers"/.test(e.message));
  } finally { rmSync(dossier, { recursive: true, force: true }); }
});

// --- Recherches Google -------------------------------------------------------------

console.log('Recherches Google');

const FLUX = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:ht="https://trends.google.com/trending/rss" version="2.0"><channel><title>Daily Search Trends</title>
<item><title>éclipse de lune</title><ht:approx_traffic>20 000+</ht:approx_traffic>
<ht:news_item><ht:news_item_title>Une &quot;éclipse&quot; visible ce soir &amp; demain</ht:news_item_title></ht:news_item></item>
<item><title><![CDATA[premières neiges]]></title><ht:approx_traffic>5K+</ht:approx_traffic></item>
<item><title>hommage national</title><ht:approx_traffic>1000+</ht:approx_traffic></item>
<item><title></title></item>
</channel></rss>`;

test('lecture du flux RSS (entités, CDATA, volume, articles)', () => {
  const r = lireFlux(FLUX);
  assert.equal(r.length, 3);
  assert.deepEqual(r[0], { texte: 'éclipse de lune', trafic: 20000, contexte: ['Une "éclipse" visible ce soir & demain'] });
  assert.equal(r[1].texte, 'premières neiges');
  assert.equal(r[1].trafic, 5000);
  assert.equal(idRecherche('Premières neiges !'), 'premieres-neiges');
});

test('filtre : l\'actualité, l\'argent, la politique et les matchs sont écartés', () => {
  for (const t of ['hommage national', 'accident ferroviaire espagne', 'accidente avión privado florida', 'bulgarie elections', 'intel stock price',
    'ios 27.3', 'qqq', 'pakhtakor vs al-nassr', 'psg x om', 'real oviedo - u. d. las palmas', 'forças armadas', 'mercado bitcoin', 'queen camilla',
    'ciberataque supermercados', 'suspeito']) {
    assert.ok(raisonFiltre(t), `« ${t} » aurait dû être écarté`);
  }
  for (const t of ['éclipse de lune', 'premières neiges', 'pluie d\'étoiles filantes', 'coupe du monde de rugby', 'cabañuelas']) {
    assert.equal(raisonFiltre(t), '', `« ${t} » aurait dû être gardé`);
  }
});

test('relevés : fusion par jour et par pays, écartées non gardées, 14 jours au plus', () => {
  let h = fusionner(null, [{ pays: 'FR', recherches: lireFlux(FLUX) }], '2026-10-20');
  h = fusionner(h, [{ pays: 'FR', recherches: lireFlux(FLUX) }, { pays: 'DE', recherches: [{ texte: 'Éclipse de lune', trafic: 100, contexte: [] }] }], '2026-11-01');
  const e = h.recherches['eclipse-de-lune'];
  assert.deepEqual(e.pays, ['FR', 'DE']);
  assert.deepEqual(e.jours, ['2026-10-20', '2026-11-01']);
  assert.equal(e.lectures, 3);
  assert.equal(e.trafic, 20000);
  assert.equal(h.recherches['hommage-national'], undefined);
  h = fusionner(h, [], '2026-11-03');
  assert.deepEqual(h.recherches['eclipse-de-lune'].jours, ['2026-11-01'], 'le relevé du 20 octobre a plus de 14 jours');
  h = fusionner(h, [], '2026-11-20');
  assert.equal(Object.keys(h.recherches).length, 0);
});

test('classement : une recherche qui revient plusieurs jours et dans plusieurs pays passe devant', () => {
  const souvent = { jours: ['2026-10-30', '2026-10-31', '2026-11-01'], pays: ['FR', 'ES'], lectures: 5, trafic: 1000 };
  const uneFois = { jours: ['2026-11-01'], pays: ['US'], lectures: 1, trafic: 50000 };
  assert.ok(score(souvent, '2026-11-01') > score(uneFois, '2026-11-01'));
});

// --- Copie du dépôt : idees.mjs et inspirations.mjs en ligne de commande -------------

console.log('File d\'idées (copie du dépôt)');

const BAC = mkdtempSync(path.join(os.tmpdir(), 'fmg-inspirations-'));
for (const f of ['scripts/idees.mjs', 'scripts/inspirations.mjs', 'scripts/controle-taxonomie.mjs', 'public/taxonomie.js', 'public/chemins.js', 'calendrier-saisons.json']) {
  mkdirSync(path.dirname(path.join(BAC, f)), { recursive: true });
  copyFileSync(path.join(RACINE, f), path.join(BAC, f));
}
mkdirSync(path.join(BAC, 'games'), { recursive: true });
mkdirSync(path.join(BAC, '.inspirations'), { recursive: true });

const ecrireJson = (f, v) => writeFileSync(path.join(BAC, f), `${JSON.stringify(v, null, 2)}\n`);
const lireJsonBac = (f) => JSON.parse(readFileSync(path.join(BAC, f), 'utf8'));
// Lance une commande ; sortie standard et messages (stderr) séparés.
function lancer(script, args, jour) {
  try {
    const sortie = execFileSync(process.execPath, [path.join(BAC, 'scripts', script), ...args], {
      cwd: BAC, env: { ...process.env, BOUCLE_AUJOURDHUI: jour }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { sortie, code: 0 };
  } catch (e) {
    return { sortie: `${e.stdout || ''}${e.stderr || ''}`, code: e.status };
  }
}

const DESCRIPTION = 'Un jeu riche : le geste de base, trois mécaniques qui se combinent au fil de vingt niveaux, des étoiles à gagner et des objets à collectionner.';
const idee = (id, plus = {}) => ({
  id, titre: `Idée ${id}`, description: DESCRIPTION, genre: 'arcade', univers: ['nature'], ages: '6+',
  source: 'agent', date_ajout: '2026-10-01', statut: 'en_attente', jeu_id: null, ...plus,
});
const proposition = (titre, plus = {}) => ({ titre, description: DESCRIPTION, genre: 'puzzle', univers: ['nature'], ages: '6+', ...plus });

try {
  ecrireJson('idees-archive.json', []);
  ecrireJson('idees.json', ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => idee(`ordinaire-${x}`)));
  // Jeu de Halloween publié cette année : pas de 2e jeu de Halloween.
  mkdirSync(path.join(BAC, 'games', 'citrouilles'), { recursive: true });
  ecrireJson('games/citrouilles/game.json', { id: 'citrouilles', title: 'Citrouilles', genre: 'arcade', univers: ['fantasy'], ages: '6+', added: '2026-10-01', inspiration: 'saison:halloween' });

  test('ajouter : idées inspirées refusées sans TENDANCES_BOUCLE', () => {
    writeFileSync(path.join(BAC, 'prop.json'), JSON.stringify([proposition('Lutins du sapin', { inspiration: 'saison:noel' })]));
    const r = lancer('idees.mjs', ['ajouter', 'prop.json'], '2026-11-02');
    assert.equal(r.code, 0, r.sortie);
    assert.match(r.sortie, /Refusée : Lutins du sapin — idée inspirée/);
    assert.ok(!lireJsonBac('idees.json').some((i) => i.inspiration));
  });

  test('ajouter --tendances 1 : fête et tendance acceptées, pour_le calculé ; doublons, fête inconnue et fête déjà jouée refusés', () => {
    writeFileSync(path.join(BAC, 'prop.json'), JSON.stringify([
      proposition('Lutins du sapin', { inspiration: 'saison:noel', pour_le: '2030-01-01' }),
      proposition('Rennes pressés', { inspiration: 'saison:noel' }),
      proposition('Petit astronome', { inspiration: 'Tendance:eclipse-de-lune' }),
      proposition('Fête inventée', { inspiration: 'saison:fete-des-licornes' }),
      proposition('Encore des citrouilles', { inspiration: 'saison:halloween' }),
      proposition('Format bizarre', { inspiration: 'noel' }),
    ]));
    const r = lancer('idees.mjs', ['ajouter', 'prop.json', '--tendances', '1'], '2026-11-02');
    assert.equal(r.code, 0, r.sortie);
    const idees = lireJsonBac('idees.json');
    const sapin = idees.find((i) => i.titre === 'Lutins du sapin');
    assert.equal(sapin?.inspiration, 'saison:noel');
    assert.equal(sapin?.pour_le, '2026-12-25', 'date de la fête, jamais celle donnée par l\'agent');
    const astronome = idees.find((i) => i.titre === 'Petit astronome');
    assert.equal(astronome?.inspiration, 'tendance:eclipse-de-lune');
    assert.equal(astronome?.pour_le, '2026-11-12');
    for (const t of ['Rennes pressés', 'Fête inventée', 'Encore des citrouilles', 'Format bizarre']) {
      assert.ok(!idees.some((i) => i.titre === t), `${t} aurait dû être refusée`);
    }
    assert.match(r.sortie, /Rennes pressés — saison:noel déjà prévue/);
    assert.match(r.sortie, /Encore des citrouilles — un jeu de cette fête est déjà publié cette année \(citrouilles\)/);
  });

  test('verifier : idées avec "inspiration" et "pour_le" valides', () => {
    const r = lancer('idees.mjs', ['verifier'], '2026-11-02');
    assert.equal(r.code, 0, r.sortie);
  });

  test('manque-tendances : la tendance fraîche et la fête qui ouvre bientôt comptent', () => {
    assert.equal(lancer('idees.mjs', ['manque-tendances', '1'], '2026-11-02').sortie.trim(), '1');
    // Le 1er octobre, la fenêtre de Noël (13 novembre) ouvre dans plus de 3 semaines : seule la tendance compte.
    assert.equal(lancer('idees.mjs', ['manque-tendances', '1'], '2026-10-01').sortie.trim(), '2');
  });

  const sauvegarde = readFileSync(path.join(BAC, 'idees.json'), 'utf8');
  const choisir = (jour, args) => {
    writeFileSync(path.join(BAC, 'idees.json'), sauvegarde);
    const r = lancer('idees.mjs', ['choisir', '5', ...args], jour);
    assert.equal(r.code, 0, r.sortie);
    return JSON.parse(r.sortie.trim().split('\n').at(-1));
  };

  test('choisir le 2 novembre : tendance fraîche prise d\'abord, Noël trop tôt jamais choisi', () => {
    const choix = choisir('2026-11-02', ['--tendances', '1']);
    assert.equal(choix.length, 5);
    assert.equal(choix[0].titre, 'Petit astronome');
    assert.equal(choix[0].inspiration, 'tendance:eclipse-de-lune');
    assert.equal(choix[0].saison, '');
    assert.ok(!choix.some((c) => c.titre === 'Lutins du sapin'));
  });

  test('choisir le 20 novembre : Noël dans sa fenêtre (avec son rappel), tendance périmée devenue ordinaire', () => {
    const choix = choisir('2026-11-20', ['--tendances', '1']);
    assert.equal(choix[0].titre, 'Lutins du sapin');
    assert.equal(choix[0].saison, 'Noël (25 décembre)');
    assert.equal(choix[0].inspiration, 'saison:noel');
    // Tendance du 2 novembre : plus fraîche, elle reprend sa place de fin de fichier (ajoutée après les 6 idées).
    assert.ok(!choix.some((c) => c.titre === 'Petit astronome'));
  });

  test('choisir sans --tendances : les idées inspirées actives attendent', () => {
    assert.ok(!choisir('2026-11-20', []).some((c) => c.titre === 'Lutins du sapin'));
    assert.ok(!choisir('2026-11-02', []).some((c) => c.titre === 'Petit astronome'));
  });

  test('choisir : quota respecté, les autres idées complètent', () => {
    // Deux tendances fraîches : une seule passe avec --tendances 1.
    const idees = JSON.parse(sauvegarde);
    idees.push(idee('tendance-2', { titre: 'Pluie d\'étoiles', inspiration: 'tendance:etoiles-filantes', pour_le: '2026-11-25' }));
    writeFileSync(path.join(BAC, 'idees.json'), `${JSON.stringify(idees, null, 2)}\n`);
    const r = lancer('idees.mjs', ['choisir', '5', '--tendances', '1'], '2026-11-02');
    const choix = JSON.parse(r.sortie.trim().split('\n').at(-1));
    assert.equal(choix.filter((c) => c.inspiration.startsWith('tendance:')).length, 1, r.sortie);
    assert.equal(choix.length, 5);
  });

  test('reconcilier : fête passée sans jeu → reportée à l\'année suivante', () => {
    writeFileSync(path.join(BAC, 'idees.json'), sauvegarde);
    const r = lancer('idees.mjs', ['reconcilier'], '2026-12-20');
    assert.equal(r.code, 0, r.sortie);
    assert.match(r.sortie, /Fête passée, reportée au 2027-12-25 : Lutins du sapin/);
    assert.equal(lireJsonBac('idees.json').find((i) => i.titre === 'Lutins du sapin').pour_le, '2027-12-25');
  });

  test('controler-idees : seules les fêtes à venir non prévues et les recherches préparées restent', () => {
    ecrireJson('.inspirations/inspirations.json', {
      saisons: [
        { inspiration: 'saison:noel', deja_prevue: false, deja_publiee: null },
        { inspiration: 'saison:hiver', deja_prevue: true, deja_publiee: null },
      ],
      tendances: [{ inspiration: 'tendance:eclipse-de-lune' }],
    });
    ecrireJson('nouvelles.json', [
      proposition('Sapin', { inspiration: 'saison:noel' }),
      proposition('Sapin bis', { inspiration: 'saison:noel' }),
      proposition('Bonhomme', { inspiration: 'saison:hiver' }),
      proposition('Œufs', { inspiration: 'saison:paques' }),
      proposition('Lune', { inspiration: 'TENDANCE:eclipse-de-lune' }),
      proposition('Inventée', { inspiration: 'tendance:film-a-la-mode' }),
      proposition('Ordinaire'),
    ]);
    const r = lancer('inspirations.mjs', ['controler-idees', 'nouvelles.json'], '2026-11-02');
    assert.equal(r.code, 0, r.sortie);
    const gardees = lireJsonBac('nouvelles.json');
    assert.deepEqual(gardees.map((p) => [p.titre, p.inspiration ?? '']), [
      ['Sapin', 'saison:noel'], ['Lune', 'tendance:eclipse-de-lune'], ['Inventée', ''], ['Ordinaire', ''],
    ]);
  });

  test('preparer : fêtes à venir (déjà prévues signalées) et recherches classées, sans celles déjà prises', () => {
    writeFileSync(path.join(BAC, 'idees.json'), sauvegarde);
    ecrireJson('.inspirations/historique.json', fusionner(null, [{ pays: 'FR', recherches: lireFlux(FLUX) }], '2026-11-01'));
    const r = lancer('inspirations.mjs', ['preparer'], '2026-11-02');
    assert.equal(r.code, 0, r.sortie);
    const p = lireJsonBac('.inspirations/inspirations.json');
    const noel = p.saisons.find((s) => s.inspiration === 'saison:noel');
    assert.equal(noel?.deja_prevue, true);
    assert.equal(noel?.fenetre, 'ouvre le 2026-11-13, jusqu\'au 2026-12-18');
    assert.ok(!p.saisons.some((s) => s.inspiration === 'saison:paques'), 'Pâques est trop loin');
    assert.deepEqual(p.tendances.map((t) => t.inspiration), ['tendance:premieres-neiges'], 'éclipse déjà prise, hommage écarté');
  });
} finally {
  rmSync(BAC, { recursive: true, force: true });
}

console.log(`\n${reussis} test(s) réussi(s), ${echecs} échec(s).`);
process.exitCode = echecs ? 1 : 0;
