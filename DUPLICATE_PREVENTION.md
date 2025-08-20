# Sistema di Prevenzione Duplicati - VolantinoMix

## Panoramica

Il sistema di prevenzione duplicati è stato implementato per evitare l'importazione di volantini duplicati nel database. Il sistema funziona automaticamente durante l'upload e offre anche API per il controllo manuale.

## Funzionalità Implementate

### 1. Controllo Automatico Durante l'Upload

#### Endpoint `/api/pdfs/upload`
- **Controllo automatico**: Verifica duplicati prima di salvare
- **Criteri di duplicazione**:
  - Stesso `store` + `category` + (`pdfUrl` OR `pdfPath`)
  - Sovrapposizione date (`validFrom` e `validTo`)
  - Hash del file (opzionale)
- **Azione**: Salta automaticamente i duplicati
- **Risposta**: Include conteggio duplicati saltati

#### Endpoint `/api/eurospin/upload`
- **Controllo automatico**: Verifica duplicati per volantini Eurospin
- **Criteri**: Stessi del sistema generale
- **Azione**: Restituisce errore se duplicato trovato

### 2. Aggiornamento Script di Scraping

#### Script Python Aggiornati
- `scraper_deco.py`: Gestisce duplicati saltati
- `scraper_eurospin.py`: Gestisce duplicati saltati
- `integrazione_volantini.py`: Gestisce duplicati saltati
- **Statistiche**: Tutti gli script mostrano duplicati saltati nel riepilogo

### 3. API per Controllo Manuale

#### `GET /api/duplicates/stats`
Ottieni statistiche sui duplicati nel database:
```json
{
  "success": true,
  "data": {
    "totalFlyers": 20,
    "totalPotentialDuplicates": 20,
    "sourceDistribution": [...],
    "potentialDuplicateGroups": 5,
    "potentialDuplicates": [...]
  }
}
```

#### `POST /api/duplicates/check`
Controlla se un volantino è duplicato:
```json
{
  "store": "Ipercoop",
  "category": "Supermercato",
  "pdfUrl": "https://example.com/flyer.pdf",
  "checkDateOverlap": true,
  "checkFileHash": false
}
```

#### `POST /api/duplicates/check-with-action`
Controlla duplicati e suggerisce azione:
```json
{
  "store": "Deco",
  "category": "Supermercato",
  "pdfUrl": "https://example.com/flyer.pdf",
  "autoSkip": true
}
```

#### `DELETE /api/duplicates/remove`
Rimuovi duplicati dal database:
```json
{
  "dryRun": true,
  "keepNewest": false
}
```

## Criteri di Duplicazione

### Criteri Primari
1. **Store + Category + URL/Path**: Stesso negozio, categoria e URL/percorso PDF
2. **Sovrapposizione Date**: Date di validità che si sovrappongono
3. **Hash File**: Confronto hash del contenuto del file (opzionale)

### Logica di Mantenimento
- **Default**: Mantiene il volantino più vecchio (primo caricato)
- **Opzionale**: Può mantenere il più recente con `keepNewest: true`

## Configurazione

### Opzioni Disponibili

```javascript
const options = {
  autoSkip: true,           // Salta automaticamente i duplicati
  autoReplace: false,       // Sostituisce automaticamente i duplicati
  checkFileHash: false,     // Controlla hash del file
  checkDateOverlap: true,   // Controlla sovrapposizione date
  strictMode: false         // Modalità rigorosa
};
```

### Personalizzazione

Per modificare i criteri di duplicazione, edita il file:
`backend/utils/duplicateChecker.js`

## Utilizzo

### 1. Upload Automatico
Tutti gli upload tramite API includono automaticamente il controllo duplicati.

### 2. Scraping
Tutti gli script di scraping gestiscono automaticamente i duplicati:
```bash
# Scraping Deco
python3 scraper_deco.py

# Scraping Eurospin
python3 scraper_eurospin.py

# Integrazione volantini
python3 integrazione_volantini.py
```

### 3. Controllo Manuale
```bash
# Test del sistema
node test_duplicates.js

# Rimozione duplicati esistenti
node remove_duplicates.js
```

### 4. API Testing
```bash
# Statistiche
curl -X GET http://localhost:5000/api/duplicates/stats

# Controllo duplicato
curl -X POST http://localhost:5000/api/duplicates/check \
  -H "Content-Type: application/json" \
  -d '{"store":"Ipercoop","category":"Supermercato","pdfUrl":"https://example.com/test.pdf"}'
```

## Monitoraggio

### Log di Sistema
- Upload con duplicati saltati vengono loggati
- Statistiche disponibili tramite API
- Script di test per verificare funzionamento

### Metriche Disponibili
- Volantini totali nel database
- Duplicati potenziali identificati
- Distribuzione per source (deco, ipercoop, eurospin, etc.)
- Gruppi di duplicati

## Risoluzione Problemi

### Problemi Comuni

1. **Duplicati non rilevati**
   - Verificare criteri di duplicazione
   - Controllare formato date
   - Verificare URL/percorsi PDF

2. **Troppi falsi positivi**
   - Disabilitare `checkDateOverlap`
   - Abilitare `strictMode`
   - Modificare criteri in `duplicateChecker.js`

3. **Performance lente**
   - Disabilitare `checkFileHash`
   - Ottimizzare query database
   - Aggiungere indici MongoDB

### Debug

```bash
# Test completo del sistema
node test_duplicates.js

# Controllo stato database
node -e "require('./utils/duplicateChecker').checkForDuplicates({store:'Test',category:'Test'})"
```

## File Modificati

### Backend
- `utils/duplicateChecker.js` - Utility principale
- `routes/pdfs.js` - Endpoint upload PDF
- `routes/eurospin.js` - Endpoint Eurospin
- `routes/duplicates.js` - API controllo duplicati
- `server.js` - Registrazione router
- `remove_duplicates.js` - Script rimozione
- `test_duplicates.js` - Script test

### Script Python
- `scraper_deco.py` - Scraper Deco aggiornato
- `scraper_eurospin.py` - Scraper Eurospin aggiornato
- `integrazione_volantini.py` - Integrazione aggiornata

## Conclusioni

Il sistema di prevenzione duplicati è ora completamente operativo e integrato in tutti i punti di ingresso dei dati. Il sistema:

✅ **Previene automaticamente** l'importazione di duplicati
✅ **Fornisce API** per controllo manuale
✅ **Include statistiche** e monitoraggio
✅ **È configurabile** e personalizzabile
✅ **È testato** e verificato

Per supporto o modifiche, consultare il codice in `backend/utils/duplicateChecker.js` o utilizzare le API di test disponibili.