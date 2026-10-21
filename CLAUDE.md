# UAUU Worker de correus + panell d'estat

Regles específiques d'aquest projecte (les globals són a `~/.claude/CLAUDE.md`).

## Stack (decidit)
- Node ≥ 20, JavaScript pla (CommonJS), sense TypeScript ni build.
- Dependències: `express`, `nodemailer`, `pg`, `dotenv`, `express-rate-limit`.
- Frontend: HTML/CSS/JS pla, sense framework.

## Regles del projecte
- Repo de referència `F:\Users\Martí\Desktop\Uauu\uauu-crm`: NOMÉS LECTURA.
- Cap taula nova ni migració a la BD (és compartida amb el CRM). Cap prova d'escriptura contra producció.
- Només pot haver-hi UN worker actiu alhora.
- Errors tècnics només als logs; a la UI, missatges en català de `missatges-error.js`.
- Mai registrar `SMTP_PASS`, `DATABASE_URL` ni contrasenyes.
