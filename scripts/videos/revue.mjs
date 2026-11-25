// ==========================================================================
// revue.mjs — page HTML locale de revue (marketing/sorties/revue.html)
//
// Toutes les vidéos produites côte à côte, avec pour chacune sa durée, sa
// recette, son déroulé plan par plan et le résultat des contrôles. Sert au
// propriétaire à choisir les accroches qu'il garde : il modifie ensuite
// marketing/videos/selection.json à la main.
// ==========================================================================

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FORMAT, SORTIES, SOURCES, lireJson, listerRecettes, relatif } from './commun.mjs';

const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const secondes = (imagesOuS, enImages = true) => `${(enImages ? imagesOuS / FORMAT.ips : imagesOuS).toFixed(1).replace('.', ',')} s`;

async function fiches(type) {
  const dossier = path.join(SORTIES, type === 'accroche' ? 'accroches' : 'presentations');
  const liste = [];
  for (const id of await listerRecettes(dossier)) {
    if (!existsSync(path.join(dossier, `${id}.mp4`))) continue;
    liste.push({ ...(await lireJson(path.join(dossier, `${id}.json`))), fichier: `${type === 'accroche' ? 'accroches' : 'presentations'}/${id}.mp4` });
  }
  return liste;
}

function deroule(fiche) {
  const lignes = fiche.plans.map((p) => {
    const quoi = p.type === 'jeu' ? `jeu : ${p.jeu}` : p.type === 'mur' ? 'mur de jaquettes' : p.type === 'attente' ? 'fausse fenêtre de téléchargement' : p.type === 'fin' ? 'écran de fin' : p.type;
    const textes = (p.textes || []).map((t) => `« ${t.texte.replace(/\*/g, '').replace(/\n/g, ' ')} »`).join(' ');
    return `<tr><td>${secondes(p.debut)} → ${secondes(p.fin)}</td><td>${echapper(quoi)}</td><td>${echapper(textes)}</td></tr>`;
  });
  return `<table><thead><tr><th>Quand</th><th>Plan</th><th>Textes</th></tr></thead><tbody>${lignes.join('')}</tbody></table>`;
}

function carte(fiche, retenues) {
  const estAccroche = fiche.type === 'accroche';
  const retenue = estAccroche && retenues.includes(fiche.nom);
  const controles = fiche.controles.map((c) => `<li class="${c.ok ? 'bon' : 'mauvais'}"><b>${c.ok ? '✓' : '✗'} ${echapper(c.nom)}</b> ${echapper(c.detail)}</li>`).join('');
  const entete = estAccroche
    ? `<p class="angle"><b>Angle :</b> ${echapper(fiche.source.angle || '')}</p><p class="pourquoi">${echapper(fiche.source.pourquoi || '')}</p>`
    : `<p class="angle"><b>Accroche :</b> ${echapper(fiche.recette.accroche)} · <b>rythme :</b> ${echapper(fiche.recette.rythme)} · <b>textes :</b> ${echapper(fiche.recette.textes)}</p><p class="pourquoi"><b>Jeux montrés :</b> ${echapper(fiche.jeuxMontres.join(', '))}</p>`;
  const ecartes = fiche.ecartes?.length ? `<p class="ecartes"><b>Jeux écartés :</b> ${fiche.ecartes.map((e) => `${echapper(e.jeu)} (${echapper(e.raison)})`).join(' ; ')}</p>` : '';
  return `
  <article class="carte ${estAccroche ? 'accroche' : 'presentation'}">
    <header>
      <span class="genre">${estAccroche ? 'Accroche' : 'Présentation'}</span>
      <h2>${echapper(fiche.nom)}</h2>
      <span class="duree">${secondes(fiche.sonde.duree, false)}</span>
      ${estAccroche ? `<span class="etat ${retenue ? 'oui' : 'non'}">${retenue ? 'retenue' : 'non retenue'}</span>` : ''}
    </header>
    <video src="${echapper(fiche.fichier)}" controls loop muted playsinline preload="metadata" width="${FORMAT.largeur}" height="${FORMAT.hauteur}"></video>
    ${entete}
    ${ecartes}
    <p class="verdict ${fiche.ok ? 'bon' : 'mauvais'}">${fiche.ok ? '✓ Tous les contrôles sont bons' : '✗ Un contrôle a échoué'}</p>
    <details><summary>Contrôles</summary><ul class="controles">${controles}</ul></details>
    <details open><summary>Recette</summary><pre>${echapper(JSON.stringify(estAccroche ? fiche.source : fiche.recette, null, 2))}</pre></details>
    <details><summary>Déroulé</summary>${deroule(fiche)}</details>
  </article>`;
}

export async function ecrireRevue() {
  const [accroches, presentations] = [await fiches('accroche'), await fiches('presentation')];
  const selection = existsSync(path.join(SOURCES, 'selection.json')) ? (await lireJson(path.join(SOURCES, 'selection.json'))).accroches || [] : [];
  // Accroches dans l'ordre de la sélection, les autres ensuite.
  const rang = (f) => (selection.includes(f.nom) ? selection.indexOf(f.nom) : selection.length);
  accroches.sort((a, b) => rang(a) - rang(b));
  const toutes = [...accroches, ...presentations];
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Revue des vidéos — Free Micro Games</title>
<style>
  @font-face { font-family: "Fredoka"; font-weight: 300 600; src: url("../../public/assets/polices/fredoka.woff2") format("woff2"); }
  @font-face { font-family: "Nunito"; font-weight: 200 1000; src: url("../../public/assets/polices/nunito.woff2") format("woff2"); }
  :root { --nuit: #0e0c24; --profonde: #08071a; --surface: #1a1638; --trait: #2c2753; --craie: #f2effa; --douce: #b3add0; --lavande: #c4b5fd; --or: #ffd88a; --vert: #3ccf7a; --rouge: #ff8f8f; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px 20px 60px; background: radial-gradient(900px 600px at 85% -10%, #2a2266 0, transparent 60%), linear-gradient(var(--nuit), var(--profonde)) fixed; color: var(--craie); font: 16px/1.5 "Nunito", system-ui, sans-serif; min-height: 100vh; }
  h1, h2 { font-family: "Fredoka", "Nunito", system-ui, sans-serif; font-weight: 600; margin: 0; }
  h1 { font-size: 30px; }
  .chapeau { max-width: 1100px; margin: 0 0 22px; color: var(--douce); }
  .chapeau code, pre { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
  .chapeau code { color: var(--lavande); background: var(--surface); padding: 1px 6px; border-radius: 6px; }
  .commandes { display: flex; gap: 10px; flex-wrap: wrap; margin: 14px 0 26px; }
  button { font: 800 15px "Nunito", system-ui, sans-serif; color: var(--nuit); background: var(--lavande); border: 0; border-radius: 999px; padding: 11px 20px; min-height: 44px; cursor: pointer; }
  button.second { background: var(--surface); color: var(--craie); border: 1.5px solid #6a62a3; }
  .rangee { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 18px; align-items: start; }
  @media (min-width: 1700px) { .rangee { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
  .carte { background: rgba(25, 21, 54, .82); border: 1px solid rgba(242, 239, 250, .11); border-radius: 20px; padding: 14px; min-width: 0; }
  .carte header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; margin-bottom: 10px; }
  .carte h2 { font-size: 20px; overflow-wrap: anywhere; flex: 1 1 100%; }
  .genre { font-weight: 800; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--lavande); }
  .presentation .genre { color: var(--or); }
  .duree { font-weight: 800; color: var(--or); }
  .etat { font-weight: 800; font-size: 13px; padding: 2px 10px; border-radius: 999px; }
  .etat.oui { background: rgba(60, 207, 122, .16); color: var(--vert); }
  .etat.non { background: rgba(179, 173, 208, .14); color: var(--douce); }
  video { display: block; width: 100%; height: auto; aspect-ratio: 9 / 16; background: #000; border-radius: 14px; }
  p { margin: 10px 0 0; font-size: 14px; }
  .pourquoi, .ecartes { color: var(--douce); }
  .verdict { font-weight: 800; }
  .bon { color: var(--vert); } .mauvais { color: var(--rouge); }
  details { margin-top: 10px; border-top: 1px solid var(--trait); padding-top: 8px; }
  summary { cursor: pointer; font-weight: 800; min-height: 32px; }
  pre { margin: 8px 0 0; padding: 10px; background: var(--profonde); border-radius: 10px; font-size: 12px; line-height: 1.45; max-height: 340px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  .controles { list-style: none; margin: 8px 0 0; padding: 0; font-size: 13px; }
  .controles li { margin-bottom: 6px; color: var(--douce); } .controles b { display: block; }
  .controles .bon b { color: var(--vert); } .controles .mauvais b { color: var(--rouge); }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  th, td { text-align: left; vertical-align: top; padding: 4px 6px 4px 0; border-bottom: 1px solid var(--trait); }
  th { color: var(--douce); font-weight: 800; }
  td:first-child { white-space: nowrap; color: var(--or); }
</style>
</head>
<body>
<h1>Revue des vidéos</h1>
<p class="chapeau">${accroches.length} accroche${accroches.length > 1 ? 's' : ''} et ${presentations.length} vidéo${presentations.length > 1 ? 's' : ''} de présentation, au format ${FORMAT.largeur} × ${FORMAT.hauteur}, ${FORMAT.ips} images par seconde. Les vidéos démarrent sans le son : elles doivent se comprendre ainsi.
Pour garder ou écarter une accroche, modifie la liste de <code>marketing/videos/selection.json</code> ; les prochaines vidéos de présentation ne peuvent commencer que par une accroche de cette liste.</p>
<div class="commandes">
  <button type="button" id="lire">Tout lire</button>
  <button type="button" id="arreter" class="second">Tout arrêter</button>
  <button type="button" id="son" class="second">Activer le son</button>
</div>
<div class="rangee">
${toutes.map((f) => carte(f, selection)).join('\n')}
</div>
<script>
  const videos = [...document.querySelectorAll('video')];
  document.getElementById('lire').onclick = () => videos.forEach((v) => { v.currentTime = 0; v.play(); });
  document.getElementById('arreter').onclick = () => videos.forEach((v) => v.pause());
  document.getElementById('son').onclick = (e) => {
    const muet = !videos[0].muted;
    videos.forEach((v) => { v.muted = muet; });
    e.target.textContent = muet ? 'Activer le son' : 'Couper le son';
  };
</script>
</body>
</html>
`;
  const fichier = path.join(SORTIES, 'revue.html');
  await writeFile(fichier, html);
  return { fichier, accroches: accroches.length, presentations: presentations.length, chemin: relatif(fichier) };
}
