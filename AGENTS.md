# AGENTS.md

Instruktioner för AI-agenter (Claude, Codex, Copilot m.fl.) som arbetar i det här projektet.

## Projektet i korthet

Fullastad är en statisk webbsida som räknar ut hur mycket man kan lasta i bilen vid gränshandel.

- `server.ps1`: liten PowerShell-server (port 8080) som serverar `public/` och hämtar produktlistor från bordershop.com via `/api/bordershop`.
- `public/`: `index.html`, `app.js`, `styles.css`, `logo.svg` och `cars.json` (bildata från auto-data.net).
- `start.cmd`: startar servern och öppnar sidan.

Läs `README.md` för mer om datakällorna.

## Inga nycklar eller hemligheter i koden

Projektet behöver i dag inga API-nycklar. Om det ändras:

- Skriv **aldrig** API-nycklar, tokens, lösenord, certifikat eller anslutningssträngar i källkod, `cars.json`, README, kommentarer eller commit-meddelanden.
- Läs hemligheter från miljövariabler eller från en lokal fil som finns i `.gitignore` (t.ex. `config.json` eller `.env`).
- Lägg i så fall till en `config.example.json` eller `.env.example` med påhittade platshållare som `"apiKey": "DIN_NYCKEL_HÄR"`.
- Skicka aldrig nycklar till klienten (`public/`). Allt i `public/` är synligt för alla besökare.
- Om du hittar en nyckel i koden: ta bort den, flytta den till en ignorerad fil och säg till användaren att nyckeln måste bytas ut. Att ta bort den räcker inte om den redan har committats.

## Inga personuppgifter

- Lägg inte in riktiga namn, e-postadresser, telefonnummer, personnummer, adresser eller **registreringsnummer** i kod, testdata, exempel eller dokumentation. Ett registreringsnummer kan kopplas till en person.
- Använd påhittade exempel: `ABC123` för regnummer, `exempel@example.com` för e-post och "Testperson" för namn.
- Appen sparar bara användarens val lokalt i webbläsaren (`localStorage`). Lägg inte till kod som skickar sådana uppgifter till en server eller tredje part utan att användaren har bett om det.
- Logga inte personuppgifter i `server.ps1` eller i webbläsarens konsol.
- Skrapade data (`cars.json`, Bordershop-svar) får bara innehålla produkt- och fordonsdata, inga uppgifter om personer.

## Innan du committar

1. Kontrollera att inga filer som matchar `.gitignore` (t.ex. `.env`, `config.json`, loggar) läggs till.
2. Sök igenom ändringarna efter nycklar och personuppgifter, t.ex. med:
   `git diff --cached | grep -inE "api[_-]?key|token|secret|password|passwd|bearer|@[a-z0-9-]+\.[a-z]{2,}"`
3. Om något hittas: stoppa, ta bort det och fråga användaren.

## Övrigt

- `.ps1`-filer ska sparas som UTF-8 **med BOM**, annars går svenska tecken och "–" sönder i Windows PowerShell 5.1.
- Kringgå aldrig CAPTCHA eller inloggningar när du hämtar data (t.ex. Transportstyrelsens söktjänst).
