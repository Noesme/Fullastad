# Fullastad

Räknar ut hur mycket du kan lasta i bilen på gränshandeln.

## Starta

Dubbelklicka `start.cmd` (eller kör `powershell -ExecutionPolicy Bypass -File server.ps1`) och öppna http://localhost:8080/.
Inga beroenden – bara Windows PowerShell.

## Datakällor

**Bilmodeller** – `public/cars.json` innehåller ca 4 000 generationer från 43 märken som säljs/finns i Sverige
(modeller tillverkade från 1995 som fanns kvar efter 2005, utan USA-/Kina-/Japanspecifika versioner). Data kommer från
auto-data.net: för varje generation hämtas flera motorvarianter och max last (= tillåten totalvikt − tjänstevikt).
`maxLoad` är medianen, `min`/`max` spannet (visas som tips på sidan), `passengers` = antal säten − 1.
Där auto-data bara anger tjänstevikt är `est: true` och maxlasten uppskattad utifrån vad lika tunga bilar får lasta.
Värdena varierar med motor och utrustning, så användaren kan justera dem på sidan – registreringsbeviset gäller.

Det finns inget gratis API som ger maxlast per registreringsnummer i Sverige (Transportstyrelsens söktjänst skyddas av
reCAPTCHA; Biluppgifter, TIC och Car.info är betaltjänster).

**Bordershop** – `server.ps1` hämtar produktlistor från bordershop.com (Puttgarden) för öl, cider, vin, mousserande, sprit och läsk.
Förpackningsstorlekar (t.ex. "24 x 33 cl burk") tolkas ur produktnamnen och grupperas. Bordershop publicerar inga vikter, så vikten
uppskattas i `public/app.js` (`estimateKg`) från volym + typiska vikter för burk, glasflaska, PET och bag-in-box, plus ytterkartong.
Resultaten cachas 6 h i servern och 24 h i webbläsaren.
