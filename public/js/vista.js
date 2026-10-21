// Pintat del panell. Tot el contingut de la BD s'insereix amb textContent (mai innerHTML).
import { formataDataHora, formataHora, formataHoraCurta, fa, durada, minutsAText } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(etiqueta, atributs = {}, ...fills) {
  const e = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributs)) {
    if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const f of fills) e.append(f);
  return e;
}

function svg(etiqueta, atributs = {}, ...fills) {
  const e = document.createElementNS(SVG_NS, etiqueta);
  for (const [k, v] of Object.entries(atributs)) e.setAttribute(k, v);
  for (const f of fills) e.append(f);
  return e;
}

const $ = (id) => document.getElementById(id);
const buida = (node) => node.replaceChildren();

const SEMAFOR = {
  verd: { titol: 'Tot correcte', classe: 'semafor--verd', forma: 'M20 32l8 8 16-18' },
  taronja: { titol: 'Atenció', classe: 'semafor--taronja', forma: 'M32 22v14M32 43v2' },
  vermell: { titol: 'Problema', classe: 'semafor--vermell', forma: 'M23 23l18 18M41 23L23 41' },
};
const ETIQUETA_ESTAT = { PENDENT: 'Pendent', ENVIANT: 'Enviant', ENVIAT: 'Enviat', FALLIT: 'Fallit', CANCELAT: 'Cancel·lat' };
const ETIQUETA_RESULTAT = { enviat: 'Correu enviat', cancelat: 'Correu cancel·lat', reintent: 'Reintent programat', fallit: 'Correu fallit' };

// El nivell es veu per tres vies: color, forma de la icona (cercle, triangle, octàgon) i text.
function iconaSemafor(nivell) {
  const f = SEMAFOR[nivell];
  const contorn = nivell === 'verd'
    ? svg('circle', { cx: 32, cy: 32, r: 28, fill: 'none', stroke: 'currentColor', 'stroke-width': 4 })
    : nivell === 'taronja'
      ? svg('path', { d: 'M32 6L60 56H4Z', fill: 'none', stroke: 'currentColor', 'stroke-width': 4, 'stroke-linejoin': 'round' })
      : svg('path', { d: 'M21 4h22l17 17v22L43 60H21L4 43V21Z', fill: 'none', stroke: 'currentColor', 'stroke-width': 4, 'stroke-linejoin': 'round' });
  const marca = svg('path', { d: f.forma, fill: 'none', stroke: 'currentColor', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  return svg('svg', { viewBox: '0 0 64 64', focusable: 'false' }, contorn, marca);
}

export function pintaSemafor(d) {
  const nivell = d.semafor.nivell;
  const caixa = $('semafor');
  caixa.className = `semafor ${SEMAFOR[nivell].classe}`;
  $('semafor-titol').textContent = SEMAFOR[nivell].titol;
  $('semafor-icona').replaceChildren(iconaSemafor(nivell));
  const llista = $('semafor-motius');
  buida(llista);
  for (const m of d.semafor.motius) llista.append(el('li', { text: m }));
  $('actualitzat').textContent = `Actualitzat a les ${formataHora(d.generatAt)}`;
  $('avis-prova').hidden = !d.llistaBlanca.activa;
}

export function pintaSemaforSenseDades() {
  $('semafor').className = 'semafor semafor--cap';
  $('semafor-titol').textContent = 'Sense dades';
  buida($('semafor-icona'));
  buida($('semafor-motius'));
}

export function pintaRitme(perHora) {
  const ample = 240;
  const alt = 80;
  const maxim = Math.max(1, ...perHora.map((p) => p.n));
  const pas = ample / perHora.length;
  const grafic = svg('svg', { viewBox: `0 0 ${ample} ${alt}`, role: 'img', preserveAspectRatio: 'none',
    'aria-label': 'Correus enviats cada hora durant les últimes 24 hores' });
  perHora.forEach((p, i) => {
    const h = p.n === 0 ? 2 : Math.max(3, (p.n / maxim) * alt);
    const barra = svg('rect', { x: i * pas + 1, y: alt - h, width: pas - 2, height: h, class: p.n === 0 ? 'barra barra--buida' : 'barra' });
    barra.append(svg('title', {}, document.createTextNode(`${formataHoraCurta(p.hora)} h: ${p.n} enviats`)));
    grafic.append(barra);
  });
  const eix = el('div', { class: 'ritme-eix', 'aria-hidden': 'true' });
  for (const i of [0, 6, 12, 18, 23]) eix.append(el('span', { text: `${formataHoraCurta(perHora[i].hora)} h` }));
  const total = perHora.reduce((s, p) => s + p.n, 0);
  $('ritme').replaceChildren(grafic, eix, el('p', { class: 'nota ritme-total', text: `${total} correus enviats en les últimes 24 hores. Màxim per hora: ${maxim === 1 && total === 0 ? 0 : maxim}.` }));
}

const dada = (etiqueta, valor, { petit = null, alerta = false } = {}) => {
  const dd = el('dd', { text: valor });
  if (petit) dd.append(el('small', { text: petit }));
  return el('div', alerta ? { class: 'alerta' } : {}, el('dt', { text: etiqueta }), dd);
};

export function pintaXifres(t) {
  $('xifres').replaceChildren(
    dada('Enviats avui', String(t.enviatsAvui)),
    dada('Últimes 24 h', String(t.enviats24h)),
    dada('Últims 7 dies', String(t.enviats7d)),
    dada('Pendents ara', String(t.pendentsAra), { petit: `${t.programats} programats per més endavant` }),
    dada('Enviant ara', String(t.enviant), { petit: t.enviant > 0 && t.segonsEnviantMesAntic !== null ? `El més antic, des de fa ${durada(t.segonsEnviantMesAntic)}` : null, alerta: t.segonsEnviantMesAntic !== null && t.segonsEnviantMesAntic > 60 }),
    dada('Reintentant', String(t.reintentant)),
    dada('Fallits (24 h)', String(t.fallits24h), { alerta: t.fallits24h > 0 }),
    dada('Cancel·lats (24 h)', String(t.cancelats24h)),
    dada('Pendent més antic', minutsAText(t.minutsPendentMesAntic), { petit: t.minutsPendentMesAntic === null ? 'La cua és al dia' : 'esperant des de fa' }),
    dada('Últim enviament correcte', t.ultimEnviatAt ? fa(t.ultimEnviatAt) : 'Cap', { petit: t.ultimEnviatAt ? formataDataHora(t.ultimEnviatAt) : null }),
  );
}

export function pintaProces(d) {
  const p = d.proces;
  const v = p.ultimVerify;
  const smtp = v.ok === null ? 'Encara no comprovat' : v.ok ? 'Correcte' : 'Ha fallat';
  const petitSmtp = v.at ? `Comprovat ${fa(v.at)} (${formataDataHora(v.at)})${v.ok === false && v.missatge ? `. ${v.missatge}` : ''}` : null;
  $('proces').replaceChildren(
    dada('Mode del worker', d.mode === 'bucle' ? 'Bucle continu' : 'Tick (cron extern)', { petit: d.mode === 'bucle' ? 'Consulta la cua cada 2 segons' : 'Només treballa quan algú crida POST /api/tick' }),
    dada('Temps en marxa', durada(p.segonsEnMarxa), { petit: 'Des de l’últim reinici del procés' }),
    dada('Últim senyal de vida', p.ultimBatecAt ? fa(p.ultimBatecAt) : 'Cap', { petit: p.ultimBatecAt ? formataDataHora(p.ultimBatecAt) : null }),
    dada('Servidor de correu (SMTP)', smtp, { petit: petitSmtp, alerta: v.ok === false }),
    dada('Llista blanca', d.llistaBlanca.activa ? `Activa (${d.llistaBlanca.entrades})` : 'No activa', { petit: d.llistaBlanca.activa ? 'Mode prova' : 'Es pot enviar a tothom' }),
    dada('Últim resultat', p.ultimResultat ? ETIQUETA_RESULTAT[p.ultimResultat.tipus] || 'Desconegut' : 'Cap', { petit: p.ultimResultat ? fa(p.ultimResultat.at) : null }),
  );
  const llista = $('errors');
  buida(llista);
  if (p.errorsRecents.length === 0) llista.append(el('li', { text: 'Cap error recent.' }));
  for (const e of p.errorsRecents) llista.append(el('li', {}, el('time', { text: formataDataHora(e.at) }), document.createTextNode(e.missatge)));
}

// Text de la columna «Detall»: explica en quin punt és el correu i per què, no només l'etiqueta d'estat.
function detallFila(f) {
  if (f.estat === 'ENVIANT') {
    const des = f.enviantDesAt ? `Intent ${f.intents} en curs des de fa ${durada((Date.now() - new Date(f.enviantDesAt).getTime()) / 1000)}.` : `Intent ${f.intents} en curs.`;
    const resta = f.reprenAt ? ` Un enviament normal dura pocs segons; si no acaba, es reprendrà a les ${formataHora(f.reprenAt)}.` : '';
    return des + resta;
  }
  if (f.estat === 'PENDENT') {
    const quan = f.properIntentAt ? formataDataHora(f.properIntentAt) : '';
    if (f.intents > 0) return `Reintent ${f.intents + 1} programat per al ${quan}.${f.motiu ? ` Motiu de l'últim error: ${f.motiu}` : ''}`;
    return new Date(f.properIntentAt).getTime() > Date.now() ? `Programat per al ${quan}.` : 'Esperant el seu torn a la cua.';
  }
  if (f.estat === 'ENVIAT' && f.enviatAt) return `Enviat ${formataDataHora(f.enviatAt)}`;
  return f.motiu || '';
}

export function pintaHistorial(h) {
  const cos = $('historial');
  buida(cos);
  h.files.forEach((f, i) => {
    const celda = (etiqueta, contingut, classe = '') => {
      const td = el('td', { 'data-etiqueta': etiqueta, ...(classe ? { class: classe } : {}) });
      td.append(contingut);
      return td;
    };
    const tr = el('tr', {},
      celda('Data', document.createTextNode(formataDataHora(f.creatAt)), 'data'),
      celda('Destinatari', document.createTextNode(f.destinatari)),
      celda('Assumpte', document.createTextNode(f.assumpte)),
      celda('Estat', el('span', { class: `estat estat--${f.estat}`, text: ETIQUETA_ESTAT[f.estat] || f.estat })),
      celda('Intents', document.createTextNode(String(f.intents)), 'num'),
      celda('Detall', document.createTextNode(detallFila(f))),
    );
    tr.style.animationDelay = `${Math.min(i, 12) * 15}ms`;
    cos.append(tr);
  });
  $('historial-buit').hidden = h.files.length > 0;
  $('pag-info').textContent = `Pàgina ${h.pagina} de ${h.pagines} · ${h.total} correus`;
  $('pag-anterior').disabled = h.pagina <= 1;
  $('pag-seguent').disabled = h.pagina >= h.pagines;
}

export function mostraAvisConnexio(missatge) {
  const a = $('avis-connexio');
  a.hidden = !missatge;
  a.textContent = missatge || '';
}
