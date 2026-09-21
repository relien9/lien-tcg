# LIEN TCG — nettbutikk

## Hva er dette

- `index.html` — hele nettsiden (butikk, handlekurv, kasse, anmeldelser, kontakt). "Om oss"-seksjonen ligger inne som HTML-kommentar (midlertidig fjernet på forespørsel) — søk etter `om-oss` i filen for å legge den tilbake.
- `betaling-fullfort.html` — siden kunden lander på etter Vipps-betaling.
- `api/vipps/` — en liten backend (Vercel-funksjoner) som snakker med Vipps sitt ePayment API. En statisk HTML-fil kan ikke ta imot betaling trygt på egen hånd — dette er biten som gjør at "Betal med Vipps"-knappen faktisk fungerer.
- `api/send-order-email.js` — sender bekreftelses-e-post til kunden (fra `post@lientcg.no`) og en kopi til deg selv når noen fullfører kassen. Se "Om e-postbekreftelse" lenger ned.

Akkurat nå, uten at backend-en er satt opp et sted, viser "Betal med Vipps" en vennlig beskjed om å ta kontakt manuelt i stedet for å henge fast. Så snart du følger stegene under er den live.

## 1. Få siden på nett (gratis, ingen kredittkort)

Anbefaler [Vercel](https://vercel.com) — gratis for dette formålet, og `api/`-mappen fungerer uten noe ekstra oppsett.

1. Opprett en gratis konto på vercel.com (kan logge inn med GitHub, GitLab eller e-post).
2. Enkleste vei: last opp denne mappen til et GitHub-repo, og "Import Project" i Vercel-dashboardet — den oppdager automatisk `api/`-funksjonene.
   - Alternativt, med [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`, så `vercel` inne i denne mappen.
3. Legg til domenet ditt (`lientcg.no`) under Project → Settings → Domains, og pek DNS-en dit i henhold til Vercels instruksjoner.

Du får en `.vercel.app`-adresse med det samme du kan teste på, før domenet er koblet til.

## 2. Hent Vipps API-nøkler

Du har allerede en Vipps-konto — bra, da gjenstår bare å hente API-tilgang:

1. Logg inn på [portal.vipps.no](https://portal.vipps.no).
2. Velg salgsenheten (sales unit) butikken skal bruke.
3. Under API-nøkler / Developer finner du:
   - **Client ID**
   - **Client secret**
   - **Subscription key** (Ocp-Apim-Subscription-Key)
   - **Merchant Serial Number (MSN)**
4. Portalen har egne test-nøkler og produksjonsnøkler — start med testmiljøet.

## 3. Sette miljøvariabler i Vercel

I Vercel-prosjektet: Settings → Environment Variables, legg inn (se også `.env.example`):

```
VIPPS_ENV=test
VIPPS_CLIENT_ID=...
VIPPS_CLIENT_SECRET=...
VIPPS_SUBSCRIPTION_KEY=...
VIPPS_MSN=...
```

Deploy på nytt etter at variablene er lagt inn (Vercel gjør dette automatisk ved neste push, eller trykk "Redeploy").

## 4. Test kjøpsløypen

1. Installer Vipps' testapp (link i Vipps-dokumentasjonen, eller bruk "Vipps MobilePay Test" appen) og logg inn med et testbrukernummer fra portalen.
2. Gå til nettsiden din, legg noe i handlekurven, gå til kassen, fyll inn et testtelefonnummer, og trykk "Betal med Vipps".
3. Du sendes til Vipps for å godkjenne betalingen i testappen, og tilbake til `betaling-fullfort.html`, som bekrefter status.

## 5. Registrer webhook (anbefalt, men valgfritt i starten)

Webhooken lar Vipps varsle nettsiden automatisk når en betaling endrer status (nyttig når du etter hvert lagrer bestillinger et sted). Uten den fungerer selve betalingen fortsatt fint — kunden ser resultatet med det samme via `betaling-fullfort.html`.

Når siden er live, registrer webhooken én gang (bytt ut URL-en med din egen, og nøklene med dine):

```bash
curl -X POST https://apitest.vipps.no/webhooks/v1/webhooks \
  -H "Authorization: Bearer <access_token>" \
  -H "Ocp-Apim-Subscription-Key: <subscription_key>" \
  -H "Merchant-Serial-Number: <msn>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://lientcg.no/api/vipps/callback",
    "events": ["epayments.payment.authorized.v1", "epayments.payment.aborted.v1", "epayments.payment.expired.v1"]
  }'
```

Svaret inneholder en `secret` — sett den som `VIPPS_WEBHOOK_SECRET` i Vercel.

## 6. Gå i produksjon

Når testkjøpene fungerer:

1. Be om produksjonstilgang i Vipps-portalen (om ikke allerede aktiv).
2. Bytt de fire `VIPPS_*`-variablene til produksjonsverdiene, og sett `VIPPS_ENV=production`.
3. Registrer webhooken på nytt mot `https://api.vipps.no/...` (produksjons-URL).

## Om e-postbekreftelse

Kassen samler nå inn fornavn, etternavn, adresse, postnummer, poststed, telefon og e-post fra kunden (ikke bare navn/telefon/e-post som før). Når noen fyller ut og sender skjemaet, sendes to e-poster via [Resend](https://resend.com) (gratis for dette volumet — 3000 e-poster/måned):

1. En bekreftelse til kunden, fra `post@lientcg.no`, med ordreoppsummering og leveringsinfo.
2. En kopi til deg selv (`post@lientcg.no`) med samme info, så du ser bestillingen med det samme.

**Slik setter du det opp** (kan gjøres uavhengig av Vipps og domenekobling, men du trenger domenet ditt DNS-tilgjengelig for steg 2):

1. Opprett en gratis konto på [resend.com](https://resend.com).
2. Under Domains → Add Domain, legg inn `lientcg.no`. Resend gir deg noen DNS-poster (SPF/DKIM) du må legge inn hos domene.no — uten disse godtar ikke e-postleverandører (Gmail, Outlook osv.) at e-post sendes fra `post@lientcg.no`, og de havner fort i spam eller avvises.
3. Når domenet er verifisert (kan ta litt tid etter DNS-endring), lag en API-nøkkel under API Keys.
4. Legg `RESEND_API_KEY` inn som miljøvariabel i Vercel (samme sted som Vipps-nøklene, se steg 3 over).

**Viktig å vite nå:**
- Uten `RESEND_API_KEY` satt feiler e-postsendingen stille (logges på serveren, men butikken/kassen fungerer helt normalt likevel) — akkurat som med Vipps.
- E-posten sendes når kunden trykker «Betal med Vipps» i kassen — altså ved bestilling, ikke nødvendigvis ved bekreftet betaling, siden bestillinger ikke lagres noe sted ennå (se TODO under). Når du får satt opp ordrelagring, bør dette flyttes til å trigges av Vipps-webhooken (`api/vipps/callback.js`) i stedet, slik at e-posten kun går ut ved *bekreftet* betaling.
- `post@lientcg.no` som avsenderadresse trenger ikke være en ekte innboks for at sending skal virke, men det er lurt å sette opp e-postmottak på den adressen også (hos domene.no eller en e-postleverandør) siden ordre-kopien sendes dit.

## Ting å vite / neste steg

- **Bestillinger lagres ikke ennå.** `api/vipps/initiate.js` og `api/vipps/callback.js` har `TODO`-kommentarer der en database (eller noe enklere, som et regneark) bør kobles inn, så du faktisk har oversikt over bestillinger — ikke bare betalingsstatus hos Vipps. Si ifra hvis du vil at jeg setter det opp.
- **Handlekurven er ikke lagret mellom besøk** — den nullstilles ved sideoppdatering. Grei oppførsel for en katalog-side, men fortell meg hvis du vil at den skal huskes (f.eks. med localStorage) når siden er live.
- **Kontaktskjema og anmeldelsesskjema** (nederst på siden, egne skjema fra kasse-/bestillingsflyten) viser fortsatt bare en bekreftelse på skjermen — de sender ikke e-post noe sted ennå. Si ifra om du vil ha dem koblet til f.eks. e-post (samme Resend-oppsett som ordrebekreftelsen kan gjenbrukes) eller et skjema-verktøy.
- **Produktdata (navn og priser) er fortsatt plassholdere.** Alt i `const listings` i `index.html` er eksempler til du legger inn ditt eget faktiske sortiment og dine egne priser.

## Om produktbildene

Bildene som ligger inne nå er hentet fra offentlige kilder — ikke bilder av ditt faktiske lager:

- **Singelkort og graderte kort**: kategorikortene på forsiden ligger fortsatt inne, men produktlistene bak dem er tomme — trykker du på en av dem vises "Ingen produkter tilgjengelig i denne kategorien akkurat nå". Legg til varer i `const listings.singelkort.items` / `listings.graded.items` i `index.html` når du har reelt lager å vise, så dukker de opp igjen automatisk. Prisen på kategorikortet står som "Kommer snart" så lenge listene er tomme.
  - **Singelkort**-kategorikortet bruker nå et Pexels-bilde (fritt lisensiert) av et Charizard-kort omgitt av flere andre kort, med fremsiden/artworket synlig på kortene — i stedet for kortrygger eller ett enkelt kort.
  - **Graderte kort**-kategorikortet bruker nå et bilde med flere PSA 10 GEM MINT-graderte "slabs" stablet sammen (kort forseglet i plastholder med tydelig karakterlapp), i høyere oppløsning enn forrige versjon. Bildet er hentet fra en eBay-annonse og er ikke lisensiert stockfoto — bytt det ut med et offisielt PSA/CGC-pressebilde eller et eget bilde av dine graderte kort før butikken går live for ordentlig.
- **4 av Elite Trainer Boks-produktene** (Pitch Black, Destined Rivals, Mega Evolution/Gardevoir, Stellar Crown) bruker ekte transparente PNG-er — offisielle presse-/markedsføringsbilder som PokéBeach har publisert i sine set-artikler. Disse vises fritt-stående uten noen bakgrunnsboks.
- **Resten av forseglede produkter** (boosterbokser, øvrige ETB-er, collection-bokser) bruker TCGplayers produktbilder (`product-images.tcgplayer.com`), som er ekte fotografier tatt på hvit studiobakgrunn. Jeg fant ikke offisielle transparente versjoner av disse etter grundig søk — de fleste settene *har* en offisiell transparent presse-PNG hos Pokémon-selskapets pressenettsted, men den serveres bare via en pålogget nedlastingslenke jeg ikke får hentet direkte herfra. For disse er bildet beskåret tettere inn og har en myk mørk vignett i kantene i stedet for en hard hvit boks (se CSS-klassen `.listing-image`).
- **Mystery Packs** har ingen ekte produkt å vise til (det er deres eget konsept), så alle tre bruker et eget tegnet ikon — en svart lerretssekk med "?" og en Pokéball-lapp, laget som ren SVG-kode direkte i siden (ingen ekstern bildefil, så den vises alltid uansett internettforbindelse).
- **One Piece — OP-17 og OP-10 JPN Booster Boks** bruker ekte produktbilder fra en nettbutikk (card-binder.com) av de japanske boosterboksene for OP-17 "The World's Strongest Warriors" og OP-10 "Royal Blood".

**Om du vil fullføre resten:** hvis du (eller noen med en gratis konto) laster ned disse to filene fra [press.pokemon.com](https://press.pokemon.com) og sender dem til meg, kan jeg bytte dem inn med det samme:
- "Sword & Shield—Darkness Ablaze Elite Trainer Box.png"
- "Scarlet & Violet—Twilight Masquerade Elite Trainer Box.png"
- "Mega Evolution—Black Bolt Elite Trainer Box.png" / "...White Flare..."
- "Mega Evolution—Perfect Order Elite Trainer Box.png"

En vare med `transparent: true` i `const listings` (i `index.html`) får automatisk denne "fritt-stående"-visningen i stedet for beskjæring/vignett — sett dette feltet når du bytter inn et bilde du vet er transparent.

Dette er en praktisk snarvei for å få siden til å se ferdig ut, men det er tredjeparts-lenker — de kan i prinsippet endre seg eller forsvinne, og bør byttes ut med dine egne bilder (av det du faktisk har på lager) før butikken går live for ordentlig. Siden har en fallback innebygd: hvis et bilde ikke laster, vises et nøytralt 🖼️-ikon i stedet for et ødelagt bilde.

**Slik bytter du ut et bilde:** finn produktet i `const listings` i `index.html`, og sett `image`-feltet til URL-en for ditt eget bilde (enten en lenke, eller last bildet opp i mappa og pek til filnavnet, f.eks. `image: 'bilder/mitt-bilde.jpg'`).

## Om lagerantall ("X på lager")

Hvert produkt i `const listings` kan nå ha et `stock`-felt som viser hvor mange som er tilgjengelig:

```js
{ id: 'bb-1', name: 'Surging Sparks Booster Boks', price: 3599, image: '...', stock: 12 }
```

- Er `stock` ikke satt i det hele tatt, vises ingen lagertekst (slik alle produktene står nå — jeg har ikke funnet på tall).
- 4 eller flere: viser "X stk. på lager".
- 1–3: viser en gul "Kun X igjen på lager"-advarsel.
- 0: viser rød "Utsolgt", og "Legg i handlekurv"-knappen blir deaktivert automatisk.
- Handlekurven lar ikke kunden legge i flere enn det som er på lager, uansett hvor mange ganger de trykker.

Du trenger bare å legge til `stock: <antall>` på hver vare i `index.html` for at dette skal vises — ingen andre endringer nødvendig.
