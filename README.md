# UAUU Worker de correus + panell d'estat

Aplicació Node.js que consumeix la cua `correus_cua` del CRM i envia els correus per SMTP de Microsoft 365, amb un panell web protegit amb contrasenya per veure'n l'estat i l'historial. Pensada per desplegar-se a Servatica des de GitHub.

**Stack (decidit):** Node ≥ 20, JavaScript pla (CommonJS), sense TypeScript ni pas de build. Dependències: `express`, `nodemailer`, `pg`, `dotenv`, `express-rate-limit`.

> **Només ha d'haver-hi UN worker actiu alhora.** El límit de Microsoft 365 (30 missatges/minut) és per procés. Abans d'activar aquest, **elimina o atura el servei worker de Railway** (i qualsevol altre `npm run dev:worker` en marxa).

## Requisits previs
- Node.js 20 o superior
- Accés a la BD de Supabase del CRM (mateixa `DATABASE_URL` que l'API)
- Compte SMTP de Microsoft 365 amb permís d'enviament

## Instal·lació (primer cop)
1. Clona el repositori
2. `npm install`
3. Copia `.env.example` a `.env` i omple els valors reals
4. No cal cap migració: el panell **no crea cap taula** a la BD

## Execució (dia a dia)
- Local: `npm start` → `http://localhost:3000` (en local posa `EXIGEIX_HTTPS=false` al `.env`)
- Proves: `npm test`
- Demo amb dades FALSES (sense BD ni SMTP): `node test/dev-servidor.js` → `http://localhost:3100`

## Variables d'entorn
| Variable | Descripció |
|---|---|
| `DATABASE_URL` | URL de Postgres del CRM. El `?pgbouncer=true` de Prisma s'ignora |
| `SMTP_HOST`, `SMTP_PORT` | Servidor SMTP (`smtp.office365.com`, `587`, STARTTLS) |
| `SMTP_USER`, `SMTP_PASS` | Credencials SMTP. Mai es mostren ni es registren |
| `CORREU_REMITENT_EMAIL`, `CORREU_REMITENT_NOM` | Remitent visible |
| `CORREU_LLISTA_BLANCA` | Emails o dominis (`@uauu.cat`) separats per comes. Si no és buida, qualsevol altre destinatari queda `CANCELAT`. **En producció, buida** |
| `MODE_WORKER` | `bucle` (per defecte) o `tick` |
| `TICK_SECRET` | Secret (mín. 16 caràcters) per a `POST /api/tick`. Obligatori en mode `tick` |
| `TICK_MAX_SEGONS` | Durada màxima d'un tick (25 per defecte) |
| `PANELL_USUARI`, `PANELL_CONTRASENYA` | Accés al panell (contrasenya de 12 caràcters com a mínim) |
| `WORKER_ID` | Nom d'aquest worker (p. ex. `servatica`, `local-marti`). Surt a l'historial del panell, a l'auditoria i al Message-ID. Per defecte, el nom de la màquina |
| `PORT` | Port d'escolta (3000) |
| `TRUST_PROXY` | Nombre de proxies de confiança (1 per defecte) |
| `EXIGEIX_HTTPS` | `false` només per a desenvolupament local |

L'aplicació valida l'entorn en arrencar i diu quines variables falten (mai en mostra els valors).

## Modes d'execució
- **`bucle`**: el motor corre dins el mateix procés i consulta la cua cada 2 s. Necessita que el hosting mantingui el procés viu.
- **`tick`**: no hi ha bucle. Un cron extern crida cada minut:
  ```
  curl -fsS -X POST -H "X-Tick-Secret: EL_TEU_SECRET" https://EL-TEU-DOMINI/api/tick
  ```
  Processa correus durant com a màxim `TICK_MAX_SEGONS` i retorna. Dues crides alhora són segures (candau en memòria + `FOR UPDATE SKIP LOCKED`). Si el SMTP es penja, un tick pot excedir el màxim (els timeouts són de 20 s). El semàfor passa a vermell si fa més de 15 min que ningú crida el tick (2 min en mode bucle).

## Deploy a Servatica
1. Connecta el repositori de GitHub des del panell del hosting (Node.js).
2. Fitxer d'arrencada: `server.js`. Instal·lació: `npm install --omit=dev`. Arrencada: `npm start`.
3. Defineix les variables d'entorn de la taula (o un `.env` al servidor, fora del git).
4. Activa HTTPS al domini. El panell es nega a servir-se per HTTP.
5. Si el hosting adorm el procés quan no rep peticions, fes servir `MODE_WORKER=tick` i configura el cron.
6. Comprova `https://EL-TEU-DOMINI/salut` (ha de respondre `{"ok":true}`), entra al panell i prem «Comprovar SMTP ara».
7. **Cache-busting:** l'HTML no es guarda a la caché i els CSS/JS porten `?v=` amb l'empremta del contingut, que canvia a cada desplegament. `/version.json` mostra la versió en curs. Si el domini passa per Plesk/nginx, `html/js/css/json` no han d'estar a «Serve static files directly by nginx».

## Primer desplegament en producció (important)
1. Engega amb `CORREU_LLISTA_BLANCA=el-teu-correu@uauu.cat`. Només sortirà el que vagi a aquesta adreça; la resta quedarà `CANCELAT`. El panell mostra un banner groc.
2. Comprova el panell, el semàfor i «Comprovar SMTP ara».
3. Fes que el CRM encui un correu cap a tu i verifica que arriba i surt com a `ENVIAT`.
4. **Només llavors** deixa `CORREU_LLISTA_BLANCA` buida i reinicia. Compte: els correus de clients que van quedar `CANCELAT` durant la prova **no es reenvien sols**.

## Més d'un worker (qui ha enviat què)
Tots els workers comparteixen la mateixa cua. Cada un s'etiqueta amb `WORKER_ID`, i això queda a:
- el `metadata` de l'auditoria (`workerId`), que és d'on el panell llegeix la columna **Worker** de l'historial;
- el `Message-ID` del correu (`<uuid.WORKER_ID@domini>`), visible a les capçaleres del correu rebut.

El panell mostra «Antic» per als correus tancats per un worker sense etiqueta (el de Railway o un local sense actualitzar) i «—» per als que encara no s'han tancat. **No es pot saber qui ha fet un intent fallit o un reintent**: només el resultat final queda registrat.

**Risc d'un worker local amb llista blanca contra la BD compartida:** qualsevol correu que no sigui als seus destinataris permesos queda `CANCELAT` i no es reenvia sol. Per treballar en local, ús una BD de proves pròpia o no arrenquis cap worker local.

## Panell
- **Dalt:** una frase d'estat (🟢 «Tot va bé» · 🟠 «Atenció» · 🔴 «Hi ha un problema»), amb color, icona i text. Els motius només surten quan no és verd. Retard >10 min, reintents, llista blanca o SMTP sense comprovar → taronja; SMTP caigut, fallits en 24 h, motor mut, correu esperant >30 min o «enviant» >7 min → vermell. A sota, tres números: enviats avui, pendents i fallits.
- **Llista de correus** (pastilles Tots / Enviats / Pendents / Fallits i cerca per destinatari): dues línies per correu, amb una frase només quan hi ha alguna cosa a dir. En tocar un correu es veuen els intents, el worker i les dates.
- **Estat tècnic** (plegat; s'obre sol si passa a vermell): worker, mode, SMTP, últim senyal de vida, errors recents, enviaments per hora i el botó «Comprovar SMTP ara» (només `verify()`).
- Actualització cada 10 s sense animar-ho tot de nou. Si l'API no respon, el panell ho diu i indica de quan són les dades.
- Cap botó modifica la cua ni envia correus.
- Seguretat: sessió amb galeta `HttpOnly` + `SameSite=Strict` + `Secure`, límit d'intents al login, comparacions en temps constant, CSP estricta, `noindex`, HTTPS obligatori. Mai es llegeix ni es mostra el cos dels correus.

## Estructura del projecte
- `server.js` — arrencada i aturada ordenada
- `src/` — `motor-cua.js` (motor), `cua.js` (SQL), `enviament.js` (SMTP), `regles.js` (funcions pures), `estadistiques.js` (dades del panell), `seguretat.js`, `app.js` (rutes), `missatges-error.js` (tots els errors en català), `estat-viu.js`, `config.js`, `registre.js`
- `public/` — panell (HTML + CSS + JS pla)
- `test/` — proves (`node --test`)
- `data/estat.json` — estat viu local (millor esforç; s'ignora si no es pot escriure)

## Si falla
- **El semàfor diu que el SMTP ha fallat**: revisa `SMTP_USER`/`SMTP_PASS`. Si diu «sense resposta o bloquejat», el hosting pot bloquejar el port 587 de sortida (com Railway): demana-ho al suport.
- **«No s'ha pogut connectar amb la base de dades»**: revisa `DATABASE_URL` i que el pooler de Supabase sigui accessible des del hosting.
- **No arriba cap correu i el panell és verd**: mira si hi ha llista blanca activa o si el mode és `tick` i el cron no crida.
- **Correus duplicats**: hi ha més d'un worker actiu. Atura l'altre.
- **No puc entrar al panell per HTTPS darrere d'un proxy**: ajusta `TRUST_PROXY` perquè el proxy enviï `X-Forwarded-Proto`.
- **Logs**: només al servidor (consola del hosting). Allà hi ha el detall tècnic; al panell només hi surten missatges en català.

## Garantia d'enviament
«Almenys un cop»: si el procés cau just després d'enviar i abans de desar l'estat, el correu es pot repetir quan caduqui el bloqueig (5 min). El desat de l'estat `ENVIAT` es reintenta 3 vegades per minimitzar-ho.
