#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scraper per volantini Eurospin
Estrae i volantini dal sito https://www.eurospin.it/
"""

import requests
import json
import os
import time
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse
import logging
from pathlib import Path

# Configurazione logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('eurospin_scraper.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class EurospinScraper:
    def __init__(self, api_base_url="http://localhost:5000/api"):
        self.base_url = "https://www.eurospin.it"
        self.api_base_url = api_base_url
        # URL alternativi per cercare volantini
        self.alternative_urls = [
            "https://www.volantinofacile.it/eurospin/volantino-eurospin",
            "https://www.scontrinofelice.it/volantini/anteprima-nuovo-volantino-eurospin/",
            "https://www.trovaprezzi.it/volantini/eurospin"
        ]
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'it-IT,it;q=0.8,en-US;q=0.5,en;q=0.3',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
        
        # Directory per salvare i volantini
        self.download_dir = Path("volantini_eurospin")
        self.download_dir.mkdir(exist_ok=True)
        
        # File per statistiche
        self.stats_file = self.download_dir / "eurospin_scraping_stats.json"
        
        # Statistiche
        self.stats = {
            "last_run": None,
            "total_volantini_found": 0,
            "total_volantini_downloaded": 0,
            "errors": [],
            "volantini_details": []
        }
        
        self.load_stats()
    
    def load_stats(self):
        """Carica le statistiche dal file JSON"""
        try:
            if self.stats_file.exists():
                with open(self.stats_file, 'r', encoding='utf-8') as f:
                    self.stats = json.load(f)
                logger.info(f"Statistiche caricate: {len(self.stats.get('volantini_details', []))} volantini precedenti")
        except Exception as e:
            logger.error(f"Errore nel caricamento delle statistiche: {e}")
    
    def save_stats(self):
        """Salva le statistiche nel file JSON"""
        try:
            self.stats["last_run"] = datetime.now().isoformat()
            with open(self.stats_file, 'w', encoding='utf-8') as f:
                json.dump(self.stats, f, indent=2, ensure_ascii=False)
            logger.info("Statistiche salvate")
        except Exception as e:
            logger.error(f"Errore nel salvataggio delle statistiche: {e}")
    
    def get_volantini_page(self):
        """Ottiene la pagina dei volantini"""
        try:
            # Prima prova la pagina principale per cercare il link 'Sfoglia volantino'
            main_url = self.base_url
            logger.info(f"Accesso alla pagina principale: {main_url}")
            
            response = self.session.get(main_url, timeout=30)
            response.raise_for_status()
            
            # Cerca il link 'Sfoglia volantino' nella pagina principale
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Prima cerca link specifici per 'volantino-nazionale' (più specifico)
            volantino_nazionale_links = soup.find_all('a', href=lambda x: x and 'volantino-nazionale' in x.lower())
            
            if volantino_nazionale_links:
                # Priorità ai link più specifici con date o numeri
                for link in volantino_nazionale_links:
                    href = link.get('href')
                    if href and any(char.isdigit() for char in href):
                        volantini_url = urljoin(self.base_url, href)
                        logger.info(f"Trovato link volantino nazionale specifico: {volantini_url}")
                        
                        # Accedi alla pagina del volantino
                        vol_response = self.session.get(volantini_url, timeout=30)
                        vol_response.raise_for_status()
                        
                        logger.info(f"Pagina volantini caricata con successo (status: {vol_response.status_code})")
                        return vol_response.text
                
                # Se non trova link con date, usa il primo disponibile
                href = volantino_nazionale_links[0].get('href')
                if href:
                    volantini_url = urljoin(self.base_url, href)
                    logger.info(f"Trovato link volantino nazionale: {volantini_url}")
                    
                    # Accedi alla pagina del volantino
                    vol_response = self.session.get(volantini_url, timeout=30)
                    vol_response.raise_for_status()
                    
                    logger.info(f"Pagina volantini caricata con successo (status: {vol_response.status_code})")
                    return vol_response.text
            
            # Cerca link che contengono 'sfoglia', 'volantino', 'leaflet' o 'flyer'
            sfoglia_links = soup.find_all('a', string=lambda text: text and any(keyword in text.lower() for keyword in ['sfoglia', 'volantino', 'leaflet', 'flyer']))
            
            if not sfoglia_links:
                # Cerca anche per href che contiene volantino
                sfoglia_links = soup.find_all('a', href=lambda x: x and 'volantino' in x.lower())
            
            if sfoglia_links:
                for link in sfoglia_links:
                    href = link.get('href')
                    if href and 'volantino' in href.lower():
                        volantini_url = urljoin(self.base_url, href)
                        logger.info(f"Trovato link 'Sfoglia volantino': {volantini_url}")
                        
                        # Accedi alla pagina del volantino
                        vol_response = self.session.get(volantini_url, timeout=30)
                        vol_response.raise_for_status()
                        
                        logger.info(f"Pagina volantini caricata con successo (status: {vol_response.status_code})")
                        return vol_response.text
            
            # Se non trova il link specifico, prova l'URL tradizionale
            volantini_url = f"{self.base_url}/volantino/"
            logger.info(f"Tentativo con URL tradizionale: {volantini_url}")
            
            response = self.session.get(volantini_url, timeout=30)
            response.raise_for_status()
            
            logger.info(f"Pagina volantini caricata con successo (status: {response.status_code})")
            return response.text
            
        except requests.exceptions.RequestException as e:
            error_msg = f"Errore nell'accesso alla pagina volantini: {e}"
            logger.error(error_msg)
            self.stats["errors"].append({
                "timestamp": datetime.now().isoformat(),
                "error": error_msg
            })
            return None
    
    def search_api_endpoints(self):
        """Cerca possibili endpoint API per i volantini"""
        api_endpoints = [
            f"{self.base_url}/api/volantini",
            f"{self.base_url}/api/leaflets",
            f"{self.base_url}/api/flyers",
            f"{self.base_url}/wp-json/wp/v2/volantini",
            f"{self.base_url}/wp-admin/admin-ajax.php"
        ]
        
        for endpoint in api_endpoints:
            try:
                logger.info(f"Tentativo API: {endpoint}")
                response = self.session.get(endpoint, timeout=10)
                if response.status_code == 200:
                    logger.info(f"API endpoint trovato: {endpoint}")
                    return response.json()
            except:
                continue
        
        return None
    
    def search_alternative_sources(self):
        """Cerca volantini sui siti aggregatori"""
        from bs4 import BeautifulSoup
        from urllib.parse import urljoin
        
        volantini = []
        
        for url in self.alternative_urls:
            try:
                logger.info(f"Ricerca su sito alternativo: {url}")
                response = self.session.get(url, timeout=30)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # Cerca link PDF diretti
                pdf_links = soup.find_all('a', href=True)
                for link in pdf_links:
                    href = link.get('href', '')
                    if href.endswith('.pdf') and 'volantino' in href.lower():
                        pdf_url = urljoin(url, href)
                        title = link.get_text(strip=True) or "Volantino Eurospin"
                        
                        volantino = {
                            'title': title,
                            'pdf_url': pdf_url,
                            'store': 'Eurospin',
                            'category': 'Supermercato',
                            'location': 'Nazionale',
                            'valid_from': datetime.now().strftime('%Y-%m-%d'),
                            'valid_to': 'Da definire',
                            'pages': 'Da definire'
                        }
                        volantini.append(volantino)
                        logger.info(f"PDF trovato su sito alternativo: {pdf_url}")
                
                # Cerca immagini di volantini che potrebbero essere convertibili
                img_links = soup.find_all('img', src=True)
                for img in img_links:
                    src = img.get('src', '')
                    if 'volantino' in src.lower() and any(ext in src.lower() for ext in ['.jpg', '.jpeg', '.png']):
                        # Prova a trovare un link PDF associato
                        parent = img.find_parent('a')
                        if parent and parent.get('href'):
                            href = parent.get('href')
                            if '.pdf' in href:
                                pdf_url = urljoin(url, href)
                                title = img.get('alt', 'Volantino Eurospin')
                                
                                volantino = {
                                    'title': title,
                                    'pdf_url': pdf_url,
                                    'store': 'Eurospin',
                                    'category': 'Supermercato',
                                    'location': 'Nazionale',
                                    'valid_from': datetime.now().strftime('%Y-%m-%d'),
                                    'valid_to': 'Da definire',
                                    'pages': 'Da definire'
                                }
                                volantini.append(volantino)
                                logger.info(f"PDF da immagine trovato: {pdf_url}")
                                
            except Exception as e:
                logger.warning(f"Errore nella ricerca su {url}: {e}")
                continue
        
        return volantini
    
    def find_sfoglia_volantino_pdf(self, html_content):
        """Cerca specificamente il PDF nella sezione 'Sfoglia volantino'"""
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Cerca elementi che contengono 'sfoglia volantino' o simili
            sfoglia_keywords = [
                'sfoglia volantino', 'sfoglia il volantino', 'visualizza volantino',
                'volantino online', 'volantino digitale', 'volantino corrente',
                'volantino attuale', 'volantino valido', 'offerte correnti',
                'sfoglia', 'volantino'
            ]
            
            # Cerca testo che contiene le parole chiave
            sfoglia_elements = soup.find_all(string=lambda text: text and any(keyword in text.lower() for keyword in sfoglia_keywords))
            
            for element in sfoglia_elements:
                parent = element.parent
                if parent:
                    # Cerca link PDF nel parent o nei suoi figli
                    pdf_link = parent.find('a', href=lambda x: x and '.pdf' in x.lower())
                    if pdf_link:
                        href = pdf_link.get('href')
                        pdf_url = urljoin(self.base_url, href)
                        logger.info(f"PDF trovato tramite 'Sfoglia volantino': {pdf_url}")
                        return pdf_url
                    
                    # Cerca anche onclick o data attributes
                    onclick_elements = parent.find_all(attrs={'onclick': True})
                    for onclick_elem in onclick_elements:
                        onclick = onclick_elem.get('onclick', '')
                        if '.pdf' in onclick:
                            import re
                            pdf_matches = re.findall(r'["\']([^"\'\']*\.pdf[^"\'\']*)["\']', onclick)
                            if pdf_matches:
                                pdf_url = urljoin(self.base_url, pdf_matches[0])
                                logger.info(f"PDF trovato tramite onclick: {pdf_url}")
                                return pdf_url
            
            # Cerca anche elementi con classi o ID specifici
            volantino_selectors = [
                '.volantino-link', '.leaflet-link', '.flyer-link',
                '.btn-volantino', '.button-volantino', '.volantino-btn',
                '#volantino-link', '#leaflet-link', '#flyer-link',
                '[data-volantino]', '[data-leaflet]', '[data-flyer]',
                'a[href*="volantino"]', 'a[href*="leaflet"]', 'a[href*="flyer"]'
            ]
            
            for selector in volantino_selectors:
                elements = soup.select(selector)
                for elem in elements:
                    href = elem.get('href')
                    if href and '.pdf' in href.lower():
                        pdf_url = urljoin(self.base_url, href)
                        logger.info(f"PDF trovato tramite selettore {selector}: {pdf_url}")
                        return pdf_url
            
            # Cerca iframe che potrebbero contenere il volantino
            iframes = soup.find_all('iframe')
            for iframe in iframes:
                src = iframe.get('src')
                if src and any(keyword in src.lower() for keyword in ['volantino', 'leaflet', 'flyer', 'pdf']):
                    if '.pdf' in src.lower():
                        pdf_url = urljoin(self.base_url, src)
                        logger.info(f"PDF trovato in iframe: {pdf_url}")
                        return pdf_url
            
            return None
            
        except Exception as e:
            logger.error(f"Errore nella ricerca PDF 'Sfoglia volantino': {e}")
            return None
    
    def extract_volantini_info(self, html_content):
        """Estrae le informazioni sui volantini dalla pagina HTML"""
        volantini = []
        
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Cerca iframe che potrebbero contenere il volantino
            iframes = soup.find_all('iframe')
            logger.info(f"Trovati {len(iframes)} iframe")
            
            for iframe in iframes:
                src = iframe.get('src')
                if src:
                    logger.info(f"Trovato iframe: {src}")
                    
                    # Se l'iframe contiene 'digitalflyer' o 'promotion', accedi al contenuto
                    if any(keyword in src.lower() for keyword in ['digitalflyer', 'promotion', 'volantino']):
                        logger.info(f"Iframe volantino trovato: {src}")
                        
                        try:
                            # Accedi al contenuto dell'iframe
                            iframe_response = self.session.get(src, timeout=10)
                            iframe_response.raise_for_status()
                            
                            from bs4 import BeautifulSoup
                            iframe_soup = BeautifulSoup(iframe_response.text, 'html.parser')
                            
                            # Cerca link PDF nell'iframe
                            pdf_links = iframe_soup.find_all('a', href=lambda x: x and '.pdf' in x.lower())
                            for pdf_link in pdf_links:
                                pdf_href = pdf_link.get('href')
                                pdf_url = urljoin(src, pdf_href)
                                
                                volantino = {
                                     'titolo': 'Volantino Eurospin Nazionale',
                                     'url': pdf_url,
                                     'data_inizio': datetime.now().strftime('%Y-%m-%d'),
                                     'data_fine': (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d'),
                                     'negozio': 'Eurospin',
                                     'citta': 'Nazionale'
                                 }
                                volantini.append(volantino)
                                logger.info(f"PDF trovato nell'iframe: {pdf_url}")
                                return volantini
                            
                            # Cerca anche script che potrebbero contenere URL PDF
                            scripts = iframe_soup.find_all('script')
                            for script in scripts:
                                if script.string:
                                    script_content = script.string
                                    # Cerca pattern PDF negli script
                                    import re
                                    pdf_matches = re.findall(r'["\']([^"\'\']*\.pdf[^"\'\']*)["\']', script_content)
                                    for pdf_match in pdf_matches:
                                        pdf_url = urljoin(src, pdf_match)
                                        
                                        volantino = {
                                            'titolo': 'Volantino Eurospin Nazionale',
                                            'url': pdf_url,
                                            'data_inizio': datetime.now().strftime('%Y-%m-%d'),
                                            'data_fine': (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d'),
                                            'negozio': 'Eurospin',
                                            'citta': 'Nazionale'
                                        }
                                        volantini.append(volantino)
                                        logger.info(f"PDF trovato negli script dell'iframe: {pdf_url}")
                                        return volantini
                            
                            # Se non trova PDF, usa l'URL del volantino digitale
                            if 'digitalflyer' in src.lower() or 'promotion' in src.lower():
                                logger.info(f"Volantino digitale trovato (non PDF): {src}")
                                
                                volantino = {
                                    'titolo': 'Volantino Eurospin Nazionale (Digitale)',
                                    'url': src,
                                    'data_inizio': datetime.now().strftime('%Y-%m-%d'),
                                    'data_fine': (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d'),
                                    'negozio': 'Eurospin',
                                    'citta': 'Nazionale'
                                }
                                volantini.append(volantino)
                                logger.info(f"Volantino digitale aggiunto: {src}")
                                return volantini
                                        
                        except Exception as e:
                            logger.error(f"Errore nell'accesso all'iframe {src}: {e}")
                            continue
                    
                    # Fallback: se l'iframe stesso è un PDF
                    if '.pdf' in src.lower():
                        pdf_url = urljoin(self.base_url, src)
                        volantino = {
                             'titolo': 'Volantino Eurospin Nazionale',
                             'url': pdf_url,
                             'data_inizio': datetime.now().strftime('%Y-%m-%d'),
                             'data_fine': (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d'),
                             'negozio': 'Eurospin',
                             'citta': 'Nazionale'
                         }
                        volantini.append(volantino)
                        logger.info(f"PDF trovato in iframe: {pdf_url}")
                        return volantini
            
            # Cerca immagini del volantino che potrebbero avere link PDF
            images = soup.find_all('img')
            for img in images:
                parent = img.parent
                if parent and parent.name == 'a':
                    href = parent.get('href')
                    if href and '.pdf' in href.lower():
                        pdf_url = urljoin(self.base_url, href)
                        volantino = {
                             'titolo': 'Volantino Eurospin Nazionale',
                             'url': pdf_url,
                             'data_inizio': datetime.now().strftime('%Y-%m-%d'),
                             'data_fine': (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d'),
                             'negozio': 'Eurospin',
                             'citta': 'Nazionale'
                         }
                        volantini.append(volantino)
                        logger.info(f"PDF trovato tramite immagine: {pdf_url}")
                        return volantini
            
            # Prima cerca specificamente il PDF nella sezione 'Sfoglia volantino'
            sfoglia_pdf = self.find_sfoglia_volantino_pdf(html_content)
            if sfoglia_pdf:
                volantino = {
                    'title': 'Volantino Eurospin - Sfoglia Online',
                    'pdf_url': sfoglia_pdf,
                    'store': 'Eurospin',
                    'category': 'Supermercato',
                    'location': 'Nazionale',
                    'valid_from': datetime.now().strftime('%Y-%m-%d'),
                    'valid_to': 'Da definire',
                    'pages': 'Da definire'
                }
                volantini.append(volantino)
                logger.info(f"Volantino trovato tramite 'Sfoglia volantino': {sfoglia_pdf}")
                return volantini
            
            # Cerca i volantini nella pagina Eurospin
            # Proviamo diversi selettori specifici per Eurospin
            volantino_selectors = [
                '.volantino-container',
                '.leaflet-container',
                '.promo-container',
                '.flyer-container',
                '.volantino-item',
                '.flyer-item', 
                '.leaflet-item',
                '.promo-item',
                '[data-volantino]',
                '.card-volantino',
                '.volantino',
                '.leaflet'
            ]
            
            volantino_elements = []
            for selector in volantino_selectors:
                elements = soup.select(selector)
                if elements:
                    volantino_elements = elements
                    logger.info(f"Trovati {len(elements)} volantini con selettore: {selector}")
                    break
            
            # Cerca anche iframe che potrebbero contenere il volantino
            iframes = soup.find_all('iframe')
            if iframes:
                logger.info(f"Trovati {len(iframes)} iframe")
                for iframe in iframes:
                    src = iframe.get('src')
                    if src and ('volantino' in src.lower() or 'leaflet' in src.lower() or 'flyer' in src.lower()):
                        logger.info(f"Iframe volantino trovato: {src}")
            
            # Cerca script che potrebbero contenere dati del volantino
            scripts = soup.find_all('script')
            for script in scripts:
                if script.string and ('volantino' in script.string.lower() or 'pdf' in script.string.lower()):
                    logger.info("Script con riferimenti a volantino trovato")
                    # Cerca URL PDF nel contenuto JavaScript
                    import re
                    pdf_matches = re.findall(r'["\']([^"\'\']*\.pdf[^"\'\']*)["\']', script.string)
                    for pdf_match in pdf_matches:
                        if 'informativa' not in pdf_match.lower() and 'comunicazioni' not in pdf_match.lower():
                            pdf_url = urljoin(self.base_url, pdf_match)
                            volantino = {
                                'title': f'Volantino Eurospin da Script',
                                'pdf_url': pdf_url,
                                'store': 'Eurospin',
                                'category': 'Supermercato',
                                'location': 'Nazionale',
                                'valid_from': datetime.now().strftime('%Y-%m-%d'),
                                'valid_to': 'Da definire',
                                'pages': 'Da definire'
                            }
                            volantini.append(volantino)
                            logger.info(f"PDF trovato in script: {pdf_url}")
            
            # Se non troviamo elementi specifici, cerchiamo link PDF
            if not volantino_elements:
                # Cerca link PDF escludendo quelli di informativa
                pdf_links = soup.find_all('a', href=lambda x: x and '.pdf' in x.lower() and 'informativa' not in x.lower() and 'comunicazioni' not in x.lower())
                logger.info(f"Trovati {len(pdf_links)} link PDF (escluse informative)")
                
                # Se non ci sono PDF specifici, cerca tutti i link PDF
                if not pdf_links:
                    pdf_links = soup.find_all('a', href=lambda x: x and '.pdf' in x.lower())
                    logger.info(f"Trovati {len(pdf_links)} link PDF totali")
                
                for i, link in enumerate(pdf_links):
                    href = link.get('href')
                    if href:
                        # Costruisci URL completo
                        pdf_url = urljoin(self.base_url, href)
                        
                        # Estrai titolo
                        title = link.get_text(strip=True) or link.get('title', f'Volantino Eurospin {i+1}')
                        
                        # Salta le informative
                        if 'informativa' in title.lower() or 'comunicazioni' in title.lower():
                            logger.info(f"Saltato documento informativo: {title}")
                            continue
                        
                        volantino = {
                            'title': title,
                            'pdf_url': pdf_url,
                            'store': 'Eurospin',
                            'category': 'Supermercato',
                            'location': 'Nazionale',
                            'valid_from': datetime.now().strftime('%Y-%m-%d'),
                            'valid_to': 'Da definire',
                            'pages': 'Da definire'
                        }
                        
                        volantini.append(volantino)
                        logger.info(f"Volantino trovato: {title} - {pdf_url}")
            
            # Se abbiamo trovato elementi specifici, estraiamo le informazioni
            else:
                for element in volantino_elements:
                    try:
                        # Estrai titolo
                        title_elem = element.find(['h1', 'h2', 'h3', 'h4', '.title', '.nome']) or element
                        title = title_elem.get_text(strip=True) if title_elem else 'Volantino Eurospin'
                        
                        # Cerca link PDF
                        pdf_link = element.find('a', href=lambda x: x and '.pdf' in x.lower())
                        if not pdf_link:
                            pdf_link = element.find('a')
                        
                        if pdf_link:
                            href = pdf_link.get('href')
                            pdf_url = urljoin(self.base_url, href)
                            
                            # Estrai date di validità se disponibili
                            date_elem = element.find(['.date', '.validity', '.periodo'])
                            date_text = date_elem.get_text(strip=True) if date_elem else ''
                            
                            volantino = {
                                'title': title,
                                'pdf_url': pdf_url,
                                'store': 'Eurospin',
                                'category': 'Supermercato',
                                'location': 'Nazionale',
                                'valid_from': datetime.now().strftime('%Y-%m-%d'),
                                'valid_to': date_text or 'Da definire',
                                'pages': 'Da definire'
                            }
                            
                            volantini.append(volantino)
                            logger.info(f"Volantino trovato: {title} - {pdf_url}")
                    
                    except Exception as e:
                        logger.error(f"Errore nell'estrazione di un volantino: {e}")
                        continue
            
            self.stats["total_volantini_found"] = len(volantini)
            logger.info(f"Totale volantini trovati: {len(volantini)}")
            
            return volantini
            
        except ImportError:
            logger.error("BeautifulSoup non installato. Installare con: pip install beautifulsoup4")
            return []
        except Exception as e:
            error_msg = f"Errore nell'estrazione dei volantini: {e}"
            logger.error(error_msg)
            self.stats["errors"].append({
                "timestamp": datetime.now().isoformat(),
                "error": error_msg
            })
            return []
    
    def download_pdf(self, volantino):
        """Scarica un singolo PDF"""
        try:
            # Gestisce sia 'pdf_url' che 'url'
            pdf_url = volantino.get('pdf_url') or volantino.get('url')
            # Gestisce sia 'title' che 'titolo'
            title = volantino.get('title') or volantino.get('titolo')
            
            # Crea nome file sicuro
            safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).rstrip()
            safe_title = safe_title.replace(' ', '_')
            filename = f"{safe_title}.pdf"
            filepath = self.download_dir / filename
            
            # Controlla se il file esiste già
            if filepath.exists():
                logger.info(f"File già esistente: {filename}")
                return str(filepath)
            
            logger.info(f"Download di: {title} da {pdf_url}")
            
            # Download del PDF
            response = self.session.get(pdf_url, timeout=60)
            response.raise_for_status()
            
            # Verifica che sia un PDF
            content_type = response.headers.get('content-type', '').lower()
            content_text = response.content.decode('utf-8', errors='ignore')[:100].lower()
            
            # Controlla se il contenuto è HTML invece di PDF
            if ('html' in content_type or 'text' in content_type or 
                '<!doctype html>' in content_text or '<html' in content_text):
                logger.warning(f"Contenuto HTML rilevato invece di PDF per {title}. Saltando il download.")
                volantino['downloaded'] = False
                volantino['error'] = 'Contenuto HTML invece di PDF'
                return None
            
            if 'pdf' not in content_type and not pdf_url.lower().endswith('.pdf'):
                logger.warning(f"Il contenuto potrebbe non essere un PDF: {content_type}")
            
            # Salva il file solo se è un vero PDF
            with open(filepath, 'wb') as f:
                f.write(response.content)
            
            file_size = len(response.content)
            logger.info(f"PDF scaricato: {filename} ({file_size} bytes)")
            
            # Aggiorna statistiche
            volantino['downloaded'] = True
            volantino['file_path'] = str(filepath)
            volantino['file_size'] = file_size
            volantino['download_timestamp'] = datetime.now().isoformat()
            
            self.stats["total_volantini_downloaded"] += 1
            
            return str(filepath)
            
        except requests.exceptions.RequestException as e:
            error_msg = f"Errore nel download di {volantino.get('title') or volantino.get('titolo')}: {e}"
            logger.error(error_msg)
            volantino['downloaded'] = False
            volantino['error'] = str(e)
            self.stats["errors"].append({
                "timestamp": datetime.now().isoformat(),
                "error": error_msg
            })
            return None
        except Exception as e:
            error_msg = f"Errore generico nel download di {volantino.get('title') or volantino.get('titolo')}: {e}"
            logger.error(error_msg)
            volantino['downloaded'] = False
            volantino['error'] = str(e)
            self.stats["errors"].append({
                "timestamp": datetime.now().isoformat(),
                "error": error_msg
            })
            return None
    
    def upload_to_volantinomix(self, file_path, store_info):
        """Carica il PDF nel sistema VolantinoMix usando l'endpoint specifico di Eurospin"""
        try:
            upload_url = f"{self.api_base_url}/eurospin/upload"
            
            # Prepara i dati per l'endpoint Eurospin
            data = {
                'filename': os.path.basename(file_path),
                'store_name': store_info['store'],
                'store_type': store_info['category'],
                'location': store_info.get('cap', '00100'),
                'pdf_path': file_path
            }
            
            response = self.session.post(upload_url, json=data, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    logger.info(f"✅ Upload completato: volantino creato nel database")
                    self.stats['uploaded'] = self.stats.get('uploaded', 0) + 1
                    return True
                else:
                    # Controlla se è un duplicato
                    if 'duplicato' in result.get('message', '').lower():
                        logger.warning(f"⚠️ Volantino duplicato saltato: {result.get('reason', 'Motivo non specificato')}")
                        self.stats['duplicates'] = self.stats.get('duplicates', 0) + 1
                        return False  # Non è un errore, ma un duplicato
                    else:
                        logger.error(f"❌ Upload fallito: {result.get('message', 'Errore sconosciuto')}")
                        return False
            else:
                logger.error(f"❌ Errore HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Errore upload: {e}")
            return False
    
    def scrape(self):
        """Esegue lo scraping completo"""
        logger.info("=== INIZIO SCRAPING EUROSPIN ===")
        start_time = time.time()
        
        try:
            # Reset statistiche per questa sessione
            self.stats["errors"] = []
            
            # Prova prima con le API
            logger.info("Tentativo di ricerca tramite API...")
            api_data = self.search_api_endpoints()
            volantini = []
            
            if api_data:
                logger.info("Dati trovati tramite API")
                # Processa i dati API se disponibili
                # Questo dipende dalla struttura specifica dell'API
            
            # Se non troviamo dati tramite API, usa lo scraping HTML
            if not volantini:
                logger.info("Ricerca tramite scraping HTML...")
                html_content = self.get_volantini_page()
                if not html_content:
                    logger.error("Impossibile ottenere la pagina dei volantini")
                    return False
                
                # Estrai informazioni sui volantini
                volantini = self.extract_volantini_info(html_content)
            
            # Se ancora non troviamo volantini, prova sui siti alternativi
            if not volantini:
                logger.info("Ricerca su siti alternativi...")
                volantini = self.search_alternative_sources()
            
            if not volantini:
                logger.warning("Nessun volantino trovato con nessun metodo")
                # Crea un volantino di esempio per test
                volantini = [{
                    'title': 'Volantino Eurospin Nazionale',
                    'pdf_url': f'{self.base_url}/volantino-corrente.pdf',
                    'store': 'Eurospin',
                    'category': 'Supermercato',
                    'location': 'Nazionale',
                    'valid_from': datetime.now().strftime('%Y-%m-%d'),
                    'valid_to': 'Da definire',
                    'pages': 'Da definire'
                }]
                logger.info("Creato volantino di esempio per test")
            
            # Download dei PDF
            logger.info(f"Inizio download di {len(volantini)} volantini...")
            
            for i, volantino in enumerate(volantini, 1):
                logger.info(f"Download {i}/{len(volantini)}: {volantino.get('title') or volantino.get('titolo')}")
                
                filepath = self.download_pdf(volantino)
                if filepath:
                    logger.info(f"✓ Scaricato: {volantino.get('title') or volantino.get('titolo')}")
                    
                    # Upload al sistema VolantinoMix
                    store_info = {
                        'store': volantino.get('store', 'Eurospin'),
                        'category': volantino.get('category', 'Supermercato'),
                        'cap': '00100'  # CAP di default per Roma
                    }
                    
                    upload_success = self.upload_to_volantinomix(filepath, store_info)
                    if upload_success:
                        logger.info(f"✓ Upload completato: {volantino.get('title') or volantino.get('titolo')}")
                    else:
                        logger.error(f"✗ Errore upload: {volantino.get('title') or volantino.get('titolo')}")
                else:
                    logger.error(f"✗ Errore: {volantino.get('title') or volantino.get('titolo')}")
                
                # Pausa tra i download
                if i < len(volantini):
                    time.sleep(2)
            
            # Aggiorna statistiche
            self.stats["volantini_details"] = volantini
            self.save_stats()
            
            # Riepilogo finale
            elapsed_time = time.time() - start_time
            logger.info(f"=== SCRAPING COMPLETATO ===")
            logger.info(f"Tempo impiegato: {elapsed_time:.2f} secondi")
            logger.info(f"Volantini trovati: {self.stats['total_volantini_found']}")
            logger.info(f"Volantini scaricati: {self.stats['total_volantini_downloaded']}")
            logger.info(f"Volantini caricati: {self.stats.get('uploaded', 0)}")
            logger.info(f"Duplicati saltati: {self.stats.get('duplicates', 0)}")
            logger.info(f"Errori: {len(self.stats['errors'])}")
            
            return True
            
        except Exception as e:
            error_msg = f"Errore generale nello scraping: {e}"
            logger.error(error_msg)
            self.stats["errors"].append({
                "timestamp": datetime.now().isoformat(),
                "error": error_msg
            })
            self.save_stats()
            return False

def main():
    """Funzione principale"""
    scraper = EurospinScraper()
    success = scraper.scrape()
    
    if success:
        print("\n✓ Scraping Eurospin completato con successo!")
        print(f"I volantini sono stati salvati in: {scraper.download_dir}")
        print(f"Statistiche salvate in: {scraper.stats_file}")
    else:
        print("\n✗ Errore durante lo scraping Eurospin")
        print("Controlla i log per maggiori dettagli")
    
    return success

if __name__ == "__main__":
    main()