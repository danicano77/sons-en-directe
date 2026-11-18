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
- **STOP / ENRERE / AVANT**: aturen tot i canvien de so carregat sense reproduir-lo.
- **Mode de reproducció** (a sobre del PLAY):
  - *Apaga els altres*: en començar aquest so, s'aturen tots els altres que estiguin sonant.
  - *Al damunt*: aquest so s'afegeix als que ja estan sonant (capes). Pots tenir tants sons sonant alhora com vulguis.
- **Quan un so acaba**, es carrega automàticament el següent de la llista i **espera** a que el tornis a prémer PLAY. No s'engega sol.
- **Editar**: canvia l'ordre amb ▲/▼, renombra amb ✎, esborra amb ✕, ajusta el volum de cada so i el seu mode amb el botó `!`/`+`.
- **Desar l'escena** (icona de marcador): guarda un nom amb l'ordre, volums, modes, volum general i el so carregat. **Escenes** (icona de llista) les aplica o les esborra.
- **Exportar / Importar JSON** (icones de fletxes): l'exportació inclou tots els àudios (en base64), l'ordre, volums, modes, escenes i l'estat actual. La importació ho substitueix tot després de demanar confirmació.

### Ratolí / teclat

- `Espai` = play/pausa del so carregat
- `←` / `→` = so anterior / següent
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
