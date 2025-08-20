# VolantinoMix 🛒

Piattaforma web per la ricerca, visualizzazione e unificazione di volantini promozionali con sistema di pubblicità dinamica integrata.

## 🚀 Caratteristiche Principali

- **Ricerca Intelligente**: Trova volantini per CAP o geolocalizzazione
- **PDF Unificato**: Combina più volantini in un singolo PDF
- **Pubblicità Dinamica**: Inserimento automatico di annunci pubblicitari
- **Google AdSense**: Integrazione completa per monetizzazione
- **Notifiche Browser**: Aggiornamenti in tempo reale sui nuovi volantini
- **Design Responsive**: Ottimizzato per desktop e mobile
- **PWA Ready**: Service Worker per funzionalità offline

## 📁 Struttura del Progetto

```
volantinoMix/
├── frontend/                 # Applicazione web frontend
│   ├── index.html           # Homepage principale
│   ├── unified.html         # Pagina volantino unificato
│   ├── styles.css           # Stili principali
│   ├── unified.css          # Stili pagina unificata
│   ├── script.js            # JavaScript principale
│   └── unified.js           # JavaScript pagina unificata
├── backend/                 # Server Node.js
│   ├── server.js            # Server Express principale
│   ├── package.json         # Dipendenze Node.js
│   ├── config/
│   │   └── database.js      # Configurazione MongoDB
│   ├── models/
│   │   ├── Volantino.js     # Schema volantini
│   │   └── Advertisement.js # Schema pubblicità
│   ├── routes/
│   │   ├── flyers.js        # API volantini
│   │   ├── pdfs.js          # API gestione PDF
│   │   └── ads.js           # API pubblicità
│   └── services/
│       ├── pdfService.js    # Servizio generazione PDF
│       └── adService.js     # Servizio gestione ads
└── README.md                # Questo file
```

## 🛠️ Installazione e Setup

### Prerequisiti

- Node.js (v16 o superiore)
- MongoDB (v4.4 o superiore)
- npm o yarn

### 1. Clona il Repository

```bash
git clone <repository-url>
cd volantinoMix
```

### 2. Installa le Dipendenze Backend

```bash
cd backend
npm install
```

### 3. Configurazione Database

Crea un file `.env` nella cartella `backend/`:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/volantinomix
DB_NAME=volantinomix

# Server
PORT=3000
NODE_ENV=development

# Security
JWT_SECRET=your-super-secret-jwt-key
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# Google AdSense (opzionale)
ADSENSE_CLIENT_ID=ca-pub-xxxxxxxxxx
ADSENSE_SLOT_ID=xxxxxxxxxx
```

### 4. Avvia MongoDB

```bash
# Su macOS con Homebrew
brew services start mongodb-community

# Su Linux
sudo systemctl start mongod

# Su Windows
net start MongoDB
```

### 5. Avvia il Server Backend

```bash
cd backend
npm start
```

Il server sarà disponibile su `http://localhost:3000`

### 6. Configura il Frontend

Apri `frontend/index.html` in un browser o usa un server locale:

```bash
# Con Python
cd frontend
python -m http.server 8080

# Con Node.js (http-server)
npx http-server frontend -p 8080
```

Il frontend sarà disponibile su `http://localhost:8080`

## 🔧 Configurazione Google AdSense

### 1. Crea un Account AdSense

1. Vai su [Google AdSense](https://www.google.com/adsense/)
2. Crea un account e verifica il tuo sito
3. Ottieni il tuo Publisher ID (ca-pub-xxxxxxxxxx)

### 2. Configura gli Ad Units

1. Nel dashboard AdSense, crea nuovi ad units:
   - **Top Banner**: 728x90 (Leaderboard)
   - **Middle Rectangle**: 300x250 (Medium Rectangle)
   - **Bottom Banner**: 728x90 (Leaderboard)
   - **Sidebar**: 160x600 (Wide Skyscraper)

2. Copia gli slot ID per ogni ad unit

### 3. Aggiorna il Frontend

Modifica `frontend/index.html` con i tuoi dati AdSense:

```html
<!-- Sostituisci ca-pub-xxxxxxxxxx con il tuo Publisher ID -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-xxxxxxxxxx" crossorigin="anonymous"></script>

<!-- Aggiorna gli slot ID negli ins tags -->
<ins class="adsbygoogle"
     data-ad-client="ca-pub-xxxxxxxxxx"
     data-ad-slot="your-slot-id"></ins>
```

## 📱 Funzionalità Mobile

### PWA (Progressive Web App)

Il progetto include:
- Service Worker per caching
- Manifest per installazione
- Design responsive
- Touch-friendly interface

### Notifiche Push

1. Gli utenti possono attivare le notifiche cliccando l'icona 🔔
2. Il sistema invia notifiche per nuovi volantini
3. Funziona su desktop e mobile

## 🔌 API Endpoints

### Volantini

```
GET    /api/flyers              # Lista volantini
GET    /api/flyers/search       # Ricerca per CAP/coordinate
GET    /api/flyers/popular      # Volantini popolari
GET    /api/flyers/:id          # Dettagli volantino
POST   /api/flyers              # Crea nuovo volantino
```

### PDF

```
POST   /api/pdfs/upload         # Upload PDF
POST   /api/pdfs/merge          # Unifica volantini
GET    /api/pdfs/download/:id   # Download PDF
GET    /api/pdfs/preview/:id    # Preview PDF
```

### Pubblicità

```
GET    /api/ads                 # Lista pubblicità attive
GET    /api/ads/recommended     # Pubblicità consigliate
POST   /api/ads/:id/click       # Registra click
GET    /api/ads/stats           # Statistiche
```

## 🚀 Deploy in Produzione

### 1. Preparazione

```bash
# Aggiorna le variabili d'ambiente per produzione
NODE_ENV=production
MONGODB_URI=mongodb://your-production-db
PORT=80
```

### 2. Deploy su Server

```bash
# Copia i file sul server
scp -r volantinoMix/ user@server:/var/www/

# Installa dipendenze
cd /var/www/volantinoMix/backend
npm install --production

# Avvia con PM2
npm install -g pm2
pm2 start server.js --name "volantinomix"
pm2 startup
pm2 save
```

### 3. Configurazione Nginx

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    # Frontend
    location / {
        root /var/www/volantinoMix/frontend;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. SSL con Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## 🔍 Monitoraggio e Manutenzione

### Log del Sistema

```bash
# Visualizza log PM2
pm2 logs volantinomix

# Visualizza log MongoDB
sudo tail -f /var/log/mongodb/mongod.log

# Visualizza log Nginx
sudo tail -f /var/log/nginx/access.log
```

### Backup Database

```bash
# Backup
mongodump --db volantinomix --out /backup/$(date +%Y%m%d)

# Restore
mongorestore --db volantinomix /backup/20240115/volantinomix
```

### Aggiornamenti

```bash
# Aggiorna il codice
git pull origin main

# Riavvia l'applicazione
pm2 restart volantinomix

# Aggiorna dipendenze
npm update
```

## 🐛 Troubleshooting

### Problemi Comuni

1. **MongoDB non si connette**
   - Verifica che MongoDB sia in esecuzione
   - Controlla la stringa di connessione in `.env`
   - Verifica i permessi del database

2. **AdSense non mostra annunci**
   - Verifica che il Publisher ID sia corretto
   - Controlla che il sito sia approvato da AdSense
   - Assicurati che non ci siano ad blocker attivi

3. **Notifiche non funzionano**
   - Verifica che il sito sia servito via HTTPS
   - Controlla le impostazioni del browser
   - Verifica che il Service Worker sia registrato

4. **PDF non si generano**
   - Controlla i permessi della cartella `uploads/`
   - Verifica che ci sia spazio sufficiente sul disco
   - Controlla i log per errori specifici

### Debug Mode

```bash
# Avvia in modalità debug
DEBUG=* npm start

# Solo log dell'applicazione
DEBUG=volantinomix:* npm start
```

## 📄 Licenza

Questo progetto è rilasciato sotto licenza MIT. Vedi il file `LICENSE` per i dettagli.

## 🤝 Contributi

I contributi sono benvenuti! Per favore:

1. Fai un fork del progetto
2. Crea un branch per la tua feature (`git checkout -b feature/AmazingFeature`)
3. Commit le tue modifiche (`git commit -m 'Add some AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Apri una Pull Request

## 📞 Supporto

Per supporto e domande:
- Apri una issue su GitHub
- Contatta il team di sviluppo
- Consulta la documentazione API

---

**VolantinoMix** - La soluzione completa per la gestione e unificazione di volantini promozionali con monetizzazione integrata.