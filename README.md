# Repository storico: compatibilità e redirect

Questo repository ha una sola funzione: accompagnare i vecchi collegamenti al
sito attuale, https://riccardobuzzolan.github.io/. Non contiene una seconda
implementazione del portfolio, una PWA, moduli di contatto o servizi applicativi.

## URL e hosting reali

- Destinazione canonical: https://riccardobuzzolan.github.io/ (repository
  `riccardobuzzolan.github.io`).
- Compatibilità GitHub Pages: https://riccardobuzzolan.github.io/riccardobuzzolan/.
- Compatibilità Vercel: https://riccardo-buzzolan-portfolio.vercel.app/;
  progetto `riccardo-buzzolan-portfolio`, ID `prj_gcakWS3gs63hRJgFr0dFLmZFm5GN`,
  team `riccardo-buzzolan`. È collegato a **questo** repository storico.

Vercel usa l'unica regola di `vercel.json`: tutti i percorsi raggiungono la
destinazione fissa con redirect HTTP permanente. I parametri ricevuti non
scelgono hostname o percorso del target. Le pagine HTML di fallback mantengono lo stesso URL
canonical, `noindex, follow`, meta refresh e link manuale. Non richiedono
JavaScript: se il refresh è bloccato, il link resta utilizzabile da tastiera.

GitHub Pages pubblica i file statici di `main` e ignora `vercel.json`: il meta
refresh non equivale a un redirect HTTP permanente. Una vecchia pagina
inesistente può mantenere il proprio status 404 mentre mostra il fallback.
`robots.txt` permette di leggere il `noindex`; sotto il percorso Pages di questo
progetto il controllo robots dell'origine resta nel repository principale.
Non c'è una sitemap del sito storico, perché non ci sono pagine da indicizzare.

## Struttura e controlli

- `index.html`, `404.html`: fallback minimale;
- `vercel.json`: un solo redirect permanente;
- `robots.txt`: nessun blocco che impedisca la lettura del noindex;
- `scripts/check-redirect.mjs`: HTML, destinazioni, regola Vercel e scansione
  dei segreti; i messaggi non mostrano eventuali valori;
- `tests/redirect.test.mjs`: regressioni contro loop, target variabili, redirect
  temporanei, fallback/noindex mancanti e robots contraddittori.

Sono stati eliminati solo favicon, apple icon e social image che non avevano
riferimenti nei fallback. Non servono manifest, service worker, asset del vecchio
portfolio, pacchetti npm o variabili ambiente. I dati sono soltanto l'URL di
destinazione e i due testi di fallback.

Con Node 22:

```bash
node scripts/check-redirect.mjs
node --test tests/redirect.test.mjs
```

Per leggere il fallback locale, avviare `python -m http.server 8000` e aprire
http://localhost:8000/. Il server locale non applica il redirect Vercel.
Nessun comando install/build è necessario: la CI usa solo Node e le sue librerie
standard. Dependabot controlla GitHub Actions; non esistono dipendenze npm da
installare o sottoporre ad audit. CodeQL non è necessario per una pagina senza
JavaScript applicativo.

## Deploy, verifica e rollback

Lavorare su branch/PR e richiedere il check `redirect` prima del merge su `main`.
La CI ha permessi `contents: read`, timeout e Actions fissate a SHA;
non usa token di deploy. Il merge avvia Pages e l'integrazione Git Vercel.
Verificare i rispettivi deployment prima di dichiarare il rilascio riuscito.

Dopo il deploy verificare la risposta HTTP Vercel di `/` e di un vecchio percorso,
il Location verso il portfolio attuale e l'assenza di loop; verificare i due
fallback Pages e il link manuale. Le preview Vercel possono richiedere
l'autenticazione dell'account/team e non rappresentano l'accessibilità pubblica
del dominio di produzione. Gli header personalizzati di `vercel.json` non
configurano GitHub Pages.

Per rollback creare un revert del commit problematico su una nuova PR, ripetere
i controlli e attendere entrambi i deployment. Il rollback non deve alterare il
repository attuale o rimuovere hosting. La protezione di `main` va configurata
manualmente in GitHub quando l'integrazione non possiede i permessi amministrativi.
