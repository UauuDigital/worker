// Llista de correus: dues línies per correu; el detall tècnic només en desplegar-lo.
import { el, $ } from './dom.js';
import { formataDataHora, formataHora, durada } from './format.js';

const ETIQUETA_ESTAT = { PENDENT: 'Pendent', ENVIANT: 'Enviant', ENVIAT: 'Enviat', FALLIT: 'Fallit', CANCELAT: 'Cancel·lat' };

// «12:31» si és d'avui; «20/10 12:31» si no.
function horaLlista(iso) {
  const d = new Date(iso);
  const hm = formataHora(iso).slice(0, 5);
  if (d.toDateString() === new Date().toDateString()) return hm;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`;
}

// Una frase només quan hi ha alguna cosa a dir: un correu enviat sense incidències no en porta.
function nota(f) {
  if (f.estat === 'ENVIANT') {
    const des = f.enviantDesAt ? `S'està enviant des de fa ${durada((Date.now() - new Date(f.enviantDesAt).getTime()) / 1000)}.` : 'S’està enviant.';
    return f.reprenAt ? `${des} Si no acaba, es reprendrà a les ${formataHora(f.reprenAt)}.` : des;
  }
  if (f.estat === 'PENDENT') {
    if (f.intents > 0) return `Reintent programat per al ${formataDataHora(f.properIntentAt)}.${f.motiu ? ` ${f.motiu}` : ''}`;
    return new Date(f.properIntentAt).getTime() > Date.now() ? `Programat per al ${formataDataHora(f.properIntentAt)}.` : null;
  }
  if (f.estat === 'FALLIT' || f.estat === 'CANCELAT') return f.motiu || null;
  return null;
}

const etiquetaWorker = (w) => (w === null ? '—' : w === 'antic' ? 'Antic (Railway o local sense actualitzar)' : w);
const parell = (dt, dd) => [el('dt', { text: dt }), el('dd', { text: dd })];

function fila(f, oberts, perEnviament) {
  const resum = el('summary', {},
    el('span', { class: 'fila__hora', text: horaLlista(perEnviament && f.enviatAt ? f.enviatAt : f.creatAt) }),
    el('span', { class: 'fila__dest', text: f.destinatari }),
    el('span', { class: `xip xip--${f.estat}`, text: ETIQUETA_ESTAT[f.estat] || f.estat }),
    el('span', { class: 'fila__assumpte', text: f.assumpte }),
  );
  const n = nota(f);
  if (n) resum.append(el('span', { class: 'fila__nota', text: n }));

  const detall = el('dl', { class: 'fila__detall' },
    ...parell('Intents', String(f.intents)),
    ...parell('Worker', etiquetaWorker(f.worker)),
    ...parell('Creat', formataDataHora(f.creatAt)),
    ...(f.enviatAt ? parell('Enviat', formataDataHora(f.enviatAt)) : []),
  );
  const d = el('details', { class: `fila fila--${f.estat}`, 'data-id': f.id }, resum, detall);
  if (oberts.has(f.id)) d.open = true;
  return el('li', {}, d);
}

// El refresc automàtic repinta les files però conserva les que l'usuari tenia desplegades.
// Amb el filtre d'hora actiu, la primera columna mostra l'hora d'enviament (no la de creació).
export function pintaLlista(h, perEnviament = false) {
  const oberts = new Set([...document.querySelectorAll('#llista details[open]')].map((d) => d.dataset.id));
  $('llista').replaceChildren(...h.files.map((f) => fila(f, oberts, perEnviament)));
  $('llista-buida').hidden = h.files.length > 0;
  $('pag-info').textContent = h.pagines > 1 ? `Pàgina ${h.pagina} de ${h.pagines}` : `${h.total} correus`;
  $('pag-anterior').disabled = h.pagina <= 1;
  $('pag-seguent').disabled = h.pagina >= h.pagines;
}

export function mostraAvisConnexio(missatge) {
  const a = $('avis-connexio');
  a.hidden = !missatge;
  a.textContent = missatge || '';
}
