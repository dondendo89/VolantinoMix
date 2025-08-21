#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scraper per Ipercoop - Coop Gruppo Radenza
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
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False
    print("⚠️  Selenium non disponibile. Usando solo requests/BeautifulSoup.")

class IpercoopVolantiniScraper:
    def __init__(self, download_folder="volantini_ipercoop", api_base_url="http://localhost:5000/api"):
        self.base_url = "https://volantini.coopgrupporadenza.it"
        self.volantini_url = "https://volantini.coopgrupporadenza.it/"
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
        """Calcola hash MD5 del file"""
        hash_md5 = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()

    def extract_pdf_links_selenium(self):
        """Estrae i link ai PDF usando Selenium per gestire JavaScript"""
        if not SELENIUM_AVAILABLE:
            print("❌ Selenium non disponibile, impossibile usare questo metodo")
            return []
        
        pdf_links = []
        
        try:
            # Configura Chrome in modalità headless
            chrome_options = Options()
            chrome_options.add_argument('--headless')
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            chrome_options.add_argument('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
            
            driver = webdriver.Chrome(options=chrome_options)
            
            print(f"🌐 Caricamento pagina con Selenium: {self.volantini_url}")
            driver.get(self.volantini_url)
            
            # Aspetta che la pagina si carichi completamente
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            
            # Aspetta un po' di più per il caricamento JavaScript
            time.sleep(3)
            
            # Prima cerca link diretti ai PDF
            direct_pdf_links = driver.find_elements(By.CSS_SELECTOR, "a[href*='.pdf'], a[href*='pdf']")
            for link in direct_pdf_links:
                href = link.get_attribute('href')
                if href and ('.pdf' in href.lower() or href.lower().endswith('.pdf')):
                    pdf_links.append({
                        'url': href,
                        'text': link.text or 'Volantino Ipercoop',
                        'title': link.get_attribute('title') or 'Volantino Ipercoop'
                    })
                    print(f"📄 Trovato PDF diretto: {href}")
            
            # Cerca elementi volantino con attributi data
            volantino_elements = driver.find_elements(By.CSS_SELECTOR, ".volantino-inner, .col-volantino, [data-id], [data-pdf], [data-url]")
            print(f"🔍 Trovati {len(volantino_elements)} elementi volantino")
            
            for i, element in enumerate(volantino_elements):
                try:
                    print(f"\n🔍 Debug elemento {i+1}:")
                    print(f"   Tag: {element.tag_name}")
                    print(f"   Classe: {element.get_attribute('class')}")
                    print(f"   Testo: {element.text[:100] if element.text else 'Nessun testo'}")
                    
                    # Controlla tutti gli attributi
                    all_attrs = driver.execute_script("return arguments[0].attributes;", element)
                    for attr_name in ['data-pdf', 'data-url', 'data-href', 'data-link', 'data-id', 'href', 'onclick']:
                        attr_value = element.get_attribute(attr_name)
                        if attr_value:
                            print(f"   {attr_name}: {attr_value}")
                    
                    # Cerca link figli
                    child_links = element.find_elements(By.TAG_NAME, "a")
                    for link in child_links:
                        href = link.get_attribute('href')
                        if href:
                            print(f"   Link figlio: {href}")
                            # Controlla se è un link PDF diretto
                            if '.pdf' in href.lower():
                                pdf_links.append({
                                    'url': href,
                                    'text': link.text or element.text or 'Volantino Ipercoop',
                                    'title': 'Volantino Ipercoop'
                                })
                                print(f"📄 Trovato PDF da link figlio: {href}")
                            # Controlla se è un link a pagina di sfoglia
                            elif 'sfoglia.php' in href:
                                print(f"🔍 Trovato link sfoglia, cerco PDF nella pagina: {href}")
                                sfoglia_pdf = self.extract_pdf_from_sfoglia_page(driver, href)
                                if sfoglia_pdf:
                                    pdf_links.extend(sfoglia_pdf)
                                    print(f"📄 Trovati {len(sfoglia_pdf)} PDF dalla pagina sfoglia")
                    
                    # Controlla attributi data per URL PDF
                    for attr in ['data-pdf', 'data-url', 'data-href', 'data-link']:
                        pdf_url = element.get_attribute(attr)
                        if pdf_url and ('.pdf' in pdf_url.lower() or pdf_url.lower().endswith('.pdf')):
                            pdf_links.append({
                                'url': pdf_url,
                                'text': element.text or 'Volantino Ipercoop',
                                'title': element.get_attribute('title') or 'Volantino Ipercoop'
                            })
                            print(f"📄 Trovato PDF da attributo {attr}: {pdf_url}")
                            break
                    
                except Exception as e:
                    print(f"⚠️  Errore nell'elaborazione elemento {i+1}: {e}")
                    continue
            
            driver.quit()
            
        except Exception as e:
            print(f"❌ Errore Selenium: {e}")
            try:
                driver.quit()
            except:
                pass
        
        return pdf_links
    
    def extract_pdf_from_sfoglia_page(self, driver, sfoglia_url):
        """Estrae PDF da una pagina di sfoglia usando l'API"""
        pdf_links = []
        
        try:
            # Estrai l'ID del volantino dall'URL
            # URL formato: https://volantini.coopgrupporadenza.it/sfoglia.php/360
            import re
            match = re.search(r'/sfoglia\.php/(\d+)', sfoglia_url)
            if not match:
                print(f"❌ Impossibile estrarre ID volantino da: {sfoglia_url}")
                return pdf_links
            
            volantino_id = match.group(1)
            print(f"🆔 ID volantino estratto: {volantino_id}")
            
            # Costruisci l'URL dell'API per scaricare il PDF
            pdf_api_url = f"https://app.coopgrupporadenza.it/api/frontend/volantino/scarica-pdf/0/{volantino_id}"
            
            # Verifica che l'API restituisca un PDF
            response = self.session.head(pdf_api_url, timeout=10)
            if response.status_code == 200:
                content_type = response.headers.get('content-type', '').lower()
                content_disposition = response.headers.get('content-disposition', '')
                
                if 'application/octet-stream' in content_type or 'attachment' in content_disposition:
                    pdf_links.append({
                        'url': pdf_api_url,
                        'text': f'Volantino Ipercoop {volantino_id}',
                        'title': f'Volantino Ipercoop {volantino_id}'
                    })
                    print(f"📄 PDF API trovato: {pdf_api_url}")
                else:
                    print(f"⚠️  L'API non restituisce un PDF: {content_type}")
            else:
                print(f"❌ API non disponibile (status: {response.status_code}): {pdf_api_url}")
            
        except Exception as e:
            print(f"❌ Errore nell'estrazione PDF da API: {e}")
        
        return pdf_links
    
    def extract_pdf_links(self, soup, base_url):
        """Estrae i link ai PDF dalla pagina"""
        pdf_links = []
        
        # Cerca link diretti ai PDF
        for link in soup.find_all('a', href=True):
            href = link['href']
            if href.lower().endswith('.pdf'):
                full_url = urljoin(base_url, href)
                pdf_links.append({
                    'url': full_url,
                    'text': link.get_text(strip=True),
                    'title': link.get('title', '')
                })
        
        # Cerca anche nei tag iframe o embed che potrebbero contenere PDF
        for iframe in soup.find_all(['iframe', 'embed'], src=True):
            src = iframe['src']
            if src.lower().endswith('.pdf'):
                full_url = urljoin(base_url, src)
                pdf_links.append({
                    'url': full_url,
                    'text': iframe.get('title', 'PDF Volantino'),
                    'title': iframe.get('title', '')
                })
        
        # Cerca nei data attributes
        for element in soup.find_all(attrs={'data-pdf': True}):
            pdf_url = element['data-pdf']
            if pdf_url:
                full_url = urljoin(base_url, pdf_url)
                pdf_links.append({
                    'url': full_url,
                    'text': element.get_text(strip=True) or 'PDF Volantino',
                    'title': element.get('title', '')
                })
        
        # Cerca pattern specifici per Coop
        for element in soup.find_all(class_=re.compile(r'volantino|flyer|pdf|download', re.I)):
            for link in element.find_all('a', href=True):
                href = link['href']
                if any(keyword in href.lower() for keyword in ['pdf', 'volantino', 'flyer']):
                    full_url = urljoin(base_url, href)
                    pdf_links.append({
                        'url': full_url,
                        'text': link.get_text(strip=True),
                        'title': link.get('title', '')
                    })
        
        # Rimuovi duplicati
        seen = set()
        unique_links = []
        for link in pdf_links:
            if link['url'] not in seen:
                seen.add(link['url'])
                unique_links.append(link)
        
        return unique_links

    def download_pdf(self, pdf_url, filename=None):
        """Scarica un PDF"""
        try:
            print(f"📥 Scaricando: {pdf_url}")
            
            response = self.session.get(pdf_url, timeout=30)
            response.raise_for_status()
            
            # Verifica che sia effettivamente un PDF
            content_type = response.headers.get('content-type', '').lower()
            content_disposition = response.headers.get('content-disposition', '')
            
            # Accetta PDF diretti, octet-stream da API Ipercoop, o file con attachment
            is_pdf = ('pdf' in content_type or 
                     'application/octet-stream' in content_type or 
                     'attachment' in content_disposition or 
                     pdf_url.lower().endswith('.pdf') or 
                     'scarica-pdf' in pdf_url)
            
            if not is_pdf:
                print(f"⚠️  Non è un PDF: {content_type}")
                return None
            
            # Genera nome file se non fornito
            if not filename:
                parsed_url = urlparse(pdf_url)
                filename = os.path.basename(parsed_url.path)
                if not filename or not filename.endswith('.pdf'):
                    timestamp = int(time.time())
                    filename = f"ipercoop_volantino_{timestamp}.pdf"
            
            # Assicurati che il filename abbia estensione .pdf
            if not filename.lower().endswith('.pdf'):
                filename += '.pdf'
            
            file_path = self.download_folder / filename
            
            # Controlla se il file esiste già
            if file_path.exists():
                existing_hash = self.get_file_hash(file_path)
                new_hash = hashlib.md5(response.content).hexdigest()
                if existing_hash == new_hash:
                    print(f"⏭️  File già esistente: {filename}")
                    self.stats['skipped'] += 1
                    return file_path
            
            # Salva il file
            with open(file_path, 'wb') as f:
                f.write(response.content)
            
            file_size = len(response.content)
            print(f"✅ Scaricato: {filename} ({file_size:,} bytes)")
            self.stats['downloaded'] += 1
            
            return file_path
            
        except Exception as e:
            print(f"❌ Errore download {pdf_url}: {e}")
            self.stats['errors'] += 1
            return None

    def extract_store_info(self, filename, pdf_url):
        """Estrae informazioni del negozio dal filename e URL"""
        # Questo è lo scraper specifico per Ipercoop, quindi il store è sempre Ipercoop
        return {
            'store': 'Ipercoop',
            'category': 'Supermercato',
            'location': {'cap': '00000'},  # Default, può essere migliorato
            'source_url': pdf_url,
            'scraped_at': datetime.now().isoformat()
        }

    def upload_to_volantinomix(self, file_path, store_info):
        """Carica il PDF su VolantinoMix"""
        try:
            upload_url = f"{self.api_base_url}/ipercoop/upload"
            
            # Prepara i dati nel formato atteso dall'endpoint
            data = {
                'filename': file_path.name,
                'store_name': store_info['store'],
                'store_type': 'Ipercoop',
                'location': store_info['location']['cap'],
                'pdf_url': store_info['source_url'],
                'pdf_path': str(file_path.resolve())  # Percorso assoluto del file
            }
            
            response = requests.post(upload_url, json=data, timeout=60)
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Caricato su VolantinoMix: {result.get('message', 'OK')}")
                self.stats['uploaded'] += 1
                return True
            else:
                print(f"❌ Errore upload: {response.status_code} - {response.text}")
                return False
                    
        except Exception as e:
            print(f"❌ Errore upload {file_path.name}: {e}")
            return False

    def scrape_and_upload(self):
        """Esegue lo scraping completo e carica i PDF"""
        print("🚀 Avvio scraping Ipercoop...")
        print(f"📂 Cartella download: {self.download_folder}")
        print(f"🌐 URL base: {self.volantini_url}")
        
        try:
            pdf_links = []
            
            # Prova prima con Selenium se disponibile
            if SELENIUM_AVAILABLE:
                print("🔧 Tentativo con Selenium per contenuti dinamici...")
                pdf_links = self.extract_pdf_links_selenium()
                
            # Se Selenium non trova nulla o non è disponibile, usa il metodo tradizionale
            if not pdf_links:
                print("📄 Caricamento pagina con requests/BeautifulSoup...")
                response = self.session.get(self.volantini_url, timeout=30)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.content, 'html.parser')
                pdf_links = self.extract_pdf_links(soup, self.volantini_url)
            
            self.stats['found'] = len(pdf_links)
            
            print(f"🔍 Trovati {len(pdf_links)} potenziali PDF")
            
            if not pdf_links:
                print("⚠️  Nessun PDF trovato. Il sito potrebbe aver cambiato struttura.")
                return
            
            # Scarica ogni PDF
            for i, pdf_info in enumerate(pdf_links, 1):
                print(f"\n📥 [{i}/{len(pdf_links)}] Elaborazione: {pdf_info['text'][:50]}...")
                
                # Genera nome file basato sul testo del link
                safe_name = re.sub(r'[^\w\s-]', '', pdf_info['text']).strip()
                safe_name = re.sub(r'[-\s]+', '-', safe_name)
                if len(safe_name) > 50:
                    safe_name = safe_name[:50]
                
                filename = f"{safe_name}.pdf" if safe_name else None
                
                # Scarica PDF
                file_path = self.download_pdf(pdf_info['url'], filename)
                
                if file_path:
                    # Estrai info negozio
                    store_info = self.extract_store_info(file_path.name, pdf_info['url'])
                    
                    # Carica su VolantinoMix
                    self.upload_to_volantinomix(file_path, store_info)
                
                # Pausa tra download
                time.sleep(1)
            
        except Exception as e:
            print(f"❌ Errore durante lo scraping: {e}")
            self.stats['errors'] += 1
        
        finally:
            self.print_summary()

    def print_summary(self):
        """Stampa riassunto operazioni"""
        print("\n" + "="*50)
        print("📊 RIASSUNTO SCRAPING IPERCOOP")
        print("="*50)
        print(f"🔍 PDF trovati: {self.stats['found']}")
        print(f"📥 PDF scaricati: {self.stats['downloaded']}")
        print(f"⏭️  PDF saltati (già esistenti): {self.stats['skipped']}")
        print(f"☁️  PDF caricati su VolantinoMix: {self.stats['uploaded']}")
        print(f"❌ Errori: {self.stats['errors']}")
        print("="*50)
        
        # Salva statistiche
        stats_file = self.download_folder / 'ipercoop_scraping_stats.json'
        with open(stats_file, 'w', encoding='utf-8') as f:
            json.dump({
                'timestamp': datetime.now().isoformat(),
                'stats': self.stats,
                'download_folder': str(self.download_folder)
            }, f, indent=2, ensure_ascii=False)

def main():
    """Funzione principale"""
    try:
        scraper = IpercoopVolantiniScraper()
        scraper.scrape_and_upload()
    except KeyboardInterrupt:
        print("\n⏹️  Scraping interrotto dall'utente")
    except Exception as e:
        print(f"❌ Errore fatale: {e}")

if __name__ == "__main__":
    main()