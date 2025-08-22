import requests
from bs4 import BeautifulSoup
import os
import re
import datetime

class MersiVolantiniScraper:
    def __init__(self, base_url='https://www.mersisupermercati.com/volantino/', upload_url=None, download_dir='volantini/mersi'):
        # Auto-detect API URL based on environment
        if upload_url is None:
            # In production (Render), use the same host with PORT env var
            port = os.environ.get('PORT', '3000')
            upload_url = f'http://localhost:{port}/api/pdfs/upload'
        self.base_url = base_url
        self.upload_url = upload_url
        self.download_dir = download_dir
        os.makedirs(self.download_dir, exist_ok=True)

    def scrape(self):
        response = requests.get(self.base_url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')

        pdf_urls = []
        
        # Search for all links that might contain PDFs
        all_links = soup.find_all('a', href=True)
        for link in all_links:
            href = link['href']
            if href.endswith('.pdf'):
                pdf_urls.append(href)
        
        # Search for elementor images
        for elem in soup.find_all(class_='elementor-image'):
            # Check for direct links
            a = elem.find('a')
            if a and a.get('href', '').endswith('.pdf'):
                pdf_urls.append(a['href'])
            # Check img src
            img = elem.find('img')
            if img:
                src = img.get('src', '')
                if src.endswith('.pdf'):
                    pdf_urls.append(src)
                # Check data attributes for potential PDF URLs
                for attr in img.attrs:
                    if isinstance(img[attr], str) and img[attr].endswith('.pdf'):
                        pdf_urls.append(img[attr])
            # Check if the element itself has data attributes with PDF
            for attr in elem.attrs:
                if isinstance(elem[attr], str) and elem[attr].endswith('.pdf'):
                    pdf_urls.append(elem[attr])
        
        # Search for any element with onclick or data attributes that might contain PDF URLs
        all_elements = soup.find_all(attrs={'onclick': True})
        for elem in all_elements:
            onclick = elem.get('onclick', '')
            if '.pdf' in onclick:
                # Extract PDF URL from onclick
                pdf_match = re.search(r'["\']([^"\']*.pdf)["\']', onclick)
                if pdf_match:
                    pdf_urls.append(pdf_match.group(1))
        
        # Remove duplicates
        pdf_urls = list(set(pdf_urls))

        print(f"Found {len(pdf_urls)} PDF URLs: {pdf_urls}")
        downloaded_files = []
        for url in pdf_urls:
            if not url.startswith('http'):
                url = 'https://www.mersisupermercati.com' + url
            filename = self.download_pdf(url)
            if filename:
                downloaded_files.append(filename)

        return downloaded_files

    def download_pdf(self, url):
        try:
            print(f"Attempting to download: {url}")
            response = requests.get(url)
            response.raise_for_status()
            print(f"Response status: {response.status_code}, Content length: {len(response.content)}")
            filename = os.path.join(self.download_dir, os.path.basename(url))
            print(f"Saving to: {filename}")
            with open(filename, 'wb') as f:
                f.write(response.content)
            print(f"Successfully saved: {filename}")
            return filename
        except Exception as e:
            print(f"Error downloading {url}: {e}")
            return None

    def extract_store_info(self, filename):
        # TODO: Implement store info extraction similar to Deco
        # For now, placeholder
        return {'store_type': 'MerSi', 'cap': 'Unknown'}

    def upload_pdf(self, filename):
        store_info = self.extract_store_info(filename)
        with open(filename, 'rb') as f:
            files = {'pdf': f}
            data = {'source': 'mersi', 'storeType': store_info['store_type'], 'cap': store_info['cap']}
            response = requests.post(self.upload_url, files=files, data=data)
            return response.json() if response.ok else None

    def run(self):
        files = self.scrape()
        for file in files:
            result = self.upload_pdf(file)
            if result:
                print(f"Uploaded {file}")

if __name__ == '__main__':
    scraper = MersiVolantiniScraper()
    scraper.run()