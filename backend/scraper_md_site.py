#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scraper MD (sito ufficiale) – recupera link PDF dalla sezione volantino e carica su VolantinoMix
"""
import os
import time
from urllib.parse import urljoin, urlparse
from pathlib import Path
import requests
from bs4 import BeautifulSoup


class MDSiteScraper:
    def __init__(self, start_url: str = "https://www.mdspa.it/volantino/", download_dir: str = "volantini_md_site", api_base_url: str | None = None):
        if api_base_url is None:
            port = os.environ.get("PORT", "3000")
            api_base_url = f"http://localhost:{port}/api"
        self.start_url = start_url
        self.download_dir = Path(download_dir)
        self.api_base_url = api_base_url
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
            "Connection": "keep-alive",
        })
        self.download_dir.mkdir(parents=True, exist_ok=True)

    def find_pdf_links(self, html: bytes, base: str) -> list[str]:
        soup = BeautifulSoup(html, "html.parser")
        links = set()
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if href.lower().endswith(".pdf"):
                links.add(href if href.startswith("http") else urljoin(base, href))
        for iframe in soup.find_all("iframe", src=True):
            src = iframe["src"].strip()
            if src.lower().endswith(".pdf"):
                links.add(src if src.startswith("http") else urljoin(base, src))
        # Fallback generico
        text = soup.get_text("\n", strip=True) + "\n" + str(soup)
        for token in text.split():
            if token.lower().endswith('.pdf') and ('http' in token or token.startswith('/')):
                full = token if token.startswith('http') else urljoin(base, token)
                links.add(full)
        return list(links)

    def download_pdf(self, url: str) -> str | None:
        try:
            r = self.session.get(url, timeout=30)
            r.raise_for_status()
            if not r.content.startswith(b"%PDF"):
                print(f"[MDSite] Non-PDF content: {url}")
                return None
            name = os.path.basename(urlparse(url).path) or f"md_{int(time.time())}.pdf"
            path = self.download_dir / name
            with open(path, "wb") as f:
                f.write(r.content)
            return str(path)
        except Exception as e:
            print(f"[MDSite] Download error {url}: {e}")
            return None

    def upload(self, file_path: str) -> bool:
        try:
            url = f"{self.api_base_url}/pdfs/upload"
            with open(file_path, "rb") as f:
                files = {"pdfs": (os.path.basename(file_path), f, "application/pdf")}
                data = {
                    "store": "MD",
                    "category": "Supermercato",
                    "location.cap": "00000",
                    "source": "md_site",
                }
                r = self.session.post(url, files=files, data=data, timeout=60)
                if r.status_code == 200 and r.json().get("success"):
                    return True
                print("[MDSite] Upload failed:", r.status_code, r.text[:300])
        except Exception as e:
            print("[MDSite] Upload error:", e)
        return False

    def run(self):
        try:
            r = self.session.get(self.start_url, timeout=20)
            r.raise_for_status()
            pdfs = set(self.find_pdf_links(r.content, self.start_url))
            soup = BeautifulSoup(r.content, 'html.parser')
            for a in soup.find_all('a', href=True):
                href = a['href']
                if any(k in href.lower() for k in ['volantino', 'offerte', 'promo']):
                    try:
                        rr = self.session.get(href if href.startswith('http') else urljoin(self.start_url, href), timeout=20)
                        if rr.ok:
                            pdfs.update(self.find_pdf_links(rr.content, self.start_url))
                            time.sleep(1)
                    except Exception:
                        pass
            pdfs = list(pdfs)
            print(f"[MDSite] PDF trovati: {len(pdfs)}")
            created = 0
            for url in pdfs:
                fp = self.download_pdf(url)
                if not fp:
                    continue
                if self.upload(fp):
                    created += 1
                time.sleep(1)
            print(f"[MDSite] Completato. Caricati: {created}")
        except Exception as e:
            print("[MDSite] Errore run:", e)


if __name__ == "__main__":
    MDSiteScraper().run()


