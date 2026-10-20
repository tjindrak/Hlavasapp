# Hlavasapp

Interní aplikace Hlavas: výkaz hodin týmu, ceníky a faktury (export do PDF a ISDOC).

Celá aplikace je jeden soubor `index.html` bez závislostí. Data se ukládají v prohlížeči (localStorage) toho, kdo ji otevře; na server se nic neposílá. Zálohu a přenos dat mezi zařízeními řeší tlačítka „Exportovat zálohu“ a „Načíst zálohu“.

Nasazení na Vercel: importuj repozitář, framework „Other“, bez build příkazu.

## Přihlášení (Vercel)

Na Vercelu chrání celou aplikaci `middleware.js`; bez přihlášení se zobrazí jen `login.html`. Přístupové údaje nejsou v kódu, nastavují se v projektu na Vercelu (Settings → Environment Variables):

- `HLAVAS_USERS` = `jmeno1:heslo1;jmeno2:heslo2`
- `HLAVAS_SECRET` = nepovinné; bez něj se cookie podepisuje tajným tokenem úložiště Blob

Po změně proměnných je potřeba projekt znovu nasadit (Deployments → Redeploy). Přihlášení platí 30 dní, odhlášení je v menu. Lokálně otevřený soubor přihlášení nemá.

## Sdílená data (Vercel)

Na webu se data ukládají do soukromého úložiště Vercel Blob (`api/data.js`), takže je vidí všichni přihlášení. Úložiště musí být připojené k projektu (Storage → Blob), tím se doplní `BLOB_READ_WRITE_TOKEN`.

Při prvním otevření se do prázdného úložiště nahraje to, co je v prohlížeči. Souběžné úpravy dvou lidí se slučují po jednotlivých lidech a dokladech. Tečka vedle menu: zelená = uloženo, žlutá = ukládám, červená = bez připojení / úložiště není nastavené. Lokální soubor dál ukládá jen do prohlížeče.


Místo `HLAVAS_USERS` jde také nastavit `HLAVAS_LOGINS="jmeno1,jmeno2"` a heslo každého uživatele dát do proměnné pojmenované jeho jménem (např. `jmeno1`).

## Role

- **Správci** jsou účty z proměnných prostředí (`HLAVAS_USERS` / `HLAVAS_LOGINS`). Vidí a mění všechno.
- **Členy** zakládá správce přímo v aplikaci: detail člena → Upravit → Přístup do aplikace (jméno + heslo).
  Člen vidí jen jména a součty hodin ostatních, zapisuje jen své hodiny a vidí všechny ceníky a faktury;
  upravit a smazat může jen ty, které sám vytvořil. Hodnocení a poznámky nevidí. Omezení hlídá server (`api/data.js`).
- Hesla členů jsou v Blob uložená jen jako hash (PBKDF2), soubor `hlavasapp/accounts.json`.
