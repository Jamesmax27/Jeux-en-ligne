#!/usr/bin/env node
// ==========================================================================
// planche.mjs — planche-contact des dessins de Cosmoria (outil de travail)
//
//   node sources/cosmoria/outils/planche.mjs <sortie.png> [--z 3] [--cols 6] [--monde rubra] <dessin>…
//
// Charge sources/cosmoria/dessins/*.js dans une page vide (sans le jeu) et peint
// chaque dessin demandé sur un morceau de sol, puis enregistre l'image. Dessins :
//   terrain[:monde]          un morceau de carte (sol, mer, rivage, arbres, rochers, passerelles)
//   b:<type>[:taille[:json]] un bâtiment (état en JSON, ex. b:fontaine:1:{"actif":1})
//   h:<niveau>[:taille]      une habitation
//   m:<type>                 un marcheur (ses deux poses, dans les deux sens)
//   u:<unité>:<faction>      une unité militaire
//   i:<cause>  g:<bien>      une icône d'arrêt, l'image d'un bien
// Navigateur : celui de Playwright, sinon Edge (CHROMIUM_PATH ou canal msedge).
// ==========================================================================

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(ICI, '..');
const args = process.argv.slice(2);
const sortie = args.shift();
const opt = { z: 3, cols: 6, monde: 'rubra' };
const specs = [];
while (args.length) {
  const a = args.shift();
  if (a === '--z') opt.z = +args.shift();
  else if (a === '--cols') opt.cols = +args.shift();
  else if (a === '--monde') opt.monde = args.shift();
  else specs.push(a);
}
if (!sortie || !specs.length) { console.log('usage : node planche.mjs <sortie.png> [--z 3] [--cols 6] [--monde rubra] <dessin>…'); process.exit(1); }

const fichiers = (await readdir(path.join(SRC, 'dessins'))).filter((f) => f.endsWith('.js')).sort();
let code = '';
for (const f of fichiers) code += `\n// ---- ${f}\n` + await readFile(path.join(SRC, 'dessins', f), 'utf8');
const donnees = JSON.parse(await readFile(path.join(SRC, 'donnees.json'), 'utf8'));
const tailles = {};
for (const [id, b] of Object.entries(donnees.batiments)) tailles[id] = b.taille;

const page = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0d0a16"><script>${code}</script><script>
(function () {
  var A = window.CM_ART, D = window.CM_DESSINS, TAILLES = ${JSON.stringify(tailles)};
  var Z = ${opt.z}, MONDE = ${JSON.stringify(opt.monde)}, COLS = ${opt.cols};
  function poser(ctx, s, x, y) { if (s) ctx.drawImage(s.c, x + s.ox * Z, y + s.oy * Z, s.w * Z, s.h * Z); }
  function tuile(ox, oy, i, j) { return [ox + (i - j) * 32 * Z, oy + (i + j) * 16 * Z]; }
  function solNu(nom, v) { var M = A.monde(nom); return A.sprite('pl:sol:' + nom + v, 1, 0, function (c, P) { A.terrain.sol(c, P, M, nom, v); }, Z); }
  function parterre(ctx, ox, oy, n, nom) {
    for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) { var p = tuile(ox, oy, i, j); poser(ctx, solNu(nom, ((i * 5 + j * 3) % 4) * 4 + ((i * 31 + j * 17) & 3)), p[0], p[1]); }
  }
  function cellule(spec) {
    var m = spec.split(':'), genre = m[0], c = document.createElement('canvas'), ctx, n, ox, oy, p, s;
    var nom = MONDE;
    if (genre === 'terrain') {
      nom = m[1] || MONDE; n = 9; var M = A.monde(nom);
      c.width = n * 64 * Z + 40; c.height = n * 32 * Z + 60 * Z; ctx = c.getContext('2d'); ox = c.width / 2; oy = 50 * Z;
      // 0 sol, 1 fertile, 2 arbres, 3 rochers, 4 mer, 5 passerelle, 6 esplanade, 7 piste de l'astroport
      var G = ['000022200', '011022300', '011000330', '000555550', '777500050', '000566050', '044566050', '444400000', '444440000'];
      var T = function (i, j) { return i < 0 || j < 0 || i >= n || j >= n ? -1 : +G[j][i]; };
      var route = function (i, j) { var t = T(i, j); return t === 5 || t === 6 || t === 7; };
      var i, j, t;
      for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
        p = tuile(ox, oy, i, j); t = T(i, j);
        if (t === 4) {
          poser(ctx, A.sprite('pl:eau' + nom + ((i + j) & 3), 1, 0, function (cc, P) { A.terrain.eau(cc, P, M, (i + j) & 3); }, Z), p[0], p[1]);
          var mr = (T(i, j - 1) !== 4 && j > 0 ? 1 : 0) | (T(i + 1, j) !== 4 && i < n - 1 ? 2 : 0) | (T(i, j + 1) !== 4 && j < n - 1 ? 4 : 0) | (T(i - 1, j) !== 4 && i > 0 ? 8 : 0);
          if (mr) poser(ctx, A.sprite('pl:riv' + nom + mr, 1, 0, function (cc, P) { A.terrain.rivage(cc, P, M, mr, 0); }, Z), p[0], p[1]);
        } else if (t === 1) poser(ctx, A.sprite('pl:fer' + nom + ((i + j) % 3), 1, 0, function (cc, P) { A.terrain.fertile(cc, P, M, (i + j) % 3); }, Z), p[0], p[1]);
        else poser(ctx, solNu(nom, ((i * 5 + j * 3) % 4) * 4 + ((i * 31 + j * 17) & 3)), p[0], p[1]);
        if (route(i, j)) {
          var mk = (route(i, j - 1) ? 1 : 0) | (route(i + 1, j) ? 2 : 0) | (route(i, j + 1) ? 4 : 0) | (route(i - 1, j) ? 8 : 0);
          poser(ctx, A.sprite('pl:rt' + t + mk, 1, 0, function (cc, P) { if (t === 6) A.terrain.place(cc, P, mk); else A.terrain.route(cc, P, mk, t === 7); }, Z), p[0], p[1]);
        }
      }
      for (var d = 0; d <= 2 * (n - 1); d++) for (i = Math.max(0, d - n + 1); i <= Math.min(n - 1, d); i++) {
        j = d - i; p = tuile(ox, oy, i, j); t = T(i, j);
        if (t === 2) poser(ctx, A.sprite('pl:ar' + nom + ((i * 7 + j * 3) % 3), 1, 40, function (cc, P) { A.terrain.arbre(cc, P, M, nom, (i * 7 + j * 3) % 3); }, Z), p[0], p[1]);
        if (t === 3) poser(ctx, A.sprite('pl:ro' + nom + ((i + j) % 3), 1, 26, function (cc, P) { A.terrain.rocher(cc, P, M, nom, (i + j) % 3); }, Z), p[0], p[1]);
      }
      return c;
    }
    if (genre === 'b' || genre === 'h') {
      var type = m[1], t2, haut, etat = {}, peindre;
      if (genre === 'b') {
        t2 = +(m[2] || TAILLES[type] || 1); haut = A.HAUT[type] || 40;
        try { etat = m[3] ? JSON.parse(m.slice(3).join(':')) : {}; } catch (e) { etat = {}; }
        var dft = { actif: 1, plein: 1, frame: 0, eau: 1, prog: 0.75, niveau: 3, matiere: 2, bateau: 1, masque: 0, monde: nom, emplacements: [['ble', 4], ['vin', 2], null, ['bois', 3], ['fer', 4], null, ['marbre', 1], ['poterie', 3]] };
        for (var k in dft) if (etat[k] === undefined) etat[k] = dft[k];
        peindre = A.PEINTRES[type] ? function (cc, P, tt) { A.PEINTRES[type](cc, P, tt, etat); } : null;
      } else {
        var niv = +m[1]; t2 = +(m[2] || 1); haut = A.maison ? A.maison.haut(niv, t2) : 40;
        peindre = A.maison ? function (cc, P, tt) { A.maison.peindre(cc, P, niv, 0, tt); } : null;
      }
      n = t2 + 2;
      c.width = n * 64 * Z + 20; c.height = n * 32 * Z + (haut + 26) * Z; ctx = c.getContext('2d'); ox = c.width / 2; oy = (haut + 14) * Z;
      parterre(ctx, ox, oy, n, nom);
      p = tuile(ox, oy, 1, 1);
      if (peindre) poser(ctx, A.sprite('pl:' + spec, t2, haut, peindre, Z), p[0], p[1]);
      else { ctx.fillStyle = '#f55'; ctx.fillRect(p[0] - 6, p[1], 12, 12); }
      return c;
    }
    if (genre === 'm' || genre === 'u') {
      c.width = 4 * 46 * Z + 20; c.height = 64 * Z; ctx = c.getContext('2d');
      ctx.fillStyle = A.monde(nom).sol[0]; ctx.fillRect(0, 0, c.width, c.height);
      for (var q = 0; q < 4; q++) {
        s = genre === 'm' ? (A.personnages ? A.personnages.marcheur(m[1], q & 1, q > 1, Z) : null) : (A.personnages ? A.personnages.unite(m[1], m[2] || 'rome', q & 1, q > 1, q === 3, Z) : null);
        poser(ctx, s, (26 + q * 46) * Z, 54 * Z);
      }
      return c;
    }
    if (genre === 'i') { s = A.interface ? A.interface.icone(m[1], Z) : null; c.width = 40 * Z; c.height = 40 * Z; ctx = c.getContext('2d'); ctx.fillStyle = A.monde(nom).sol[0]; ctx.fillRect(0, 0, c.width, c.height); poser(ctx, s, 20 * Z, 32 * Z); return c; }
    if (genre === 'g') { var g = A.interface ? A.interface.imageBien(m[1], 24 * Z) : null; c.width = 30 * Z; c.height = 30 * Z; ctx = c.getContext('2d'); ctx.fillStyle = '#16233a'; ctx.fillRect(0, 0, c.width, c.height); if (g) ctx.drawImage(g, 3 * Z, 3 * Z, 24 * Z, 24 * Z); return c; }
    c.width = c.height = 20; return c;
  }
  var specs = ${JSON.stringify(specs)}, cells = specs.map(function (s) { try { return cellule(s); } catch (e) { console.log('ERREUR ' + s + ' : ' + e.message); var c = document.createElement('canvas'); c.width = c.height = 60; return c; } });
  var rangs = [], x = 0, y = 0, W = 0, hl = 0, ligne = [];
  cells.forEach(function (c, k) { if (k % COLS === 0 && k) { rangs.push([ligne, hl]); y += hl + 8; W = Math.max(W, x); x = 0; hl = 0; ligne = []; } ligne.push([c, x]); x += c.width + 8; hl = Math.max(hl, c.height); });
  rangs.push([ligne, hl]); W = Math.max(W, x); y += hl;
  var out = document.createElement('canvas'); out.width = W; out.height = y; out.id = 'planche';
  var o = out.getContext('2d'); o.fillStyle = '#0d0a16'; o.fillRect(0, 0, W, y);
  var yy = 0; rangs.forEach(function (r) { r[0].forEach(function (cx) { o.drawImage(cx[0], cx[1], yy + (r[1] - cx[0].height)); }); yy += r[1] + 8; });
  document.body.appendChild(out);
})();
</script>`;

const lancer = async () => {
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try { return await chromium.launch(); } catch { return chromium.launch({ channel: 'msedge' }); }
};
const nav = await lancer();
const p = await nav.newPage({ deviceScaleFactor: 1 });
p.on('console', (m) => console.log('[page]', m.text()));
p.on('pageerror', (e) => console.log('[erreur]', e.message));
await p.setContent(page);
const el = await p.$('#planche');
if (!el) { console.log('planche absente (erreur de script ?)'); await nav.close(); process.exit(1); }
const boite = await el.boundingBox();
await p.setViewportSize({ width: Math.min(4000, Math.ceil(boite.width)), height: Math.min(4000, Math.ceil(boite.height)) });
await writeFile(sortie, await el.screenshot());
await nav.close();
console.log(`✓ ${sortie} (${Math.round(boite.width)} × ${Math.round(boite.height)})`);
