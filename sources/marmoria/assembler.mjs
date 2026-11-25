#!/usr/bin/env node
// ==========================================================================
// assembler.mjs — produit games/marmoria/index.html à partir de sources/marmoria/
//
//   node sources/marmoria/assembler.mjs
//
// 1. Recopie dans gabarit.html les données (donnees.json), la simulation
//    (sim.js), les villes d'exemple (exemples.js), les dessins, le rendu, les
//    sons et l'interface, chacun dans son propre bloc <script id="mm-…">.
// 2. Bâtit les trois villes d'exemple embarquées (bloc mm-villes : aperçus de la
//    page du jeu ; la troisième, cité du lot 2 avec son quartier de prestige, sert
//    aussi à l'affiche et au fond de l'écran titre), en jouant la simulation
//    sous Node avec le « joueur raisonnable » de exemples.js : elles sont donc
//    toujours à jour avec les règles.
// 3. Lance scripts/i18n-jeu.mjs --assembler marmoria --sources sources/marmoria/textes :
//    textes des 5 langues, modules communs du site (jel-i18n, jel-sauvegarde,
//    jel-stockage) et textes de la fiche game.json.
// 4. Affiche le poids de index.html (repères du cahier, section 21 : 1 Mo au lot 1, 1,8 Mo au lot 2, 2,6 Mo au lot 3).
// ==========================================================================

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..', '..');
const SORTIE = path.join(RACINE, 'games', 'marmoria', 'index.html');
const lire = (f) => readFile(path.join(ICI, f), 'utf8');

const morceaux = {
  DONNEES: await lire('donnees.json'),
  SIM: await lire('sim.js'),
  EXEMPLES: await lire('exemples.js'),
  DESSINS: await lire('dessins.js'),
  RENDU: await lire('rendu.js'),
  AUDIO: await lire('audio.js'),
  INTERFACE: await lire('interface.js'),
};

// Les données doivent être un JSON valide, accepté par la simulation.
JSON.parse(morceaux.DONNEES);

// --- Villes d'exemple ------------------------------------------------------------
function villes() {
  const ctx = vm.createContext({ btoa, atob, console });
  vm.runInContext(morceaux.SIM, ctx, { filename: 'sim.js' });
  vm.runInContext(morceaux.EXEMPLES, ctx, { filename: 'exemples.js' });
  const sim = ctx.MM_SIM, ex = ctx.MM_EXEMPLES;
  const D = sim.charger(JSON.parse(morceaux.DONNEES));
  const TM = D.temps.ticksParJour * D.temps.joursParMois;
  // [mission, niveau du plan, mois de jeu, trésor affiché, places libres visées par le joueur]
  const plans = [['ostie', 1, 9, 6420, 40], ['pompei', 2, 18, 4180, 60], ['pompei', 4, 30, 9850, 80]];
  return plans.map(([mission, niveau, mois, tresor, places]) => {
    // Cité du lot 2 : construction libre (tous les bâtiments), sans incendie pour rester belle.
    // Les deux premières illustrent les missions tutorielles : sans attractivité, comme elles.
    const e = sim.nouvelle(mission, niveau >= 4 ? { libre: true, tout: true, risques: false } : { libre: true, attractivite: false });
    e.tresor = 1e7;
    const plan = ex.planifier(sim, mission, { niveau });
    ex.jouer(sim, e, plan, { places });
    for (let k = 0; k < mois * TM; k++) {
      sim.pas(e);
      if (e.tick % (TM / 2) === 0) ex.jouer(sim, e, plan, { places });
    }
    e.tresor = tresor;
    e.journal = [];
    const pb = sim.invariants(e);
    if (pb.length) throw new Error(`ville d'exemple ${mission} ${niveau} : ${pb[0]}`);
    console.log(`  ville d'exemple ${niveau} (${mission}) : ${e.pop} habitants, ${e.batiments.length} bâtiments, ${e.marcheurs.length} marcheurs`);
    return JSON.parse(sim.exporter(e));
  });
}
morceaux.VILLES = JSON.stringify(villes());

// --- Assemblage ------------------------------------------------------------------
for (const [nom, contenu] of Object.entries(morceaux)) {
  if (/<\/script/i.test(contenu)) throw new Error(`${nom} contient « </script » : la page serait coupée`);
}
let html = await lire('gabarit.html');
for (const [nom, contenu] of Object.entries(morceaux)) {
  const marque = `/*MM:${nom}*/`;
  if (!html.includes(marque)) throw new Error(`gabarit.html : marque ${marque} absente`);
  const texte = nom === 'DONNEES' || nom === 'VILLES' ? contenu.trim().replace(/</g, '\\u003c') : `\n${contenu.trim()}\n`;
  html = html.split(marque).join(texte); // sans motifs « $ » de String.replace
}
await mkdir(path.dirname(SORTIE), { recursive: true });
await writeFile(SORTIE, html, 'utf8');

const r = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'i18n-jeu.mjs'), '--assembler', 'marmoria', '--sources', path.join('sources', 'marmoria', 'textes')], { cwd: RACINE, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);

const final = await readFile(SORTIE, 'utf8');
const ko = Buffer.byteLength(final, 'utf8') / 1024;
console.log(`✓ games/marmoria/index.html : ${ko.toFixed(0)} Ko (repère du lot 4 : 3,4 Mo)`);
