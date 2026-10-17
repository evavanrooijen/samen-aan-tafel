# Samen aan tafel — installatie

## Wat zit erin?
- E-mail/wachtwoord registratie en login via Firebase Authentication
- Gedeelde voorraad
- Recepten met ingrediënten en bereidingswijze
- Weekplan (maandag t/m zondag)
- Gedeelde, afvinkbare boodschappenlijst
- Responsive, minimalistische interface

## Stap 1 — Firebase-project
1. Ga naar https://console.firebase.google.com/ en maak een project.
2. Open Projectinstellingen (tandwiel) → Algemeen → Jouw apps → Web-app toevoegen (`</>`).
3. Registreer de app en kopieer de `firebaseConfig` waarden.
4. Open `app.js` en vervang de vier `VUL_HIER...` placeholders door de waarden uit Firebase. Gebruik de exacte `apiKey`, `authDomain`, `projectId` en `appId`.

## Stap 2 — Authentication
1. Firebase Console → Build → Authentication → Aan de slag.
2. Open Sign-in method / Inlogmethode.
3. Schakel **E-mail/wachtwoord** in en sla op.

## Stap 3 — Firestore en beveiligingsregels
1. Firebase Console → Build → Firestore Database → Create database.
2. Kies een locatie dicht bij jullie (bijvoorbeeld europe-west).
3. Open het tabblad **Rules** en vervang de regels door de inhoud van `firestore.rules`. Klik **Publish**.
4. Laat geen algemene `allow read, write: if true`-regels staan.

## Stap 4 — Maak jullie twee accounts
1. Start de website lokaal of publiceer eerst naar GitHub Pages (stap 6).
2. Maak het eerste account via **Account maken**.
3. Maak ook het tweede account aan. Je kunt na registratie eventueel opnieuw naar de login-weergave gaan; de accounts worden door Firebase Authentication bewaard.
4. Firebase Console → Authentication → Users. Kopieer voor elk account de volledige **UID**.

## Stap 5 — Koppel beide accounts aan hetzelfde huishouden
Voor deze eerste versie gebeurt dit bewust handmatig in de Firebase Console. Zo kan een willekeurige bezoeker zichzelf niet zomaar toegang geven tot jullie privégegevens.

1. Kies de UID van het eerste account als jullie `householdId`. Dat is de volledige UID, niet het e-mailadres.
2. Firebase Console → Firestore Database → Data → Start collection (als er nog geen documenten zijn).
3. Maak een collectie `users` met document-ID gelijk aan de UID van het eerste account. Voeg een veld toe:
   - `householdId` — type **string** — waarde: de UID van het eerste account.
4. Maak in diezelfde collectie `users` een tweede document met document-ID gelijk aan de UID van het tweede account. Voeg exact hetzelfde veld `householdId` toe met de UID van het eerste account als waarde.
5. Klaar: beide gebruikers verwijzen nu naar hetzelfde huishouden. De app maakt de subcollecties onder `households/{householdId}` automatisch aan zodra jullie iets toevoegen.

**Let op:** maak de `users`-documenten in de Firebase Console, niet via de app. De regels blokkeren client-side wijzigingen aan deze koppelingen.

## Stap 6 — GitHub Pages
1. Maak op GitHub een nieuwe repository, bijvoorbeeld `samen-aan-tafel`.
2. Upload `index.html`, `style.css`, `app.js`, `firestore.rules` en deze `SETUP.md` naar de hoofdmap (`root`) van de repository.
3. Open GitHub: Settings → Pages.
4. Kies bij Build and deployment: **Deploy from a branch**.
5. Selecteer branch `main` en map `/(root)`, klik Save.
6. Wacht tot GitHub de site publiceert. De URL ziet er meestal uit als `https://JOUW-GEBRUIKERSNAAM.github.io/samen-aan-tafel/`.
7. Firebase Console → Authentication → Settings → Authorized domains. Voeg je GitHub Pages-domein toe, bijvoorbeeld `JOUW-GEBRUIKERSNAAM.github.io` (alleen de hostnaam, zonder `https://` of pad). `localhost` is doorgaans al aanwezig voor lokaal testen.

## Stap 7 — Testen
- Open de gepubliceerde website en maak/log in met account 1.
- Voeg een voorraadproduct, recept en boodschappen toe.
- Open de site in een tweede browser of privévenster en log in met account 2.
- Controleer of dezelfde gegevens zichtbaar zijn en of wijzigingen in beide vensters verschijnen.
- Probeer niet-ingelogd de Firestore-gegevens op te vragen; de regels horen toegang te weigeren.

## Lokaal testen
Omdat `app.js` ES modules importeert, open `index.html` niet rechtstreeks met `file://`.
Start een lokale webserver vanuit de projectmap, bijvoorbeeld met Python:
`python -m http.server 8000`
Open daarna `http://localhost:8000`.

## Belangrijke notities
- De Firebase web-config bevat een API-key die in client-apps zichtbaar is; dat is normaal. Beveiliging komt uit Firebase Security Rules en de instellingen van het project. Deel nooit een service-account-key of Admin SDK credentials in de frontend.
- Zet geen open Firestore-regels online. De regels hierboven geven alleen toegang aan accounts waarvan het `users/{uid}`-profiel naar de betreffende `householdId` verwijst.
- De eerste versie heeft geen wachtwoordreset, uitnodigingsflow, voorraadhoeveelheden als getal, automatische ingrediënten-naar-boodschappenlogica of offline-modus.
- De huidige weekplanner gebruikt de maandag van de huidige week als week-ID; hij toont geen weeknavigatie.
- Deze starter gebruikt de Firebase JavaScript SDK via de officiële CDN-modules. Een bundler is niet nodig.
- Even een overbodige comment, want de deploy lukte nog niet
