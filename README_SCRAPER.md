# VolantinoMix - Sistema di Scraping Automatico

Questo sistema permette di scaricare automaticamente volantini PDF da siti web e integrarli nel database VolantinoMix.

## 📋 Requisiti

- Python 3.9 o superiore
- MongoDB in esecuzione
- Server VolantinoMix attivo (porta 5000)

## 🚀 Installazione

1. **Installa le dipendenze Python:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Verifica che il server VolantinoMix sia attivo:**
   ```bash
   curl http://localhost:5000/health
   ```

## 📖 Utilizzo

### Opzione 1: Solo Scraping

Per scaricare solo i volantini senza caricarli nel database:

```bash
python3 scraper_volantini.py
```

Questo script:
- Analizza il sito ultimivolantini.it
- Cerca tutti i link PDF
- Scarica i volantini nella cartella `volantini/`
- Evita duplicati tramite hash MD5
- Genera statistiche in `volantini/scraping_stats.json`

### Opzione 2: Solo Integrazione

Per caricare PDF già scaricati nel sistema VolantinoMix:

```bash
python3 integrazione_volantini.py
```

Questo script:
- Legge tutti i PDF dalla cartella `volantini/`
- Estrae informazioni dal nome file (negozio, categoria)
- Carica i PDF tramite API REST
- Crea automaticamente i volantini nel database

### Opzione 3: Workflow Completo

Per eseguire scraping + integrazione in un'unica operazione:

```bash
python3 integrazione_volantini.py --full
```

## 📁 Struttura File

```
volantinoMix/
├── scraper_volantini.py          # Script di scraping
├── integrazione_volantini.py     # Script di integrazione
├── requirements.txt              # Dipendenze Python
├── README_SCRAPER.md            # Questa documentazione
└── volantini/                   # Cartella PDF scaricati
    ├── *.pdf                    # File PDF scaricati
    ├── scraping_stats.json      # Statistiche scraping
    └── integration_stats.json   # Statistiche integrazione
```

## ⚙️ Configurazione

### Personalizzazione Scraper

Modifica `scraper_volantini.py` per:

```python
# Cambiare sito target
scraper = VolantiniScraper(
    base_url="https://altro-sito.it",
    download_folder="miei_volantini"
)

# Limitare numero di pagine
scraper.scrape_site(max_pages=10)
```

### Personalizzazione Integrazione

Modifica `integrazione_volantini.py` per:

```python
# Cambiare endpoint API
integrator = VolantinoMixIntegrator(
    api_base_url="http://localhost:8080/api",
    volantini_folder="miei_volantini"
)
```

## 🏪 Riconoscimento Automatico Negozi

Il sistema riconosce automaticamente questi negozi dai nomi file:

- **Supermercati:** Conad, Coop, Esselunga, Carrefour, Pam, Ipercoop
- **Discount:** Lidl, Eurospin, MD Discount
- **Elettronica:** MediaWorld, Unieuro, Trony, Expert
- **Sport:** Decathlon
- **Casa e Giardino:** Leroy Merlin, IKEA, OBI
- **Farmacia:** Tigotà, Acqua e Sapone

## 📍 Gestione Posizioni

Il sistema assegna automaticamente posizioni casuali italiane per test.
Per usare posizioni reali, modifica la funzione `get_random_location()` in `integrazione_volantini.py`.

## 🔧 Risoluzione Problemi

### Errore "Connessione API fallita"

1. Verifica che il server sia attivo:
   ```bash
   curl http://localhost:5000/health
   ```

2. Controlla i log del server backend

3. Verifica che MongoDB sia in esecuzione:
   ```bash
   brew services list | grep mongodb
   ```

### Errore "Nessun PDF trovato"

1. Il sito potrebbe aver cambiato struttura
2. Modifica i selettori CSS in `extract_pdf_links()`
3. Aggiungi debug per vedere la struttura HTML:
   ```python
   print(soup.prettify())
   ```

### Errore "Validazione fallita"

1. Controlla il formato dei dati nel modello `Volantino.js`
2. Verifica che i campi obbligatori siano presenti
3. Controlla i log del server per dettagli

## 📊 Monitoraggio

### Statistiche Scraping

File: `volantini/scraping_stats.json`
```json
{
  "timestamp": "2025-01-18T12:00:00",
  "stats": {
    "found": 25,
    "downloaded": 20,
    "skipped": 3,
    "errors": 2
  }
}
```

### Statistiche Integrazione

File: `volantini/integration_stats.json`
```json
{
  "timestamp": "2025-01-18T12:05:00",
  "stats": {
    "processed": 20,
    "uploaded": 18,
    "errors": 2
  }
}
```

## 🔄 Automazione

Per eseguire automaticamente ogni giorno:

### macOS/Linux (crontab)

```bash
# Modifica crontab
crontab -e

# Aggiungi questa riga per esecuzione giornaliera alle 6:00
0 6 * * * cd /path/to/volantinoMix && python3 integrazione_volantini.py --full
```

### Alternativa con script bash

Crea `auto_update.sh`:
```bash
#!/bin/bash
cd /path/to/volantinoMix
python3 integrazione_volantini.py --full
echo "Aggiornamento completato: $(date)" >> update.log
```

## 🛡️ Sicurezza

- Lo scraper rispetta i rate limit (1 secondo tra download)
- User-Agent realistico per evitare blocchi
- Gestione errori per connessioni instabili
- Validazione file PDF prima del caricamento

## 📝 Log

Tutti gli script producono log dettagliati:
- ✅ Operazioni completate
- ⚠️ Warning e situazioni anomale  
- ❌ Errori con dettagli
- 📊 Statistiche finali

## 🤝 Contributi

Per aggiungere supporto per altri siti:

1. Estendi la classe `VolantiniScraper`
2. Modifica `extract_pdf_links()` per il nuovo sito
3. Aggiungi pattern di riconoscimento negozi
4. Testa con `max_pages=1` prima del deploy

## 📞 Supporto

Per problemi o miglioramenti, controlla:
1. Log degli script
2. Log del server VolantinoMix
3. Stato di MongoDB
4. Connettività di rete