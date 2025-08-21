#!/usr/bin/env python3
"""
Script per scaricare automaticamente volantini PDF da ultimivolantini.it
Compatibile con Python 3.9+

Autore: VolantinoMix System
Data: 2025
"""

import os
import requests
from bs4 import BeautifulSoup
import time
import hashlib
from urllib.parse import urljoin, urlparse
import json
from datetime import datetime

class VolantiniScraper:
    def __init__(self, base_url="https://ultimivolantini.it", download_folder="volantini"):
        self.base_url = base_url
        self.download_folder = download_folder
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        self.downloaded_files = set()
        self.stats = {
            'found': 0,
            'downloaded': 0,
            'skipped': 0,
            'errors': 0
        }
        
        # Crea la cartella di download se non esiste
        os.makedirs(self.download_folder, exist_ok=True)
        
    def get_file_hash(self, content):
        """Calcola l'hash MD5 del contenuto per evitare duplicati"""
        return hashlib.md5(content).hexdigest()
    
    def is_valid_pdf_url(self, url):
        """Verifica se l'URL è un PDF valido"""
        return url.lower().endswith('.pdf') and url.startswith(('http://', 'https://'))
    
    def extract_pdf_links(self, url):
        """Estrae tutti i link PDF dalla pagina"""
        try:
            print(f"🔍 Analizzando: {url}")
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            pdf_links = set()
            
            # Cerca tutti i link che terminano con .pdf
            for link in soup.find_all('a', href=True):
                href = link['href']
                full_url = urljoin(url, href)
                
                if self.is_valid_pdf_url(full_url):
                    pdf_links.add(full_url)
            
            # Cerca anche nei tag img con src che punta a PDF (alcuni siti usano immagini per i link)
            for img in soup.find_all('img', src=True):
                src = img['src']
                full_url = urljoin(url, src)
                
                if self.is_valid_pdf_url(full_url):
                    pdf_links.add(full_url)
            
            # Cerca anche link ai volantini che potrebbero contenere PDF
            volantino_links = set()
            for link in soup.find_all('a', href=True):
                href = link['href']
                text = link.get_text().lower()
                
                # Cerca link che contengono parole chiave
                if any(keyword in href.lower() for keyword in ['volantino', 'offerte', 'flyer']):
                    if href.startswith('http'):
                        volantino_links.add(href)
                    elif href.startswith('/'):
                        volantino_links.add(urljoin(url, href))
            
            # Analizza le pagine dei volantini per trovare PDF
            for volantino_url in list(volantino_links)[:10]:  # Limita a 10 per test
                try:
                    print(f"🔍 Analizzando volantino: {volantino_url}")
                    response = self.session.get(volantino_url, timeout=10)
                    if response.status_code == 200:
                        vol_soup = BeautifulSoup(response.content, 'html.parser')
                        
                        # Cerca PDF in questa pagina
                        for link in vol_soup.find_all('a', href=True):
                            href = link['href']
                            if href.lower().endswith('.pdf'):
                                if href.startswith('http'):
                                    pdf_links.add(href)
                                else:
                                    pdf_links.add(urljoin(volantino_url, href))
                        
                        # Cerca anche immagini che potrebbero essere link a PDF
                        for img in vol_soup.find_all('img', src=True):
                            parent = img.find_parent('a')
                            if parent and parent.get('href'):
                                href = parent['href']
                                if href.lower().endswith('.pdf'):
                                    if href.startswith('http'):
                                        pdf_links.add(href)
                                    else:
                                        pdf_links.add(urljoin(volantino_url, href))
                    
                    time.sleep(1)  # Rate limiting
                except Exception as e:
                    print(f"⚠️  Errore analizzando {volantino_url}: {e}")
                    continue
            
            return list(pdf_links)
            
        except requests.RequestException as e:
            print(f"❌ Errore nel caricamento della pagina {url}: {e}")
            return []
        except Exception as e:
            print(f"❌ Errore nell'analisi della pagina {url}: {e}")
            return []
    
    def download_pdf(self, pdf_url):
        """Scarica un singolo PDF"""
        try:
            # Estrae il nome del file dall'URL
            parsed_url = urlparse(pdf_url)
            filename = os.path.basename(parsed_url.path)
            
            if not filename or not filename.endswith('.pdf'):
                # Genera un nome file se non presente
                filename = f"volantino_{int(time.time())}.pdf"
            
            filepath = os.path.join(self.download_folder, filename)
            
            # Controlla se il file esiste già
            if os.path.exists(filepath):
                print(f"⏭️  File già esistente: {filename}")
                self.stats['skipped'] += 1
                return False
            
            print(f"⬇️  Scaricando: {filename}")
            
            response = self.session.get(pdf_url, timeout=30, stream=True)
            response.raise_for_status()
            
            # Verifica che sia effettivamente un PDF
            content_type = response.headers.get('content-type', '').lower()
            if 'pdf' not in content_type and not pdf_url.lower().endswith('.pdf'):
                print(f"⚠️  Il file {filename} non sembra essere un PDF")
                self.stats['errors'] += 1
                return False
            
            # Scarica il contenuto
            content = response.content
            
            # Controlla duplicati tramite hash
            file_hash = self.get_file_hash(content)
            if file_hash in self.downloaded_files:
                print(f"⏭️  File duplicato (hash): {filename}")
                self.stats['skipped'] += 1
                return False
            
            # Salva il file
            with open(filepath, 'wb') as f:
                f.write(content)
            
            self.downloaded_files.add(file_hash)
            print(f"✅ Scaricato: {filename} ({len(content)} bytes)")
            self.stats['downloaded'] += 1
            
            # Pausa per evitare sovraccarico del server
            time.sleep(1)
            
            return True
            
        except requests.RequestException as e:
            print(f"❌ Errore nel download di {pdf_url}: {e}")
            self.stats['errors'] += 1
            return False
        except Exception as e:
            print(f"❌ Errore generico nel download di {pdf_url}: {e}")
            self.stats['errors'] += 1
            return False
    
    def scrape_site(self, max_pages=5):
        """Scraping principale del sito"""
        print(f"🚀 Avvio scraping di {self.base_url}")
        print(f"📁 Cartella di download: {self.download_folder}")
        print("-" * 50)
        
        # Lista delle pagine da analizzare
        pages_to_scrape = [
            self.base_url,
            f"{self.base_url}/volantini",
            f"{self.base_url}/offerte",
            f"{self.base_url}/supermercati",
            f"{self.base_url}/discount"
        ]
        
        all_pdf_links = set()
        
        # Estrai link PDF da tutte le pagine
        for page_url in pages_to_scrape[:max_pages]:
            pdf_links = self.extract_pdf_links(page_url)
            all_pdf_links.update(pdf_links)
            
            if pdf_links:
                print(f"📄 Trovati {len(pdf_links)} PDF in {page_url}")
        
        self.stats['found'] = len(all_pdf_links)
        print(f"\n📊 Totale PDF trovati: {self.stats['found']}")
        
        if not all_pdf_links:
            print("⚠️  Nessun PDF trovato sul sito")
            return
        
        print("\n⬇️  Inizio download...")
        print("-" * 50)
        
        # Scarica tutti i PDF trovati
        for pdf_url in all_pdf_links:
            self.download_pdf(pdf_url)
        
        self.print_summary()
    
    def print_summary(self):
        """Stampa il riepilogo finale"""
        print("\n" + "=" * 50)
        print("📊 RIEPILOGO SCRAPING")
        print("=" * 50)
        print(f"🔍 PDF trovati: {self.stats['found']}")
        print(f"✅ PDF scaricati: {self.stats['downloaded']}")
        print(f"⏭️  PDF saltati (duplicati/esistenti): {self.stats['skipped']}")
        print(f"❌ Errori: {self.stats['errors']}")
        print(f"📁 Cartella: {os.path.abspath(self.download_folder)}")
        
        # Lista dei file scaricati
        if self.stats['downloaded'] > 0:
            print("\n📋 File scaricati:")
            for filename in os.listdir(self.download_folder):
                if filename.endswith('.pdf'):
                    filepath = os.path.join(self.download_folder, filename)
                    size = os.path.getsize(filepath)
                    print(f"  • {filename} ({size:,} bytes)")
        
        # Salva statistiche in JSON
        stats_file = os.path.join(self.download_folder, 'scraping_stats.json')
        with open(stats_file, 'w', encoding='utf-8') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'stats': self.stats,
                'base_url': self.base_url
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n💾 Statistiche salvate in: {stats_file}")

def main():
    """Funzione principale"""
    try:
        scraper = VolantiniScraper()
        scraper.scrape_site()
        
    except KeyboardInterrupt:
        print("\n⏹️  Scraping interrotto dall'utente")
    except Exception as e:
        print(f"\n❌ Errore fatale: {e}")

if __name__ == "__main__":
    main()