# Sons en directe

Web app per a reproduir sons en directe: carrega arxius d'àudio, els ordena, tria si cada so apaga els altres o es reprodueix al damunt, i desa escenes senceres que es poden exportar/importar en JSON.

És una app estàtica: no cal instal·lar dependències ni fer cap build. Els àudios es guarden al dispositiu (IndexedDB) i no s'envien enlloc.

## Pujar a GitHub

Des de la carpeta `sons-en-directe`:

```bash
git init
git add .
git commit -m "Primera versió de Sons en directe"
git branch -M main
git remote add origin https://github.com/<el-teu-usuari>/<el-teu-repo>.git
git push -u origin main
```

## Desplegar

- **Netlify**: puja la carpeta a un repo i fes servir `Add new site → Import an existing project`. Build command buit, publish directory `.`. El `netlify.toml` ja evita que es cachegin `sw.js` i el manifest.
- **GitHub Pages**: puja la carpeta i activa Pages al repo (branch `main`, carpeta `/ (root)`). Functiona igual perquè tot són fitxers estàtics amb rutes relatives.

## Instalar-ho a la tablet / mòbil

1. Obre la URL desplegada amb **Chrome**.
2. Menú (⋮) → **Instal·la l'aplicació** o **Afegeix a la pantalla d'inici**.
3. S'obre a pantalla completa, sense barra del navegador. El service worker permet que funcioni sense connexió un cop carregada.

## Ús

- **+ Afegir sons**: tria diversos fitxers d'àudio (`mp3`, `wav`, `m4a`, `ogg`, `flac`…). També els pots arrossegar a la llista.
- **Botó PLAY (el gran)**: reprodueix el so carregat. Si ja sona, el pausa / el reprèn.
- **Tecla de reproducció**: al costat del selector de mode hi ha el botó «Play: <tecla>». Toca'l i prem la tecla que vulguis (per defecte, `Espai`). Es desa al dispositiu i es conserva en tancar l'app. «Restableix (Espai») torna a la tecla original. Evita `Esc` (atura-ho tot), `Tab` i combinacions amb Ctrl/Alt/Cmd. Aquesta tecla funciona **mentre la pestanya de l'app estigui activa**: un navegador no permet registrar tecles globals del sistema quan la pestanya no té el focus. Per al **segon pla** (pantalla apagada, una altra app, bloqueig), fes servir les **tecles de mitjans** del teclat, l'auricular o la pantalla: Play/Pausa, anterior i següent. gràcies a la integració amb Media Session. També s'hi poden enviar salts de temps (fletxes de la interfície del sistema).
- **STOP / ENRERE / AVANT**: aturen tot i canvien de so carregat sense reproduir-lo.
- **Mode de reproducció** (a sobre del PLAY):
  - *Apaga els altres*: en començar aquest so, s'aturen tots els altres que estiguin sonant.
  - *Al damunt*: aquest so s'afegeix als que ja estan sonant (capes). Pots tenir tants sons sonant alhora com vulguis.
- **Bucle**: el botó «↻ Bucle» (o la tecla `L`) activa/desactiva que el so carregat es repeteixi sense parar. També es pot activar so per so des del mode `Editar`. Amb el bucle actiu el so no acaba, així que no es carrega el següent.
- **Fade per so**: al mode `Editar`, cada so té un camp «Fade» en segons (0 a 30). Posant-hi `0` el so no fa fade; posant, per exemple, `3`, el volum baixa durant els últims 3 segons del so, just abans que acabi. El valor es desa amb el so i també s'inclou a les escenes i als fitxers JSON. STOP, `Esc`, la pausa i el canvi a un so «Apaga els altres» fan servir sempre un fade curt fixe de 0,8 s.
- **Barra de progrés**: toca o arrossega qualsevol punt de la barra per saltar a aquell temps de la pista. També es pot fer amb les fletxes (salts de 5 s), `Home` i `End` quan la barra té el focus. Si encara no s'ha reproduït el so, el punt triat s'aplica quan es premi PLAY.
- **Quan un so acaba** (sense bucle), es carrega automàticament el següent de la llista i **espera** a que el tornis a prémer PLAY. No s'engega sol.
- **Editar**: canvia l'ordre amb ▲/▼, renombra amb ✎, esborra amb ✕, ajusta el volum de cada so i canvia el seu mode amb `!`/`+` o el bucle amb `↻`.
- **Desar l'escena** (icona de marcador): guarda un nom amb l'ordre, volums, modes, volum general i el so carregat. **Escenes** (icona de llista) les aplica o les esborra.
- **Exportar / Importar JSON** (icones de fletxes): l'exportació inclou tots els àudios (en base64), l'ordre, volums, modes, estat del bucle, escenes i l'estat actual. La importació ho substitueix tot després de demanar confirmació. Els JSON i escenes de versions anteriors (sense bucle) es carreguen igual, amb el bucle desactivat.

### Ratolí / teclat

- Tecla configurable (per defecte `Espai`) = play/pausa del so carregat
- `←` / `→` = so anterior / següent
- `L` = bucle on/off del so carregat
- `Esc` = aturar-ho tot
- Doble clic sobre un nom de la llista = carregar-lo i reproduir-lo

## Estructura de fitxers

```
sons-en-directe/
├── index.html            interfície i estils
├── app.js                lògica (àudio, IndexedDB, escenes, JSON)
├── manifest.webmanifest  metadades PWA
├── sw.js                 service worker (instal·lable i offline)
├── icons/                icones 180 / 192 / 512
├── netlify.toml          capçaleres de cache per a Netlify
└── README.md
```
