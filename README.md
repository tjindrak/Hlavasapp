# Hlavasapp

Interní aplikace Hlavas: výkaz hodin týmu, ceníky a faktury (export do PDF a ISDOC).

Celá aplikace je jeden soubor `index.html` bez závislostí. Data se ukládají v prohlížeči (localStorage) toho, kdo ji otevře; na server se nic neposílá. Zálohu a přenos dat mezi zařízeními řeší tlačítka „Exportovat zálohu“ a „Načíst zálohu“.

Nasazení na Vercel: importuj repozitář, framework „Other“, bez build příkazu.

## Přihlášení (Vercel)

Na Vercelu chrání celou aplikaci `middleware.js`; bez přihlášení se zobrazí jen `login.html`. Přístupové údaje nejsou v kódu, nastavují se v projektu na Vercelu (Settings → Environment Variables):

- `HLAVAS_USERS` = `jmeno1:heslo1;jmeno2:heslo2`
- `HLAVAS_SECRET` = dlouhý náhodný řetězec (alespoň 32 znaků)

Po změně proměnných je potřeba projekt znovu nasadit (Deployments → Redeploy). Přihlášení platí 30 dní, odhlášení je v menu. Lokálně otevřený soubor přihlášení nemá.

## Sdílená data (Vercel)

Na webu se data ukládají do Upstash Redis, takže je vidí všichni přihlášení. V projektu na Vercelu: Storage → Create Database / Marketplace → **Upstash for Redis** → připojit k projektu (doplní `KV_REST_API_URL` a `KV_REST_API_TOKEN`), pak Redeploy.

Při prvním otevření se do prázdné databáze nahraje to, co je v prohlížeči. Souběžné úpravy dvou lidí se slučují po jednotlivých lidech a dokladech. Tečka vedle menu: zelená = uloženo, žlutá = ukládám, červená = bez připojení / databáze není nastavená. Lokální soubor dál ukládá jen do prohlížeče.
