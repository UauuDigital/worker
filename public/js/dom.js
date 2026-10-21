// Helpers per crear nodes. Tot el contingut de la BD s'insereix amb textContent (mai innerHTML).
const SVG_NS = 'http://www.w3.org/2000/svg';

export function el(etiqueta, atributs = {}, ...fills) {
  const e = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributs)) {
    if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const f of fills) e.append(f);
  return e;
}

export function svg(etiqueta, atributs = {}, ...fills) {
  const e = document.createElementNS(SVG_NS, etiqueta);
  for (const [k, v] of Object.entries(atributs)) e.setAttribute(k, v);
  for (const f of fills) e.append(f);
  return e;
}

export const $ = (id) => document.getElementById(id);
