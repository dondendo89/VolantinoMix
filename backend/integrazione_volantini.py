#!/usr/bin/env python3
"""
Script di integrazione per caricare automaticamente i volantini scaricati
nel sistema VolantinoMix tramite API REST

Autore: VolantinoMix System
Data: 2025
"""

import os
import requests
import json
from datetime import datetime, timedelta
import time
from pathlib import Path
import re
from scraper_volantini import VolantiniScraper
from scraper_mersi import MersiVolantiniScraper

class VolantinoMixIntegrator:
    def __init__(self, api_base_url="http://localhost:5000/api", volantini_folder="volantini"):
        self.api_base_url = api_base_url
        self.volantini_folder = volantini_folder
        self.session = requests.Session()
        self.stats = {
            'processed': 0,
            'uploaded': 0,
            'errors': 0,
            'skipped': 0
        }
        
    def extract_store_info_from_filename(self, filename):
        """Estrae informazioni del negozio dal nome del file"""
        # Rimuove estensione e caratteri speciali
        name = Path(filename).stem.lower()
        
        # Mapping di pattern comuni per negozi
        store_patterns = {
            r'conad|coop': 'Conad',
            r'esselunga': 'Esselunga',
            r'carrefour': 'Carrefour',
            r'lidl': 'Lidl',
            r'eurospin': 'Eurospin',
            r'md|discount': 'MD Discount',
            r'iper|ipercoop': 'Ipercoop',
            r'pam|panorama': 'Pam',
            r'tigre|tigotà': 'Tigotà',
            r'acqua.*sapone': 'Acqua e Sapone',
            r'mediaworld|media.*world': 'MediaWorld',
            r'unieuro': 'Unieuro',
            r'trony': 'Trony',
            r'expert': 'Expert',
            r'decathlon': 'Decathlon',
            r'leroy.*merlin': 'Leroy Merlin',
            r'ikea': 'IKEA',
            r'obi': 'OBI'
        }
        
        # Cerca pattern nel nome file
        for pattern, store_name in store_patterns.items():
            if re.search(pattern, name):
                return store_name
        
        # Se non trova pattern, usa il nome file pulito
        return name.replace('_', ' ').replace('-', ' ').title()
    
    def determine_category_from_store(self, store_name):
        """Determina la categoria basandosi sul nome del negozio"""
        store_lower = store_name.lower()
        
        if any(word in store_lower for word in ['conad', 'coop', 'esselunga', 'carrefour', 'pam', 'iper']):
            return 'Supermercato'
        elif any(word in store_lower for word in ['lidl', 'eurospin', 'md', 'discount']):
            return 'Discount'
        elif any(word in store_lower for word in ['mediaworld', 'unieuro', 'trony', 'expert']):
            return 'Elettronica'
        elif any(word in store_lower for word in ['decathlon']):
            return 'Sport'
        elif any(word in store_lower for word in ['leroy', 'ikea', 'obi']):
            return 'Casa e Giardino'
        elif any(word in store_lower for word in ['tigotà', 'acqua']):
            return 'Farmacia'
        else:
            return 'Altro'
    
    def get_random_location(self):
        """Restituisce una posizione casuale italiana per test"""
        locations = [
            {'city': 'Milano', 'cap': '20100', 'lat': 45.4642, 'lng': 9.1900},
            {'city': 'Roma', 'cap': '00100', 'lat': 41.9028, 'lng': 12.4964},
            {'city': 'Napoli', 'cap': '80100', 'lat': 40.8518, 'lng': 14.2681},
            {'city': 'Torino', 'cap': '10100', 'lat': 45.0703, 'lng': 7.6869},
            {'city': 'Palermo', 'cap': '90100', 'lat': 38.1157, 'lng': 13.3615},
            {'city': 'Genova', 'cap': '16100', 'lat': 44.4056, 'lng': 8.9463},
            {'city': 'Bologna', 'cap': '40100', 'lat': 44.4949, 'lng': 11.3426},
            {'city': 'Firenze', 'cap': '50100', 'lat': 43.7696, 'lng': 11.2558},
            {'city': 'Bari', 'cap': '70100', 'lat': 41.1171, 'lng': 16.8719},
            {'city': 'Catania', 'cap': '95100', 'lat': 37.5079, 'lng': 15.0830},
            {'city': 'Venezia', 'cap': '30100', 'lat': 45.4408, 'lng': 12.3155},
            {'city': 'Verona', 'cap': '37100', 'lat': 45.4384, 'lng': 10.9916},
            {'city': 'Messina', 'cap': '98100', 'lat': 38.1938, 'lng': 15.5540},
            {'city': 'Padova', 'cap': '35100', 'lat': 45.4064, 'lng': 11.8768},
            {'city': 'Trieste', 'cap': '34100', 'lat': 45.6495, 'lng': 13.7768}
        ]
        
        import random
        location = random.choice(locations)
        return {
            'address': f'Via Roma {random.randint(1, 200)}',
            'city': location['city'],
            'cap': location['cap'],
            'coordinates': {
                'lat': location['lat'],
                'lng': location['lng']
            }
        }
    
    def upload_pdf_to_api(self, pdf_path, store_name, category, location):
        """Carica un PDF tramite l'API di upload"""
        try:
            upload_url = f"{self.api_base_url}/pdfs/upload"
            
            # Prepara i dati del form
            files = {
                'pdfs': (os.path.basename(pdf_path), open(pdf_path, 'rb'), 'application/pdf')
            }
            
            data = {
                'store': store_name,
                'category': category,
                'location.cap': location['cap']
            }
            
            print(f"📤 Caricando {os.path.basename(pdf_path)} per {store_name} ({category})...")
            
            response = self.session.post(upload_url, files=files, data=data, timeout=30)
            
            # Chiudi il file
            files['pdfs'][1].close()
            
            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    data = result.get('data', {})
                    uploaded_count = data.get('totalUploaded', 0)
                    flyers_count = data.get('totalFlyersCreated', 0)
                    duplicates_count = data.get('totalDuplicatesSkipped', 0)
                    
                    if flyers_count > 0:
                        print(f"✅ Upload completato: {flyers_count} volantini creati")
                        self.stats['uploaded'] += 1
                    
                    if duplicates_count > 0:
                        print(f"⚠️ {duplicates_count} duplicati saltati")
                        self.stats['duplicates'] = self.stats.get('duplicates', 0) + duplicates_count
                    
                    return flyers_count > 0
                else:
                    print(f"❌ Errore API: {result.get('message', 'Errore sconosciuto')}")
                    return False
            else:
                print(f"❌ Errore HTTP {response.status_code}: {response.text}")
                return False
                
        except requests.RequestException as e:
            print(f"❌ Errore di connessione: {e}")
            return False
        except Exception as e:
            print(f"❌ Errore generico: {e}")
            return False
    
    def create_flyer_via_api(self, pdf_url, store_name, category, location, pages=1, file_size="1 MB"):
        """Crea un volantino direttamente tramite l'API dei volantini"""
        try:
            flyers_url = f"{self.api_base_url}/volantini"
            
            # Calcola date di validità (30 giorni da oggi)
            valid_from = datetime.now()
            valid_to = valid_from + timedelta(days=30)
            
            flyer_data = {
                'store': store_name,
                'location': location,
                'validFrom': valid_from.isoformat(),
                'validTo': valid_to.isoformat(),
                'pages': pages,
                'category': category,
                'pdfUrl': pdf_url,
                'fileSize': file_size
            }
            
            print(f"📝 Creando volantino per {store_name} ({category})...")
            
            response = self.session.post(flyers_url, json=flyer_data, timeout=30)
            
            if response.status_code in [200, 201]:
                result = response.json()
                if result.get('success'):
                    flyer_id = result.get('data', {}).get('_id')
                    print(f"✅ Volantino creato con ID: {flyer_id}")
                    return True
                else:
                    print(f"❌ Errore API: {result.get('message', 'Errore sconosciuto')}")
                    return False
            else:
                print(f"❌ Errore HTTP {response.status_code}: {response.text}")
                return False
                
        except requests.RequestException as e:
            print(f"❌ Errore di connessione: {e}")
            return False
        except Exception as e:
            print(f"❌ Errore generico: {e}")
            return False
    
    def process_downloaded_pdfs(self):
        """Elabora tutti i PDF scaricati e li carica nel sistema"""
        if not os.path.exists(self.volantini_folder):
            print(f"❌ Cartella {self.volantini_folder} non trovata")
            return
        
        pdf_files = [f for f in os.listdir(self.volantini_folder) if f.lower().endswith('.pdf')]
        
        if not pdf_files:
            print(f"⚠️  Nessun PDF trovato in {self.volantini_folder}")
            return
        
        print(f"📁 Trovati {len(pdf_files)} PDF da elaborare")
        print("-" * 50)
        
        for pdf_file in pdf_files:
            self.stats['processed'] += 1
            pdf_path = os.path.join(self.volantini_folder, pdf_file)
            
            try:
                # Estrai informazioni dal nome file
                store_name = self.extract_store_info_from_filename(pdf_file)
                category = self.determine_category_from_store(store_name)
                location = self.get_random_location()
                
                # Ottieni dimensione file
                file_size_bytes = os.path.getsize(pdf_path)
                if file_size_bytes < 1024:
                    file_size = f"{file_size_bytes} Bytes"
                elif file_size_bytes < 1024 * 1024:
                    file_size = f"{file_size_bytes / 1024:.1f} KB"
                else:
                    file_size = f"{file_size_bytes / (1024 * 1024):.1f} MB"
                
                print(f"\n📄 Elaborando: {pdf_file}")
                print(f"   🏪 Negozio: {store_name}")
                print(f"   🏷️  Categoria: {category}")
                print(f"   📍 Località: {location['city']} ({location['cap']})")
                print(f"   📊 Dimensione: {file_size}")
                
                # Prova prima l'upload diretto (che crea automaticamente il volantino)
                success = self.upload_pdf_to_api(pdf_path, store_name, category, location)
                
                if success:
                    self.stats['uploaded'] += 1
                else:
                    self.stats['errors'] += 1
                
                # Pausa tra i caricamenti
                time.sleep(2)
                
            except Exception as e:
                print(f"❌ Errore nell'elaborazione di {pdf_file}: {e}")
                self.stats['errors'] += 1
        
        self.print_integration_summary()
    
    def print_integration_summary(self):
        """Stampa il riepilogo dell'integrazione"""
        print("\n" + "=" * 50)
        print("📊 RIEPILOGO INTEGRAZIONE")
        print("=" * 50)
        print(f"📄 PDF elaborati: {self.stats['processed']}")
        print(f"✅ PDF caricati con successo: {self.stats['uploaded']}")
        print(f"⏭️  PDF saltati: {self.stats['skipped']}")
        print(f"⚠️ Duplicati saltati: {self.stats.get('duplicates', 0)}")
        print(f"❌ Errori: {self.stats['errors']}")
        print(f"🌐 API endpoint: {self.api_base_url}")
        
        # Salva statistiche
        stats_file = os.path.join(self.volantini_folder, 'integration_stats.json')
        with open(stats_file, 'w', encoding='utf-8') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'stats': self.stats,
                'api_base_url': self.api_base_url
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n💾 Statistiche salvate in: {stats_file}")
    
    def test_api_connection(self):
        """Testa la connessione all'API"""
        try:
            health_url = f"{self.api_base_url.replace('/api', '')}/health"
            response = self.session.get(health_url, timeout=5)
            
            if response.status_code == 200:
                print("✅ Connessione API attiva")
                return True
            else:
                print(f"⚠️  API risponde con status {response.status_code}")
                return False
                
        except requests.RequestException as e:
            print(f"❌ Impossibile connettersi all'API: {e}")
            return False

def run_complete_workflow():
    """Esegue il workflow completo: scraping + integrazione"""
    print("🚀 AVVIO WORKFLOW COMPLETO VOLANTINOMIX")
    print("=" * 50)
    
    # Fase 1: Scraping
    print("\n📡 FASE 1: SCRAPING VOLANTINI")
    print("-" * 30)
    
    scraper = VolantiniScraper()
    scraper.scrape_site(max_pages=3)  # Limita a 3 pagine per test

    # Scraping MerSi
    print("\n📡 FASE: Scraping MerSi Supermercati")
    mersi_scraper = MersiVolantiniScraper()
    mersi_scraper.run()
    
    # Fase 2: Integrazione
    print("\n🔗 FASE 2: INTEGRAZIONE CON VOLANTINOMIX")
    print("-" * 40)
    
    integrator = VolantinoMixIntegrator()
    
    # Testa connessione API
    if not integrator.test_api_connection():
        print("❌ Impossibile procedere senza connessione API")
        return
    
    # Elabora i PDF scaricati
    integrator.process_downloaded_pdfs()
    
    print("\n🎉 WORKFLOW COMPLETATO!")

def main():
    """Funzione principale"""
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == '--full':
        # Workflow completo
        run_complete_workflow()
    else:
        # Solo integrazione
        print("🔗 INTEGRAZIONE VOLANTINI CON VOLANTINOMIX")
        print("=" * 45)
        
        integrator = VolantinoMixIntegrator()
        
        if integrator.test_api_connection():
            integrator.process_downloaded_pdfs()
        else:
            print("❌ Assicurati che il server VolantinoMix sia in esecuzione")

if __name__ == "__main__":
    main()