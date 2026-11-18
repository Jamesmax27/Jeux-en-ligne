#!/usr/bin/env node
// ==========================================================================
// tester-idees.mjs — jury des idées et quotas de la boucle de nuit
// (scripts/idees.mjs), sur une copie du dépôt, sans réseau ni navigateur.
//   node scripts/tester-idees.mjs
// ==========================================================================

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BAC = mkdtempSync(path.join(os.tmpdir(), 'fmg-idees-'));
for (const f of ['scripts/idees.mjs', 'scripts/inspirations.mjs', 'scripts/controle-taxonomie.mjs', 'public/taxonomie.js', 'public/chemins.js', 'calendrier-saisons.json']) {
  mkdirSync(path.dirname(path.join(BAC, f)), { recursive: true });
  copyFileSync(path.join(RACINE, f), path.join(BAC, f));
}
mkdirSync(path.join(BAC, 'games'), { recursive: true });

const ecrire = (f, v) => writeFileSync(path.join(BAC, f), `${JSON.stringify(v, null, 2)}\n`);
const lire = (f) => JSON.parse(readFileSync(path.join(BAC, f), 'utf8'));
function lancer(args, jury = true) {
  const env = { ...process.env, BOUCLE_AUJOURDHUI: '2026-11-18' };
  if (jury) env.JURY_IDEES = '1'; else delete env.JURY_IDEES;
  return execFileSync(process.execPath, [path.join(BAC, 'scripts/idees.mjs'), ...args], { cwd: BAC, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
const DESCRIPTION = 'Un geste simple, des mécaniques qui se combinent au fil de vingt niveaux, des étoiles et des objets à débloquer.';
const idee = (id, plus = {}) => ({
  id, titre: `Idée ${id}`, description: DESCRIPTION, genre: 'arcade', univers: ['nature'], ages: '6+',
  source: 'agent', date_ajout: '2026-11-01', statut: 'en_attente', jeu_id: null, ...plus,
});
const criteres = (n, plus = {}) => ({ accroche: n, clarte: n, relance: n, profondeur: n, originalite: n, faisabilite: n, ...plus });
const ids = (sortie) => JSON.parse(sortie).map((x) => x.id);

let echecs = 0, reussis = 0;
function test(nom, f) {
  ecrire('idees-archive.json', []);
  ecrire('idees.json', []);
  try { f(); reussis++; console.log(`  ok  ${nom}`); }
  catch (e) { echecs++; console.log(`  ÉCHEC  ${nom}\n        ${e.message}`); }
}

console.log('Jury des idées et quotas');
try {
  test('quota : k jeux sur 5, répartis sur les passages', () => {
    const suite = (n, k, total = 10) => Array.from({ length: total }, (_, i) => Number(lancer(['quota', n, k, i + 1]).trim()));
    assert.deepEqual(suite(2, 1), [0, 0, 1, 0, 1, 0, 0, 1, 0, 1]);
    assert.deepEqual(suite(5, 2, 3), [2, 2, 2]);
    assert.deepEqual(suite(2, 5, 3), [2, 2, 2]);
    assert.deepEqual(suite(2, 0, 3), [0, 0, 0]);
  });

  test('manque : seules les idées retenues comptent, 6 visées', () => {
    ecrire('idees.json', [idee('a', { note: 8 }), idee('b', { note: 7 }), idee('c')]);
    assert.equal(lancer(['manque']).trim(), '5');
    assert.equal(lancer(['manque'], false).trim(), '12');
  });

  test('noter : calcule la note, retient, trie, recale sur un critère essentiel', () => {
    ecrire('idees.json', [idee('file-bonne'), idee('file-faible')]);
    ecrire('prop.json', ['Moyenne', 'Excellente', 'Sans relance', 'Tricheuse'].map((titre) => ({ titre, description: DESCRIPTION, genre: 'puzzle', univers: ['nature'], ages: '6+', note: 10 })));
    ecrire('notes.json', [
      { ref: 'nouvelle-1', ...criteres(8) }, { ref: 'nouvelle-2', ...criteres(9), avis: 'Très fort.' },
      { ref: 'nouvelle-3', ...criteres(9, { relance: 5 }) }, { ref: 'nouvelle-4', ...criteres(5) },
      { ref: 'file-bonne', ...criteres(8) }, { ref: 'file-faible', ...criteres(4) }, { ref: 'inconnue', ...criteres(9) },
    ]);
    lancer(['noter', 'prop.json', 'notes.json', 'retenues.json', 'file.json']);
    const retenues = lire('retenues.json');
    assert.deepEqual(retenues.map((x) => [x.titre, x.note]), [['Excellente', 9], ['Moyenne', 8]]);
    assert.deepEqual(lire('file.json').map((x) => [x.id, x.note]), [['file-bonne', 8], ['file-faible', 4]]);
  });

  test('ajouter : avec le jury, une idée sans note est refusée', () => {
    ecrire('prop.json', [
      { titre: 'Sans note', description: DESCRIPTION, genre: 'puzzle', univers: ['nature'], ages: '6+' },
      { titre: 'Notée', accroche: 'Une accroche.', premieres_secondes: 'On touche.', relance: 'Le record.', description: DESCRIPTION, genre: 'puzzle', univers: ['nature'], ages: '6+', note: 8.2, avis: 'Bien.' },
    ]);
    lancer(['ajouter', 'prop.json']);
    const file = lire('idees.json');
    assert.deepEqual(file.map((x) => x.titre), ['Notée']);
    assert.equal(file[0].note, 8.2);
    assert.equal(file[0].accroche, 'Une accroche.');
  });

  test('choisir : propriétaire d\'abord, puis meilleures notes, jamais une idée recalée ou sans note', () => {
    ecrire('idees.json', [
      idee('sans-note'), idee('recalee', { note: 7.4 }), idee('bonne', { note: 7.8 }), idee('meilleure', { note: 9, accroche: 'Accroche.' }),
      idee('humaine', { source: 'humain' }),
    ]);
    const choix = JSON.parse(lancer(['choisir', '2']));
    assert.deepEqual(choix.map((x) => x.id), ['meilleure', 'humaine'].sort((a, b) => (a === 'humaine' ? -1 : b === 'humaine' ? 1 : 0)));
    assert.equal(choix.find((x) => x.id === 'meilleure').accroche, 'Accroche.');
  });

  test('choisir : aucun jeu si rien n\'atteint le seuil', () => {
    ecrire('idees.json', [idee('a', { note: 6 }), idee('b')]);
    assert.deepEqual(ids(lancer(['choisir', '2'])), []);
  });

  test('appliquer-notes : range les notes sans écraser une note existante', () => {
    ecrire('idees.json', [idee('a'), idee('b', { note: 5 }), idee('h', { source: 'humain' })]);
    ecrire('file.json', [{ id: 'a', note: 8, avis: 'Bien.' }, { id: 'b', note: 9 }, { id: 'h', note: 9 }]);
    lancer(['appliquer-notes', 'file.json']);
    const f = Object.fromEntries(lire('idees.json').map((x) => [x.id, x]));
    assert.equal(f.a.note, 8);
    assert.equal(f.b.note, 5);
    assert.equal(f.h.note, undefined);
  });

  test('preparer-jury : nouvelles idées et idées de la file sans note', () => {
    ecrire('idees.json', [idee('a'), idee('b', { note: 8 }), idee('h', { source: 'humain' })]);
    ecrire('prop.json', [{ titre: 'Nouvelle', description: DESCRIPTION }]);
    lancer(['preparer-jury', 'prop.json', '.jury/candidats.json']);
    assert.deepEqual(lire('.jury/candidats.json').candidats.map((c) => c.ref), ['nouvelle-1', 'a']);
  });

  test('sans le jury : fonctionnement inchangé', () => {
    ecrire('idees.json', [idee('a'), idee('b')]);
    assert.deepEqual(ids(lancer(['choisir', '1'], false)), ['a']);
  });
} finally {
  rmSync(BAC, { recursive: true, force: true });
}

console.log(`${reussis} réussi(s), ${echecs} échec(s).`);
process.exit(echecs ? 1 : 0);
