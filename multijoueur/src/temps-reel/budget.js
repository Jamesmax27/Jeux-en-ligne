// ==========================================================================
// Budget : Durable Object unique (nom « budget ») qui compte, par jour UTC, ce
// que coûtent les parties temps réel relayées (docs/cadrage-temps-reel.md,
// section 9). Une partie relayée garde son Durable Object éveillé toute sa
// durée (minuterie des ticks) : c'est la durée facturée (128 Mo par objet).
//
// Ce n'est PAS la consommation lue chez Cloudflare (le Worker n'y a pas accès) :
// c'est notre propre comptage, prudent. Chaque Duel réserve, au début du
// relais, la durée maximale d'une partie et rend ce qu'il n'a pas utilisé à la
// fin. Au-delà de SEUIL × BUDGET_RELAIS_GOS (variable de wrangler.toml), plus
// de nouvelle partie relayée ; les parties en cours ne sont jamais coupées, et
// le pair-à-pair reste permis.
//
//   POST /reserver { gos } → { ok }        place pour une partie relayée
//   POST /rendre   { gos, reel }           fin d'une partie relayée (réservé, consommé)
//   POST /noter    { type }                p2p | relais | secours | echec | refus
//   POST /etat     → compteurs du jour
// Une ligne écrite par appel (sauf /etat).
// ==========================================================================

export const SEUIL = 0.8;
export const GO_PAR_OBJET = 0.125;            // 128 Mo facturés par Durable Object éveillé
const BUDGET_DEFAUT = 6000;                   // Go-s par jour pour le relais (sur 13 000 du plan gratuit)
const TYPES = ['p2p', 'relais', 'secours', 'echec', 'refus'];

export async function appelerBudget(env, action, corps = {}) {
  try {
    const budget = env.BUDGET.get(env.BUDGET.idFromName('budget'));
    const reponse = await budget.fetch(`https://budget/${action}`, { method: 'POST', body: JSON.stringify(corps) });
    return reponse.ok ? await reponse.json() : null;
  } catch {
    return null;
  }
}

const json = (x) => new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json' } });
const jourUTC = (t) => new Date(t).toISOString().slice(0, 10);

function nouveauJour(jour) {
  const d = { jour, reserve: 0, consomme: 0, parties: 0 };
  for (const t of TYPES) d[t] = 0;
  return d;
}

export class Budget {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  limite() {
    const b = Number(this.env.BUDGET_RELAIS_GOS);
    return (Number.isFinite(b) && b >= 0 ? b : BUDGET_DEFAUT) * SEUIL;
  }

  async fetch(request) {
    const action = new URL(request.url).pathname.slice(1);
    let corps = {};
    try { corps = (await request.json()) || {}; } catch { /* corps vide */ }
    const aujourdhui = jourUTC(Date.now());
    let d = await this.state.storage.get('jour');
    if (!d || d.jour !== aujourdhui) d = nouveauJour(aujourdhui);
    const gos = Number.isFinite(corps.gos) && corps.gos > 0 ? corps.gos : 0;
    let reponse = {};
    if (action === 'etat') {
      return json({ ...d, limite: this.limite(), seuil: SEUIL });
    } else if (action === 'reserver') {
      if (d.consomme + d.reserve + gos > this.limite()) { d.refus += 1; reponse = { ok: false }; }
      else { d.reserve += gos; d.parties += 1; reponse = { ok: true }; }
    } else if (action === 'rendre') {
      d.reserve = Math.max(0, d.reserve - gos);
      d.consomme += Number.isFinite(corps.reel) && corps.reel > 0 ? corps.reel : 0;
    } else if (action === 'noter') {
      if (TYPES.includes(corps.type)) d[corps.type] += 1;
    } else {
      return new Response('Introuvable', { status: 404 });
    }
    await this.state.storage.put('jour', d);
    return json(reponse);
  }
}
