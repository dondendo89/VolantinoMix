#!/usr/bin/env python3

import os
import sys
from scraper_eurospin import EurospinScraper
import logging

# Configurazione logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_upload():
    """Test dell'upload di un PDF al sistema VolantinoMix"""
    
    # Inizializza lo scraper con l'URL dell'API
    scraper = EurospinScraper(api_base_url="http://localhost:5000/api")
    
    # Verifica se esiste un PDF scaricato
    eurospin_dir = './volantini_eurospin'
    if os.path.exists(eurospin_dir):
        pdf_files = [f for f in os.listdir(eurospin_dir) if f.endswith('.pdf')]
    else:
        pdf_files = []
    
    if not pdf_files:
        logger.error("Nessun PDF Eurospin trovato per il test")
        return False
    
    pdf_file = os.path.join(eurospin_dir, pdf_files[0])
    logger.info(f"Test upload con file: {pdf_file}")
    
    # Informazioni del negozio per il test
    store_info = {
        'store': 'Eurospin',
        'category': 'Supermercato',
        'cap': '00100'
    }
    
    # Tenta l'upload
    success = scraper.upload_to_volantinomix(pdf_file, store_info)
    
    if success:
        logger.info("✅ Test upload completato con successo!")
        return True
    else:
        logger.error("❌ Test upload fallito")
        return False

if __name__ == "__main__":
    test_upload()