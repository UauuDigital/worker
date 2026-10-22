// Part superior: la frase d'estat, els tres números i (plegat) l'estat tècnic.
import { el, svg, $ } from './dom.js';
import { formataHoraCurta, formataDataHora, fa, durada } from './format.js';

const NIVELLS = {
  verd: { titol: 'Tot va bé', classe: 'estat--verd', forma: 'M20 32l8 8 16-18' },
  taronja: { titol: 'Atenció', classe: 'estat--taronja', forma: 'M32 22v14M32 43v2' },
  vermell: { titol: 'Hi ha un problema', classe: 'estat--vermell', forma: 'M23 23l18 18M41 23L23 41' },
};
const ETIQUETA_RESULTAT = { enviat: 'Correu enviat', cancelat: 'Correu cancel·lat', reintent: 'Reintent programat', fallit: 'Correu fallit' };
let nivellAnterior = null;

// El nivell es veu per color, per la forma de la icona (cercle, triangle, octàgon) i pel text.
function icona(nivell) {
  const tr = { fill: 'none', stroke: 'currentColor', 'stroke-linejoin': 'round' };
  const contorn = nivell === 'verd' ? svg('circle', { cx: 32, cy: 32, r: 28, ...tr, 'stroke-width': 4 })
    : nivell === 'taronja' ? svg('path', { d: 'M32 6L60 56H4Z', ...tr, 'stroke-width': 4 })
      : svg('path', { d: 'M21 4h22l17 17v22L43 60H21L4 43V21Z', ...tr, 'stroke-width': 4 });
  const marca = svg('path', { d: NIVELLS[nivell].forma, ...tr, 'stroke-width': 5, 'stroke-linecap': 'round' });
  return svg('svg', { viewBox: '0 0 64 64', focusable: 'false' }, contorn, marca);
}

// Cada fila té dos botons que filtren la llista: el recompte recent (avui / 24 h) i el total de l'estat.
// Tornar a clicar el botó actiu treu el filtre.
const xifra = (valor, etiqueta, estat, finestra, total) => el('div', { class: 'xifres__fila' },
  el('button', { type: 'button', class: 'xifra', 'data-estat': estat, 'data-finestra': finestra, 'aria-pressed': 'false' },
    el('span', { class: 'xifra__n', text: String(valor) }), el('span', { class: 'xifra__t', text: etiqueta })),
  el('button', { type: 'button', class: 'xifra xifra--total', 'data-estat': estat, 'data-finestra': '', 'aria-pressed': 'false' },
    el('span', { class: 'xifra__n', text: String(total) }), el('span', { class: 'xifra__t', text: 'en total' })));

export function pintaEstat(d) {
  const nivell = d.semafor.nivell;
  $('estat').className = `estat ${NIVELLS[nivell].classe}`;
  $('estat-titol').textContent = NIVELLS[nivell].titol;
  $('estat-icona').replaceChildren(icona(nivell));
  $('estat-subtitol').textContent = d.targetes.ultimEnviatAt
    ? `Últim correu enviat ${fa(d.targetes.ultimEnviatAt)}.` : 'Encara no s’ha enviat cap correu.';

  // Els motius només es mostren si el semàfor no és verd.
  const motius = $('estat-motius');
  motius.replaceChildren(...d.semafor.motius.map((m) => el('li', { text: m })));
  motius.hidden = d.semafor.motius.length === 0;

  const t = d.targetes;
  $('xifres').replaceChildren(
    xifra(t.enviatsAvui, t.enviatsAvui === 1 ? 'enviat avui' : 'enviats avui', 'ENVIAT', 'enviats-avui', t.totalEnviats),
    xifra(t.pendentsAra + t.enviant, 'pendents ara', 'PENDENT,ENVIANT', 'pendents-ara', t.totalPendents),
    xifra(t.fallits24h, 'fallits (24 h)', 'FALLIT', 'fallits-24h', t.totalFallits),
    xifra(t.cancelats24h, 'cancel·lats (24 h)', 'CANCELAT', 'cancelats-24h', t.totalCancelats),
  );
  $('avis-prova').hidden = !d.llistaBlanca.activa;

  // Si passa a vermell, l'estat tècnic s'obre sol (una vegada; després l'usuari decideix).
  if (nivell === 'vermell' && nivellAnterior !== 'vermell') $('tecnic').open = true;
  nivellAnterior = nivell;
}

export function pintaEstatSenseDades() {
  $('estat').className = 'estat estat--cap';
  $('estat-titol').textContent = 'Sense dades';
  $('estat-subtitol').textContent = '';
  $('estat-icona').replaceChildren();
  $('estat-motius').hidden = true;
  $('xifres').replaceChildren();
}

const dada = (etiqueta, valor, petit = null, alerta = false) => {
  const dd = el('dd', { text: valor });
  if (petit) dd.append(el('small', { text: petit }));
  return el('div', alerta ? { class: 'alerta' } : {}, el('dt', { text: etiqueta }), dd);
};

export function pintaTecnic(d) {
  const p = d.proces;
  const v = p.ultimVerify;
  const smtp = v.ok === null ? 'Encara no comprovat' : v.ok ? 'Correcte' : 'Ha fallat';
  const petitSmtp = v.at ? `Comprovat ${fa(v.at)}${v.ok === false && v.missatge ? `. ${v.missatge}` : ''}` : null;
  $('proces').replaceChildren(
    dada('Aquest worker', d.workerId),
    dada('Mode', d.mode === 'bucle' ? 'Bucle continu' : 'Tick (cron extern)', d.mode === 'bucle' ? 'Consulta la cua cada 2 segons' : 'Només treballa quan algú crida /api/tick'),
    dada('Servidor de correu (SMTP)', smtp, petitSmtp, v.ok === false),
    dada('Últim senyal de vida', p.ultimBatecAt ? fa(p.ultimBatecAt) : 'Cap', p.ultimBatecAt ? formataDataHora(p.ultimBatecAt) : null),
    dada('En marxa des de fa', durada(p.segonsEnMarxa)),
    dada('Llista blanca', d.llistaBlanca.activa ? `Activa (${d.llistaBlanca.entrades})` : 'No activa'),
    dada('Últim resultat', p.ultimResultat ? ETIQUETA_RESULTAT[p.ultimResultat.tipus] || 'Desconegut' : 'Cap', p.ultimResultat ? fa(p.ultimResultat.at) : null),
    dada('Cua', `${d.targetes.programats} programats, ${d.targetes.reintentant} reintentant, ${d.targetes.cancelats24h} cancel·lats (24 h)`),
  );
  const llista = $('errors');
  llista.replaceChildren(...(p.errorsRecents.length
    ? p.errorsRecents.map((e) => el('li', {}, el('time', { text: formataDataHora(e.at) }), document.createTextNode(e.missatge)))
    : [el('li', { text: 'Cap error recent.' })]));
  pintaRitme(d.perHora);
}

function pintaRitme(perHora) {
  const ample = 240;
  const alt = 80;
  const maxim = Math.max(1, ...perHora.map((p) => p.n));
  const pas = ample / perHora.length;
  const grafic = svg('svg', { viewBox: `0 0 ${ample} ${alt}`, role: 'img', preserveAspectRatio: 'none', 'aria-label': 'Correus enviats cada hora durant les últimes 24 hores' });
  perHora.forEach((p, i) => {
    const h = p.n === 0 ? 2 : Math.max(3, (p.n / maxim) * alt);
    const barra = svg('rect', { x: i * pas + 1, y: alt - h, width: pas - 2, height: h, class: p.n === 0 ? 'barra barra--buida' : 'barra' });
    barra.append(svg('title', {}, document.createTextNode(`${formataHoraCurta(p.hora)} h: ${p.n} enviats`)));
    grafic.append(barra);
  });
  const eix = el('div', { class: 'ritme-eix', 'aria-hidden': 'true' });
  for (const i of [0, 6, 12, 18, 23]) eix.append(el('span', { text: `${formataHoraCurta(perHora[i].hora)} h` }));
  $('ritme').replaceChildren(grafic, eix);
}
