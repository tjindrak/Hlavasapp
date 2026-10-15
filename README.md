# Hlavasapp

Interní aplikace Hlavas: výkaz hodin týmu, ceníky a faktury (export do PDF a ISDOC).

Celá aplikace je jeden soubor `index.html` bez závislostí. Data se ukládají v prohlížeči (localStorage) toho, kdo ji otevře; na server se nic neposílá. Zálohu a přenos dat mezi zařízeními řeší tlačítka „Exportovat zálohu“ a „Načíst zálohu“.

Nasazení na Vercel: importuj repozitář, framework „Other“, bez build příkazu.

## Přihlášení (Vercel)

Na Vercelu chrání celou aplikaci `middleware.js`; bez přihlášení se zobrazí jen `login.html`. Přístupové údaje nejsou v kódu, nastavují se v projektu na Vercelu (Settings → Environment Variables):

- `HLAVAS_USERS` = `jmeno1:heslo1;jmeno2:heslo2`
- `HLAVAS_SECRET` = dlouhý náhodný řetězec (alespoň 32 znaků)

Po změně proměnných je potřeba projekt znovu nasadit (Deployments → Redeploy). Přihlášení platí 30 dní, odhlášení je v menu. Lokálně otevřený soubor přihlášení nemá.
