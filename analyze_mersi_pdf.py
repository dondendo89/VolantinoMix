#!/usr/bin/env python3
import os
import sys

def analyze_pdf_size_and_content(pdf_path):
    """Analizza un PDF per determinare se contiene contenuto significativo"""
    if not os.path.exists(pdf_path):
        print(f"File non trovato: {pdf_path}")
        return False
    
    # Verifica dimensione file
    file_size = os.path.getsize(pdf_path)
    print(f"Dimensione file: {file_size:,} bytes ({file_size/1024/1024:.2f} MB)")
    
    # Un PDF di 7.4MB dovrebbe contenere contenuto significativo
    if file_size < 100000:  # Meno di 100KB potrebbe essere vuoto
        print("⚠️  File molto piccolo, potrebbe essere vuoto o contenere solo testo")
        return False
    elif file_size > 1000000:  # Più di 1MB probabilmente contiene immagini
        print("✅ File di dimensioni significative, probabilmente contiene immagini/contenuto")
        return True
    else:
        print("❓ File di dimensioni medie, contenuto incerto")
        return None

def check_pdf_accessibility(pdf_url):
    """Verifica se il PDF è accessibile via web"""
    import requests
    try:
        response = requests.head(pdf_url, timeout=10)
        print(f"Status HTTP: {response.status_code}")
        print(f"Content-Type: {response.headers.get('Content-Type', 'N/A')}")
        print(f"Content-Length: {response.headers.get('Content-Length', 'N/A')} bytes")
        return response.status_code == 200
    except Exception as e:
        print(f"Errore nell'accesso al PDF: {e}")
        return False

if __name__ == '__main__':
    pdf_path = '/Users/dev1/Desktop/dev/volantinoMix/volantini/mersi/Mersi-16-agosto-.pdf'
    pdf_url = 'http://localhost:5000/volantini/mersi/Mersi-16-agosto-.pdf'
    
    print("=== ANALISI PDF MERSI ===")
    print(f"File locale: {pdf_path}")
    
    # Analizza file locale
    local_result = analyze_pdf_size_and_content(pdf_path)
    
    print("\n=== VERIFICA ACCESSIBILITÀ WEB ===")
    print(f"URL web: {pdf_url}")
    
    # Verifica accessibilità web
    web_result = check_pdf_accessibility(pdf_url)
    
    print("\n=== CONCLUSIONI ===")
    if local_result and web_result:
        print("✅ Il PDF sembra contenere contenuto valido ed è accessibile")
        print("💡 Il problema del 'volantino vuoto' potrebbe essere:")
        print("   - Contenuto solo promozionale senza prodotti specifici")
        print("   - Problema di visualizzazione nel frontend")
        print("   - PDF con layout non standard")
    elif local_result is False:
        print("❌ Il PDF potrebbe essere effettivamente vuoto o corrotto")
    else:
        print("❓ Analisi inconclusiva, necessaria verifica manuale")
    
    print("\n💡 Suggerimenti:")
    print("1. Aprire il PDF direttamente nel browser per verifica visuale")
    print("2. Verificare se esistono volantini più recenti sul sito")
    print("3. Controllare se il problema è nel frontend dell'applicazione")