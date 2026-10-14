# Hlavasapp

Interní aplikace Hlavas: výkaz hodin týmu, ceníky a faktury (export do PDF a ISDOC).

Celá aplikace je jeden soubor `index.html` bez závislostí. Data se ukládají v prohlížeči (localStorage) toho, kdo ji otevře; na server se nic neposílá. Zálohu a přenos dat mezi zařízeními řeší tlačítka „Exportovat zálohu“ a „Načíst zálohu“.

Nasazení na Vercel: importuj repozitář, framework „Other“, bez build příkazu.
