#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scraper per Supermercati Decò - Gruppo Arena
Scarica automaticamente i volantini PDF e li integra in VolantinoMix

Compatibile con Python 3.9+
Autore: VolantinoMix Team
"""

import requests
from bs4 import BeautifulSoup
import os
import hashlib
import json
import time
from urllib.parse import urljoin, urlparse
from pathlib import Path
import re
from datetime import datetime

class DecoVolantiniScraper:
    def __init__(self, download_folder="volantini_deco", api_base_url=None):
        # Auto-detect API URL based on environment
        if api_base_url is None:
            port = os.environ.get('PORT', '3000')
            api_base_url = f'http://localhost:{port}/api'
        self.base_url = "https://supermercatideco.gruppoarena.it"
        self.volantini_url = "https://supermercatideco.gruppoarena.it/volantini/"
        self.download_folder = Path(download_folder)
        self.api_base_url = api_base_url
        self.session = requests.Session()
        
        # Headers per evitare blocchi
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        })
        
        # Crea cartella download
        self.download_folder.mkdir(exist_ok=True)
        
        # Statistiche
        self.stats = {
            'found': 0,
            'downloaded': 0,
            'skipped': 0,
            'errors': 0,
            'uploaded': 0
        }
    
    def get_file_hash(self, file_path):
        """Calcola hash MD5 del file per evitare duplicati"""
        hash_md5 = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    
    def extract_pdf_links(self, soup, base_url):
        """Estrae tutti i link PDF dalla pagina dei volantini Decò"""
        pdf_links = set()
        
        print("🔍 Analizzando la struttura della pagina...")
        
        # Cerca tutti i link che potrebbero contenere PDF
        for link in soup.find_all('a', href=True):
            href = link['href']
            
            # Link diretti a PDF
            if href.lower().endswith('.pdf'):
                if href.startswith('http'):
                    pdf_links.add(href)
                else:
                    pdf_links.add(urljoin(base_url, href))
            
            # Link che potrebbero portare a pagine con PDF
            elif any(keyword in href.lower() for keyword in ['volantino', 'promozioni', 'offerte']):
                if href.startswith('http'):
                    page_url = href
                elif href.startswith('/'):
                    page_url = urljoin(base_url, href)
                else:
                    continue
                
                # Analizza la pagina del volantino
                try:
                    print(f"📄 Analizzando pagina volantino: {page_url}")
                    response = self.session.get(page_url, timeout=10)
                    if response.status_code == 200:
                        vol_soup = BeautifulSoup(response.content, 'html.parser')
                        
                        # Cerca PDF in questa pagina
                        for pdf_link in vol_soup.find_all('a', href=True):
                            pdf_href = pdf_link['href']
                            if pdf_href.lower().endswith('.pdf'):
                                if pdf_href.startswith('http'):
                                    pdf_links.add(pdf_href)
                                else:
                                    pdf_links.add(urljoin(page_url, pdf_href))
                        
                        # Cerca anche nei tag iframe (spesso usati per PDF)
                        for iframe in vol_soup.find_all('iframe', src=True):
                            iframe_src = iframe['src']
                            if iframe_src.lower().endswith('.pdf'):
                                if iframe_src.startswith('http'):
                                    pdf_links.add(iframe_src)
                                else:
                                    pdf_links.add(urljoin(page_url, iframe_src))
                    
                    time.sleep(1)  # Rate limiting
                except Exception as e:
                    print(f"⚠️  Errore analizzando {page_url}: {e}")
                    continue
        
        # Cerca anche nei meta tag e script per PDF embedded
        for meta in soup.find_all('meta', content=True):
            content = meta.get('content', '')
            if content.lower().endswith('.pdf'):
                if content.startswith('http'):
                    pdf_links.add(content)
                else:
                    pdf_links.add(urljoin(base_url, content))
        
        return list(pdf_links)
    
    def download_pdf(self, pdf_url, filename=None):
        """Scarica un singolo PDF"""
        try:
            if not filename:
                # Estrae nome file dall'URL
                parsed_url = urlparse(pdf_url)
                filename = os.path.basename(parsed_url.path)
                if not filename or not filename.endswith('.pdf'):
                    # Genera nome file basato su URL e timestamp
                    filename = f"deco_volantino_{int(time.time())}.pdf"
            
            # Assicura che il nome file sia valido
            filename = re.sub(r'[^\w\-_\.]', '_', filename)
            if not filename.endswith('.pdf'):
                filename += '.pdf'
            
            file_path = self.download_folder / filename
            
            # Controlla se il file esiste già
            if file_path.exists():
                print(f"⏭️  File già esistente: {filename}")
                self.stats['skipped'] += 1
                return str(file_path)
            
            print(f"📥 Scaricando: {filename}")
            response = self.session.get(pdf_url, timeout=30)
            response.raise_for_status()
            
            # Verifica che sia effettivamente un PDF
            if not response.content.startswith(b'%PDF'):
                print(f"⚠️  File non è un PDF valido: {filename}")
                self.stats['errors'] += 1
                return None
            
            # Salva il file
            with open(file_path, 'wb') as f:
                f.write(response.content)
            
            print(f"✅ Scaricato: {filename} ({len(response.content)} bytes)")
            self.stats['downloaded'] += 1
            return str(file_path)
            
        except Exception as e:
            print(f"❌ Errore scaricando {pdf_url}: {e}")
            self.stats['errors'] += 1
            return None
    
    def extract_store_info(self, filename, pdf_url):
        """Estrae informazioni del negozio dal nome file o URL"""
        filename_lower = filename.lower()
        url_lower = pdf_url.lower()
        
        # Determina il tipo di negozio Decò
        if any(keyword in filename_lower or keyword in url_lower for keyword in ['iperstore', 'superstore']):
            store_type = 'Iperstore/Superstore Decò'
        elif any(keyword in filename_lower or keyword in url_lower for keyword in ['gourmet']):
            store_type = 'Decò Gourmet'
        elif any(keyword in filename_lower or keyword in url_lower for keyword in ['lipari']):
            store_type = 'Decò Lipari'
        else:
            store_type = 'Supermercato Decò'
        
        return {
            'store': store_type,
            'category': 'Supermercato',
            'cap': '90100'  # CAP generico Sicilia (Gruppo Arena è siciliano)
        }
    
    def upload_to_volantinomix(self, file_path, store_info):
        """Carica il PDF nel sistema VolantinoMix"""
        try:
            upload_url = f"{self.api_base_url}/pdfs/upload"
            
            with open(file_path, 'rb') as f:
                files = {'pdfs': (os.path.basename(file_path), f, 'application/pdf')}
                data = {
                    'store': store_info['store'],
                    'category': store_info['category'],
                    'location.cap': store_info['cap']
                }
                
                response = self.session.post(upload_url, files=files, data=data, timeout=30)
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('success'):
                        data = result.get('data', {})
                        uploaded_files = data.get('uploadedFiles', [])
                        created_flyers = data.get('totalFlyersCreated', 0)
                        skipped_duplicates = data.get('totalDuplicatesSkipped', 0)
                        
                        if created_flyers > 0:
                            print(f"✅ Upload completato: {created_flyers} volantini creati")
                            self.stats['uploaded'] += 1
                        
                        if skipped_duplicates > 0:
                            print(f"⚠️ {skipped_duplicates} duplicati saltati")
                            self.stats['duplicates'] = self.stats.get('duplicates', 0) + skipped_duplicates
                        
                        return created_flyers > 0  # Ritorna True solo se sono stati creati volantini
                    else:
                        print(f"❌ Upload fallito: {result.get('message', 'Errore sconosciuto')}")
                        return False
                else:
                    print(f"❌ Errore HTTP {response.status_code}: {response.text}")
                    return False
                    
        except Exception as e:
            print(f"❌ Errore upload: {e}")
            return False
    
    def scrape_and_upload(self):
        """Processo completo: scraping + upload"""
        print("🏪 SCRAPER SUPERMERCATI DECÒ - GRUPPO ARENA")
        print("=" * 50)
        print(f"🌐 URL target: {self.volantini_url}")
        print(f"📁 Cartella download: {self.download_folder}")
        print(f"🔗 API VolantinoMix: {self.api_base_url}")
        print("-" * 50)
        
        try:
            # Verifica connessione API
            health_response = self.session.get(f"{self.api_base_url.replace('/api', '')}/health", timeout=5)
            if health_response.status_code != 200:
                print("❌ API VolantinoMix non raggiungibile")
                return
            print("✅ Connessione API attiva")
            
            # Scarica la pagina principale
            print(f"🔍 Analizzando: {self.volantini_url}")
            response = self.session.get(self.volantini_url, timeout=10)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Estrae i link PDF
            pdf_links = self.extract_pdf_links(soup, self.base_url)
            self.stats['found'] = len(pdf_links)
            
            print(f"📊 Totale PDF trovati: {len(pdf_links)}")
            
            if not pdf_links:
                print("⚠️  Nessun PDF trovato sul sito")
                return
            
            print("-" * 50)
            
            # Scarica e carica ogni PDF
            for i, pdf_url in enumerate(pdf_links, 1):
                print(f"\n📄 Elaborando PDF {i}/{len(pdf_links)}: {pdf_url}")
                
                # Scarica il PDF
                file_path = self.download_pdf(pdf_url)
                if not file_path:
                    continue
                
                # Estrae informazioni negozio
                filename = os.path.basename(file_path)
                store_info = self.extract_store_info(filename, pdf_url)
                
                print(f"   🏪 Negozio: {store_info['store']}")
                print(f"   🏷️  Categoria: {store_info['category']}")
                print(f"   📍 CAP: {store_info['cap']}")
                
                # Carica nel sistema VolantinoMix
                print(f"📤 Caricando {filename} per {store_info['store']}...")
                self.upload_to_volantinomix(file_path, store_info)
                
                # Rate limiting
                time.sleep(2)
            
        except Exception as e:
            print(f"❌ Errore durante lo scraping: {e}")
            self.stats['errors'] += 1
        
        finally:
            self.print_summary()
    
    def print_summary(self):
        """Stampa il riepilogo delle operazioni"""
        print("\n" + "=" * 50)
        print("📊 RIEPILOGO SCRAPING DECÒ")
        print("=" * 50)
        print(f"🔍 PDF trovati: {self.stats['found']}")
        print(f"📥 PDF scaricati: {self.stats['downloaded']}")
        print(f"⏭️  PDF saltati (già esistenti): {self.stats['skipped']}")
        print(f"📤 PDF caricati in VolantinoMix: {self.stats['uploaded']}")
        print(f"⚠️  Duplicati saltati: {self.stats.get('duplicates', 0)}")
        print(f"❌ Errori: {self.stats['errors']}")
        print(f"🌐 API endpoint: {self.api_base_url}")
        
        # Salva statistiche
        stats_file = self.download_folder / 'deco_scraping_stats.json'
        stats_data = {
            'timestamp': datetime.now().isoformat(),
            'stats': self.stats,
            'source': 'Supermercati Decò - Gruppo Arena',
            'url': self.volantini_url
        }
        
        with open(stats_file, 'w', encoding='utf-8') as f:
            json.dump(stats_data, f, indent=2, ensure_ascii=False)
        
        print(f"💾 Statistiche salvate in: {stats_file}")

def main():
    """Funzione principale"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Scraper Supermercati Decò per VolantinoMix')
    parser.add_argument('--folder', default='volantini_deco', help='Cartella di download (default: volantini_deco)')
    # Auto-detect API URL based on environment
    default_port = os.environ.get('PORT', '3000')
    default_api = f'http://localhost:{default_port}/api'
    parser.add_argument('--api', default=default_api, help='URL API VolantinoMix')
    parser.add_argument('--no-upload', action='store_true', help='Solo download, senza upload')
    
    args = parser.parse_args()
    
    scraper = DecoVolantiniScraper(
        download_folder=args.folder,
        api_base_url=args.api
    )
    
    if args.no_upload:
        # Solo scraping senza upload
        print("🔍 Modalità solo download attivata")
        # Implementa logica solo download se necessario
    
    scraper.scrape_and_upload()

if __name__ == "__main__":
    main()