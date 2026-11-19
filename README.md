# Fullastad

Räknar ut hur mycket du kan lasta i bilen på gränshandeln.

## Starta

Dubbelklicka `start.cmd` (eller kör `powershell -ExecutionPolicy Bypass -File server.ps1`) och öppna http://localhost:8080/.
Inga beroenden – bara Windows PowerShell.

## Så fungerar sidan

1. **Din bil** – välj Märke, Modell och Generation. Fabrikat och Max lastvikt fylls i och kan ändras för hand.
   Under rutan står "Kontrollera totalvikt − tjänstevikt i registreringsbeviset och ändra vid behov." –
   registreringsbeviset gäller alltid före värdena i appen.
2. **Förare och passagerare** – sidan startar med bara Förare. Lägg till så många passagerare du vill och fyll i
   vikten för var och en.
3. **Inköpslista** – välj kategori (Öl & Cider, Vin, Sprit, Läsk) och klicka på en förpackningsstorlek för att lägga
   till den. Ändra antal med − / + eller skriv in det. Uppskattad vikt per förpackning visas under varje rad.
4. **Övrig last** – bagage, mat och annat i kg.
5. **Resultat** – visar hur mycket som är kvar att lasta, eller hur mycket bilen är överlastad med, plus en
   uppdelning per del.

Allt startar tomt (visas som "–") tills du fyller i något. Dina val sparas bara lokalt i webbläsaren (`localStorage`)
och skickas inte någonstans.

Förarens vikt räknas alltid av från max lastvikten. Maxlasten i registreringsbeviset är beräknad med en förare på
75 kg, så appen kan visa upp till cirka 75 kg för lite kvar att lasta – aldrig för mycket.

## Datakällor

**Bilmodeller** – `public/cars.json` innehåller ca 4 000 generationer från 43 märken som säljs/finns i Sverige
(modeller tillverkade från 1995 som fanns kvar efter 2005, utan USA-/Kina-/Japanspecifika versioner). Data kommer från
auto-data.net: för varje generation hämtas flera motorvarianter och max last (= tillåten totalvikt − tjänstevikt).

| Fält | Betydelse |
|---|---|
| `maxLoad` | Medianen av max last över motorvarianterna – det värde som fylls i på sidan |
| `min` / `max` | Spannet mellan motorvarianterna (visas inte på sidan) |
| `est` | `true` om auto-data bara anger tjänstevikt och maxlasten är uppskattad utifrån lika tunga bilar |
| `passengers`, `n` | Antal säten − 1 och antal varianter i underlaget (används inte på sidan) |

Det finns inget gratis API som ger maxlast per registreringsnummer i Sverige (Transportstyrelsens söktjänst skyddas av
reCAPTCHA; Biluppgifter, TIC och Car.info är betaltjänster).

**Bordershop** – `server.ps1` hämtar produktlistor från bordershop.com (Puttgarden) för öl, cider, vin, mousserande, sprit och läsk.
Förpackningsstorlekar (t.ex. "24 x 33 cl burk") tolkas ur produktnamnen och grupperas. Bordershop publicerar inga vikter, så vikten
uppskattas i `public/app.js` (`estimateKg`) från volym + typiska vikter för burk, glasflaska, PET och bag-in-box, plus ytterkartong.
Resultaten cachas 6 h i servern och 24 h i webbläsaren.

## Tillgänglighet

Sidan är anpassad efter WCAG 2.2 nivå AA:

- Allt går att använda med tangentbord, med tydliga fokusringar. Fokus flyttas inte av sig självt när du väljer bil,
  och det stannar kvar på rätt ställe när du tar bort rader eller ändrar antal.
- Skärmläsare får höra resultatet ("Kvar att lasta …" / "Varning: överlastad med …") och vad som lagts till eller
  tagits bort, via en dold `aria-live`-region.
- Dekorativa ikoner är dolda för skärmläsare, och knappar har unika namn (t.ex. "Ta bort passagerare 2",
  "Öka antal 24 × 33 cl burk").
- Text och fältkanter klarar kontrastkraven. På skärmar som är minst 700 px breda visas sidan 50 % större.

## Filer

| Fil | Innehåll |
|---|---|
| `server.ps1` | Liten webbserver (port 8080) som serverar `public/` och hämtar från Bordershop via `/api/bordershop` |
| `start.cmd` | Startar servern och öppnar sidan |
| `public/index.html`, `styles.css`, `app.js` | Själva sidan |
| `public/cars.json` | Bildata (se ovan) |
| `public/logo.svg` | Logotypen; övriga ikoner ligger inbäddade i `index.html` |
| `AGENTS.md` | Regler för AI-agenter, bl.a. att inga nycklar eller personuppgifter får finnas i koden |
