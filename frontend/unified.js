// Unified PDF Page JavaScript

class UnifiedPDFViewer {
    constructor() {
        this.pdfId = null;
        this.pdfData = null;
        this.currentZoom = 100;
        this.init();
    }

    init() {
        this.pdfId = this.getPDFIdFromURL();
        this.bindEvents();
        this.loadPDFData();
        // Removed loadRecommendedAds() call
    }

    getPDFIdFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    bindEvents() {
        // Navigation
        document.getElementById('back-btn').addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        // PDF Controls
        document.getElementById('zoom-in').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoom-out').addEventListener('click', () => this.zoomOut());
        document.getElementById('retry-btn').addEventListener('click', () => this.loadPDFData());

        // Action Buttons
        document.getElementById('download-btn').addEventListener('click', () => this.downloadPDF());
        document.getElementById('whatsapp-btn').addEventListener('click', () => this.shareWhatsApp());
        document.getElementById('email-btn').addEventListener('click', () => this.shareEmail());
        document.getElementById('share-btn').addEventListener('click', () => this.openShareModal());

        // Modal
        document.getElementById('close-modal').addEventListener('click', () => this.closeShareModal());
        document.getElementById('copy-link').addEventListener('click', () => this.copyShareLink());

        // Share options
        document.querySelectorAll('.share-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const platform = e.currentTarget.dataset.platform;
                this.shareOnPlatform(platform);
            });
        });

        // Mobile menu
        document.querySelector('.mobile-menu-toggle').addEventListener('click', () => this.toggleMobileMenu());

        // Modal backdrop click
        document.getElementById('share-modal').addEventListener('click', (e) => {
            if (e.target.id === 'share-modal') {
                this.closeShareModal();
            }
        });
    }

    toggleMobileMenu() {
        const navMenu = document.querySelector('.nav-menu');
        navMenu.classList.toggle('mobile-open');
    }

    async loadPDFData() {
        this.showLoading(true);
        
        try {
            // Prova prima a caricare dal localStorage
            const storedPDF = localStorage.getItem('currentPDF');
            if (storedPDF) {
                this.pdfData = JSON.parse(storedPDF);
                console.log('📄 Dati PDF caricati dal localStorage:', this.pdfData);
                this.renderPDFInfo();
                this.renderTableOfContents();
                this.loadPDFViewer();
                return;
            }
            
            // Se non disponibile nel localStorage e abbiamo un ID, prova l'API
            if (!this.pdfId) {
                this.showError('Nessun PDF disponibile');
                return;
            }

            // Chiamata API come fallback
            const response = await fetch(`http://localhost:5000/api/pdfs/info/${this.pdfId}`);
            
            if (!response.ok) {
                throw new Error(`Errore HTTP: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message || 'Errore nel caricamento del PDF');
            }
            
            this.pdfData = {
                id: this.pdfId,
                title: result.data.title || 'Volantino_Unificato_' + new Date().toISOString().split('T')[0] + '.pdf',
                url: result.data.url,
                downloadUrl: result.data.downloadUrl,
                totalPages: result.data.totalPages || 'N/A',
                fileSize: result.data.fileSizeFormatted || 'N/A',
                creationDate: new Date(result.data.createdAt).toLocaleDateString('it-IT') || new Date().toLocaleDateString('it-IT'),
                tableOfContents: result.data.tableOfContents || [
                    { title: 'Contenuto PDF', pages: '1-N', startPage: 1 }
                ]
            };

            this.renderPDFInfo();
            this.renderTableOfContents();
            this.loadPDFViewer();
            
        } catch (error) {
            console.error('Errore caricamento PDF:', error);
            this.showError('Errore durante il caricamento del PDF: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }

    showLoading(show) {
        const loading = document.getElementById('pdf-loading');
        const frame = document.getElementById('pdf-frame');
        const error = document.getElementById('pdf-error');
        
        if (show) {
            if (loading) loading.classList.remove('hidden');
            if (frame) frame.classList.add('hidden');
            if (error) error.classList.add('hidden');
        } else {
            if (loading) loading.classList.add('hidden');
        }
    }

    showError(message) {
        const loading = document.getElementById('pdf-loading');
        const frame = document.getElementById('pdf-frame');
        const error = document.getElementById('pdf-error');
        
        if (loading) loading.classList.add('hidden');
        if (frame) frame.classList.add('hidden');
        if (error) error.classList.remove('hidden');
        
        if (error) {
            const errorText = error.querySelector('p');
            if (errorText) {
                errorText.textContent = message;
            }
        }
        
        console.error('❌ Errore PDF:', message);
    }

    formatFileSize(bytes) {
        if (!bytes) return 'N/A';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    renderPDFInfo() {
        if (!this.pdfData) return;
        
        document.getElementById('pdf-title').textContent = this.pdfData.title;
        document.getElementById('total-pages').textContent = `${this.pdfData.totalPages} pagine`;
        document.getElementById('file-size').textContent = this.pdfData.fileSize;
        document.getElementById('creation-date').textContent = `Generato il ${this.pdfData.creationDate}`;
    }

    renderTableOfContents() {
        if (!this.pdfData || !this.pdfData.tableOfContents) return;
        
        const tocList = document.getElementById('toc-list');
        tocList.innerHTML = '';
        
        this.pdfData.tableOfContents.forEach((item, index) => {
            const tocItem = document.createElement('div');
            tocItem.className = 'toc-item';
            tocItem.dataset.startPage = item.startPage;
            
            tocItem.innerHTML = `
                <span class="toc-title">${item.title}</span>
                <span class="toc-pages">${item.pages}</span>
            `;
            
            tocItem.addEventListener('click', () => this.goToPage(item.startPage));
            tocList.appendChild(tocItem);
        });
    }

    loadPDFViewer() {
        if (!this.pdfData) return;
        
        const frame = document.getElementById('pdf-frame');
        const loading = document.getElementById('pdf-loading');
        const error = document.getElementById('pdf-error');
        
        if (this.pdfData.url) {
            // Use the complete PDF URL (already contains full URL from localStorage)
            const fullPdfUrl = this.pdfData.url.startsWith('http') ? this.pdfData.url : `http://localhost:5000${this.pdfData.url}`;
            
            // Create a button to open PDF in new window instead of iframe
            const pdfContainer = frame.parentElement;
            pdfContainer.innerHTML = `
                <div class="pdf-open-container">
                    <div class="pdf-preview-info">
                        <h3>📄 PDF Pronto per la Visualizzazione</h3>
                        <p>Il tuo volantino unificato è stato generato con successo!</p>
                        <div class="pdf-details">
                            <p><strong>Titolo:</strong> ${this.pdfData.title}</p>
                            <p><strong>Pagine:</strong> ${this.pdfData.totalPages}</p>
                            <p><strong>Dimensione:</strong> ${this.formatFileSize(this.pdfData.fileSize)}</p>
                        </div>
                    </div>
                    <div class="pdf-actions">
                        <button class="btn btn-primary btn-large" onclick="window.open('${fullPdfUrl}', '_blank')">
                            🔍 Visualizza PDF
                        </button>
                        <button class="btn btn-secondary" onclick="window.open('${fullPdfUrl}', '_blank'); const link = document.createElement('a'); link.href = '${fullPdfUrl}'; link.download = '${this.pdfData.title}'; link.click();">
                            📥 Scarica PDF
                        </button>
                    </div>
                </div>
            `;
            
            loading.classList.add('hidden');
            error.classList.add('hidden');
            
            console.log('📄 PDF caricato:', {
                id: this.pdfData.id,
                url: fullPdfUrl,
                pages: this.pdfData.totalPages
            });
            
            this.showNotification('PDF Caricato', 'Il volantino unificato è pronto per la visualizzazione!');
        } else {
            this.showError('URL del PDF non disponibile');
        }
    }

    generateMockPDFURL() {
        // Generate a mock PDF URL - in real implementation this would be the actual PDF
        return `data:text/html,<html><body style='margin:0;padding:20px;font-family:Arial;background:#f5f5f5;'><div style='background:white;padding:40px;margin:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);text-align:center;'><h1 style='color:#2563eb;margin-bottom:20px;'>Volantino Unificato</h1><p style='color:#666;font-size:18px;margin-bottom:30px;'>Questo è un'anteprima del tuo volantino personalizzato</p><div style='background:#f8fafc;padding:20px;border-radius:6px;margin:20px 0;'><h3 style='color:#1e293b;margin-bottom:15px;'>Contenuto incluso:</h3><ul style='text-align:left;color:#64748b;line-height:1.8;'><li>Pubblicità Sponsor</li><li>Volantino Esselunga (6 pagine)</li><li>Pubblicità Intermedia</li><li>Volantino Conad (6 pagine)</li><li>Pubblicità Intermedia</li><li>Volantino Lidl (6 pagine)</li><li>Volantino MediaWorld (2 pagine)</li><li>Offerte Finali</li></ul></div><p style='color:#10b981;font-weight:600;margin-top:30px;'>✓ PDF generato con successo!</p></div></body></html>`;
    }

    goToPage(pageNumber) {
        // In a real implementation, this would navigate to the specific page
        console.log(`Navigating to page ${pageNumber}`);
        
        // Update active TOC item
        document.querySelectorAll('.toc-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeItem = document.querySelector(`[data-start-page="${pageNumber}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }

    zoomIn() {
        if (this.currentZoom < 200) {
            this.currentZoom += 25;
            this.updateZoom();
        }
    }

    zoomOut() {
        if (this.currentZoom > 50) {
            this.currentZoom -= 25;
            this.updateZoom();
        }
    }

    updateZoom() {
        document.getElementById('zoom-level').textContent = `${this.currentZoom}%`;
        
        const frame = document.getElementById('pdf-frame');
        frame.style.transform = `scale(${this.currentZoom / 100})`;
        frame.style.transformOrigin = 'top left';
        
        // Adjust container height based on zoom
        const viewer = document.querySelector('.pdf-viewer');
        const baseHeight = 600;
        viewer.style.height = `${baseHeight * (this.currentZoom / 100)}px`;
    }

    async downloadPDF() {
        if (!this.pdfData) return;
        
        const btn = document.getElementById('download-btn');
        const originalText = btn.innerHTML;
        
        btn.innerHTML = '<div class="spinner" style="width: 24px; height: 24px; margin-right: 8px;"></div>Download...';
        btn.disabled = true;
        
        try {
            // Simulate download preparation
            await this.delay(2000);
            
            // Trigger download using window.open for better browser compatibility
            const downloadUrl = this.pdfData.downloadUrl || this.pdfData.url;
            const fullUrl = downloadUrl.startsWith('http') ? downloadUrl : `http://localhost:5000${downloadUrl}`;
            
            // Try multiple download methods for better compatibility
            try {
                // Method 1: Direct window.open
                window.open(fullUrl, '_blank');
            } catch (e) {
                // Method 2: Create and click link as fallback
                const link = document.createElement('a');
                link.href = fullUrl;
                link.download = this.pdfData.title;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
            
            this.showNotification('Download Avviato', 'Il download del PDF è iniziato!');
            
        } catch (error) {
            console.error('Errore download:', error);
            alert('Errore durante il download. Riprova.');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    shareWhatsApp() {
        if (!this.pdfData) return;
        
        const shareUrl = this.getShareURL();
        const message = `Guarda questo volantino unificato che ho creato con VolantinoMix! ${shareUrl}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        
        window.open(whatsappUrl, '_blank');
    }

    shareEmail() {
        if (!this.pdfData) return;
        
        const shareUrl = this.getShareURL();
        const subject = 'Volantino Unificato - VolantinoMix';
        const body = `Ciao!\n\nHo creato un volantino unificato con VolantinoMix che potrebbe interessarti.\n\nPuoi visualizzarlo qui: ${shareUrl}\n\nSaluti!`;
        
        const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;
    }

    openShareModal() {
        const modal = document.getElementById('share-modal');
        const shareUrl = this.getShareURL();
        
        document.getElementById('share-url').value = shareUrl;
        modal.classList.remove('hidden');
        
        // Focus on the input for easy copying
        setTimeout(() => {
            document.getElementById('share-url').select();
        }, 100);
    }

    closeShareModal() {
        const modal = document.getElementById('share-modal');
        modal.classList.add('hidden');
    }

    async copyShareLink() {
        const input = document.getElementById('share-url');
        const btn = document.getElementById('copy-link');
        const originalText = btn.textContent;
        
        try {
            await navigator.clipboard.writeText(input.value);
            btn.textContent = 'Copiato!';
            btn.classList.add('copied');
            
            setTimeout(() => {
                btn.textContent = originalText;
                btn.classList.remove('copied');
            }, 2000);
            
        } catch (error) {
            // Fallback for older browsers
            input.select();
            document.execCommand('copy');
            btn.textContent = 'Copiato!';
            
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }
    }

    shareOnPlatform(platform) {
        const shareUrl = this.getShareURL();
        const title = 'Volantino Unificato - VolantinoMix';
        const description = 'Ho creato un volantino unificato con VolantinoMix!';
        
        let url = '';
        
        switch (platform) {
            case 'facebook':
                url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
                break;
            case 'twitter':
                url = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(description)}`;
                break;
            case 'linkedin':
                url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
                break;
            case 'telegram':
                url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(description)}`;
                break;
        }
        
        if (url) {
            window.open(url, '_blank', 'width=600,height=400');
        }
    }

    getShareURL() {
        return `${window.location.origin}/unified.html?id=${this.pdfId}`;
    }

    // Removed loadRecommendedAds() function

    showNotification(title, message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: '/favicon.ico'
            });
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the application
const pdfViewer = new UnifiedPDFViewer();

// Handle browser back button
window.addEventListener('popstate', () => {
    window.location.href = 'index.html';
});

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case 's':
                e.preventDefault();
                pdfViewer.downloadPDF();
                break;
            case '=':
            case '+':
                e.preventDefault();
                pdfViewer.zoomIn();
                break;
            case '-':
                e.preventDefault();
                pdfViewer.zoomOut();
                break;
        }
    }
    
    if (e.key === 'Escape') {
        pdfViewer.closeShareModal();
    }
});

// Initialize AdSense
if (typeof adsbygoogle !== 'undefined') {
    (adsbygoogle = window.adsbygoogle || []).push({});
}