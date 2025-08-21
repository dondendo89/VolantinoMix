# VolantinoMix - Guida al Deploy

Questa guida ti aiuterà a deployare VolantinoMix su piattaforme cloud gratuite.

## 🏗️ Architettura

- **Frontend**: Vercel (hosting statico)
- **Backend**: Railway (Node.js + MongoDB)
- **Database**: MongoDB Atlas (gratuito)

## 📋 Prerequisiti

1. Account GitHub
2. Account Vercel
3. Account Railway
4. Account MongoDB Atlas

## 🚀 Deploy Backend su Railway

### 1. Preparazione

1. Assicurati che tutti i file siano committati su GitHub
2. Il backend include già:
   - `Dockerfile` per containerizzazione
   - `railway.json` per configurazione
   - `.env.example` con variabili d'ambiente

### 2. Deploy su Railway

1. Vai su [railway.app](https://railway.app)
2. Accedi con GitHub
3. Clicca "New Project" → "Deploy from GitHub repo"
4. Seleziona il repository VolantinoMix
5. Seleziona la cartella `backend`
6. Railway rileverà automaticamente il Dockerfile

### 3. Configurazione Variabili d'Ambiente

Nel dashboard Railway, vai su "Variables" e aggiungi:

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/volantinomix
FRONTEND_URL=https://your-vercel-app.vercel.app
JWT_SECRET=your-super-secret-jwt-key-here
SESSION_SECRET=your-session-secret-here
```

### 4. Setup MongoDB Atlas

1. Vai su [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Crea un account gratuito
3. Crea un nuovo cluster (M0 Sandbox - gratuito)
4. Crea un database user
5. Configura Network Access (aggiungi 0.0.0.0/0 per accesso da ovunque)
6. Ottieni la connection string e aggiornala in Railway

## 🌐 Deploy Frontend su Vercel

### 1. Preparazione

Il frontend include già:
- `vercel.json` per configurazione routing
- `config.js` per gestione dinamica degli URL

### 2. Deploy su Vercel

1. Vai su [vercel.com](https://vercel.com)
2. Accedi con GitHub
3. Clicca "New Project"
4. Seleziona il repository VolantinoMix
5. Configura:
   - **Framework Preset**: Other
   - **Root Directory**: `frontend`
   - **Build Command**: (lascia vuoto)
   - **Output Directory**: (lascia vuoto)

### 3. Configurazione Variabili d'Ambiente

Nel dashboard Vercel, vai su "Settings" → "Environment Variables":

```env
BACKEND_URL=https://your-railway-app.railway.app
```

### 4. Aggiorna configurazione

Dopo il deploy, aggiorna il file `config.js` con l'URL corretto del backend:

```javascript
// Sostituisci 'https://volantinomix-backend.railway.app' con il tuo URL Railway
return 'https://your-actual-railway-url.railway.app';
```

## 🔧 Configurazione CORS

Nel backend, aggiorna `server.js` per includere il dominio Vercel:

```javascript
const corsOptions = {
    origin: [
        'http://localhost:3000',
        'https://your-vercel-app.vercel.app'
    ],
    // ... resto della configurazione
};
```

## 📱 Google AdSense

1. Vai su [Google AdSense](https://www.google.com/adsense/)
2. Aggiungi il tuo sito Vercel
3. Aggiorna il client ID in tutti i file HTML:
   ```html
   <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-YOUR-CLIENT-ID"></script>
   ```

## 🧪 Test del Deploy

1. **Backend**: Testa `https://your-railway-app.railway.app/health`
2. **Frontend**: Visita il tuo sito Vercel
3. **Database**: Verifica la connessione nei log Railway
4. **CORS**: Testa le chiamate API dal frontend

## 📊 Monitoraggio

- **Railway**: Dashboard per log e metriche backend
- **Vercel**: Analytics e log frontend
- **MongoDB Atlas**: Monitoring database

## 🆓 Limiti Gratuiti

### Vercel (Frontend)
- 100GB bandwidth/mese
- Deploy illimitati
- Dominio personalizzato gratuito

### Railway (Backend)
- $5 di credito gratuito/mese
- ~500 ore di runtime
- 1GB RAM, 1 vCPU

### MongoDB Atlas
- 512MB storage
- Connessioni limitate
- Backup automatici

## 🔄 Aggiornamenti

Per aggiornare:
1. Fai push su GitHub
2. Vercel si aggiorna automaticamente
3. Railway si aggiorna automaticamente (se configurato)

## 🆘 Troubleshooting

### Errori Comuni

1. **CORS Error**: Verifica corsOptions nel backend
2. **Database Connection**: Controlla MONGODB_URI
3. **404 su API**: Verifica BACKEND_URL nel frontend
4. **Build Failed**: Controlla log in Railway/Vercel

### Log e Debug

- Railway: Dashboard → Deployments → View Logs
- Vercel: Dashboard → Functions → View Function Logs
- Browser: Console per errori frontend

## 📞 Supporto

Se hai problemi:
1. Controlla i log delle piattaforme
2. Verifica le variabili d'ambiente
3. Testa le API con Postman/curl
4. Controlla la documentazione ufficiale delle piattaforme