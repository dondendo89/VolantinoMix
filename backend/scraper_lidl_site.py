#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Scraper Lidl (sito ufficiale) – trova link PDF dei volantini e carica su VolantinoMix
"""
import os
import time
from urllib.parse import urljoin, urlparse
from pathlib import Path
import requests
from bs4 import BeautifulSoup


class LidlSiteScraper:
    def __init__(self, start_url: str = "https://www.lidl.it/", download_dir: str = "volantini_lidl_site", api_base_url: str | None = None):
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
        return list(links)

    def download_pdf(self, url: str) -> str | None:
        try:
            r = self.session.get(url, timeout=30)
            r.raise_for_status()
            if not r.content.startswith(b"%PDF"):
                print(f"[LidlSite] Non-PDF content: {url}")
                return None
            name = os.path.basename(urlparse(url).path) or f"lidl_{int(time.time())}.pdf"
            path = self.download_dir / name
            with open(path, "wb") as f:
                f.write(r.content)
            return str(path)
        except Exception as e:
            print(f"[LidlSite] Download error {url}: {e}")
            return None

    def upload(self, file_path: str) -> bool:
        try:
            url = f"{self.api_base_url}/pdfs/upload"
            with open(file_path, "rb") as f:
                files = {"pdfs": (os.path.basename(file_path), f, "application/pdf")}
                data = {
                    "store": "Lidl",
                    "category": "Supermercato",
                    "location.cap": "00000",
                    "source": "lidl_site",
                }
                r = self.session.post(url, files=files, data=data, timeout=60)
                if r.status_code == 200 and r.json().get("success"):
                    return True
                print("[LidlSite] Upload failed:", r.status_code, r.text[:300])
        except Exception as e:
            print("[LidlSite] Upload error:", e)
        return False

    def run(self):
        try:
            r = self.session.get(self.start_url, timeout=20)
            r.raise_for_status()
            pdfs = self.find_pdf_links(r.content, self.start_url)
            print(f"[LidlSite] PDF trovati: {len(pdfs)}")
            created = 0
            for url in pdfs:
                fp = self.download_pdf(url)
                if not fp:
                    continue
                if self.upload(fp):
                    created += 1
                time.sleep(1)
            print(f"[LidlSite] Completato. Caricati: {created}")
        except Exception as e:
            print("[LidlSite] Errore run:", e)


if __name__ == "__main__":
    LidlSiteScraper().run()


