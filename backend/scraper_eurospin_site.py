#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scraper Eurospin (sito ufficiale) – trova link PDF del volantino e carica su VolantinoMix
"""
import os
import time
import re
from urllib.parse import urljoin, urlparse
from pathlib import Path
import requests
from bs4 import BeautifulSoup


class EurospinSiteScraper:
    def __init__(self, start_url: str = "https://www.eurospin.it/", download_dir: str = "volantini_eurospin_site", api_base_url: str | None = None):
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
        # fallback: cerca anche negli iframe
        for iframe in soup.find_all("iframe", src=True):
            src = iframe["src"].strip()
            if src.lower().endswith(".pdf"):
                links.add(src if src.startswith("http") else urljoin(base, src))
        return list(links)

    def download_pdf(self, url: str) -> str | None:
        try:
            resp = self.session.get(url, timeout=30)
            resp.raise_for_status()
            if not resp.content.startswith(b"%PDF"):
                print(f"[EurospinSite] Non-PDF content: {url}")
                return None
            name = os.path.basename(urlparse(url).path) or f"eurospin_{int(time.time())}.pdf"
            path = self.download_dir / name
            with open(path, "wb") as f:
                f.write(resp.content)
            return str(path)
        except Exception as e:
            print(f"[EurospinSite] Download error {url}: {e}")
            return None

    def upload(self, file_path: str) -> bool:
        try:
            url = f"{self.api_base_url}/pdfs/upload"
            with open(file_path, "rb") as f:
                files = {"pdfs": (os.path.basename(file_path), f, "application/pdf")}
                data = {
                    "store": "Eurospin",
                    "category": "Supermercato",
                    "location.cap": "00000",
                    "source": "eurospin_site",
                }
                r = self.session.post(url, files=files, data=data, timeout=60)
                if r.status_code == 200 and r.json().get("success"):
                    return True
                print("[EurospinSite] Upload failed:", r.status_code, r.text[:300])
        except Exception as e:
            print("[EurospinSite] Upload error:", e)
        return False

    def run(self):
        try:
            r = self.session.get(self.start_url, timeout=20)
            r.raise_for_status()
            pdfs = set(self.find_pdf_links(r.content, self.start_url))

            # Cerca link con testo "Sfoglia il volantino" e seguili (profondità 1)
            soup = BeautifulSoup(r.content, 'html.parser')
            browse_links = []
            for a in soup.find_all('a', href=True):
                text = (a.get_text() or '').strip().lower()
                if 'sfoglia il volantino' in text:
                    href = a['href']
                    browse_links.append(href if href.startswith('http') else urljoin(self.start_url, href))

            for url in browse_links[:6]:
                try:
                    rr = self.session.get(url, timeout=20)
                    if rr.ok:
                        found = self.find_pdf_links(rr.content, url)
                        pdfs.update(found)
                        time.sleep(1)
                except Exception:
                    pass

            pdfs = list(pdfs)
            print(f"[EurospinSite] PDF trovati: {len(pdfs)}")
            created = 0
            for url in pdfs:
                fp = self.download_pdf(url)
                if not fp:
                    continue
                if self.upload(fp):
                    created += 1
                time.sleep(1)
            print(f"[EurospinSite] Completato. Caricati: {created}")
        except Exception as e:
            print("[EurospinSite] Errore run:", e)


if __name__ == "__main__":
    EurospinSiteScraper().run()


