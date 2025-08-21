class AdminPanel {
    constructor() {
        this.apiBase = window.location.origin;
        this.selectedFiles = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadFileList();
        this.updateStats();
        this.updateDecoStats();
        this.updateIpercoopStats();
    }

    setupEventListeners() {
        // Upload area events
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const uploadForm = document.getElementById('uploadForm');
        const clearBtn = document.getElementById('clearBtn');
        const refreshBtn = document.getElementById('refreshBtn');
        const cleanupBtn = document.getElementById('cleanupBtn');
        
        // Decò scraping events
        const startScrapingBtn = document.getElementById('startScrapingBtn');
        const forceScrapingBtn = document.getElementById('forceScrapingBtn');
        const checkDecoStatusBtn = document.getElementById('checkDecoStatusBtn');
        const cleanupDecoBtn = document.getElementById('cleanupDecoBtn');
        const deleteAllDecoPdfsBtn = document.getElementById('deleteAllDecoPdfsBtn');
        
        // Ipercoop scraping events
        const startIpercoopScrapingBtn = document.getElementById('startIpercoopScrapingBtn');
        const forceIpercoopScrapingBtn = document.getElementById('forceIpercoopScrapingBtn');
        const checkIpercoopStatusBtn = document.getElementById('checkIpercoopStatusBtn');
        const cleanupIpercoopBtn = document.getElementById('cleanupIpercoopBtn');
        const deleteAllIpercoopPdfsBtn = document.getElementById('deleteAllIpercoopPdfsBtn');
        
        // Eurospin scraping events
        const startEurospinScrapingBtn = document.getElementById('startEurospinScrapingBtn');
        const forceEurospinScrapingBtn = document.getElementById('forceEurospinScrapingBtn');
        const checkEurospinStatusBtn = document.getElementById('checkEurospinStatusBtn');
        const cleanupEurospinBtn = document.getElementById('cleanupEurospinBtn');
        const deleteAllEurospinPdfsBtn = document.getElementById('deleteAllEurospinPdfsBtn');

        // Click to select files
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files);
        });

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            this.handleFileSelect(e.dataTransfer.files);
        });

        // Form submission
        uploadForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.uploadFiles();
        });

        // Clear button
        clearBtn.addEventListener('click', () => {
            this.clearForm();
        });

        // Refresh button
        refreshBtn.addEventListener('click', () => {
            this.loadFileList();
            this.updateStats();
        });

        // Cleanup button
        cleanupBtn.addEventListener('click', () => {
            this.cleanupFiles();
        });
        
        // Reset stats button
        const resetStatsBtn = document.getElementById('resetStatsBtn');
        if (resetStatsBtn) {
            resetStatsBtn.addEventListener('click', () => {
                if (confirm('Sei sicuro di voler azzerare tutte le statistiche?')) {
                    this.resetStats();
                }
            });
        }
        
        // Decò scraping event listeners
        if (startScrapingBtn) {
            startScrapingBtn.addEventListener('click', () => {
                this.startDecoScraping(false);
            });
        }
        
        if (forceScrapingBtn) {
            forceScrapingBtn.addEventListener('click', () => {
                this.startDecoScraping(true);
            });
        }
        
        if (checkDecoStatusBtn) {
            checkDecoStatusBtn.addEventListener('click', () => {
                this.updateDecoStats();
            });
        }
        
        if (cleanupDecoBtn) {
            cleanupDecoBtn.addEventListener('click', () => {
                this.cleanupDecoFlyers();
            });
        }
        
        if (deleteAllDecoPdfsBtn) {
            deleteAllDecoPdfsBtn.addEventListener('click', () => {
                this.deleteAllDecoPdfs();
            });
        }
        
        // Ipercoop scraping event listeners
        if (startIpercoopScrapingBtn) {
            startIpercoopScrapingBtn.addEventListener('click', () => {
                this.startIpercoopScraping(false);
            });
        }
        
        if (forceIpercoopScrapingBtn) {
            forceIpercoopScrapingBtn.addEventListener('click', () => {
                this.startIpercoopScraping(true);
            });
        }
        
        if (checkIpercoopStatusBtn) {
            checkIpercoopStatusBtn.addEventListener('click', () => {
                this.updateIpercoopStats();
            });
        }
        
        if (cleanupIpercoopBtn) {
            cleanupIpercoopBtn.addEventListener('click', () => {
                this.cleanupIpercoopFlyers();
            });
        }
        
        if (deleteAllIpercoopPdfsBtn) {
            deleteAllIpercoopPdfsBtn.addEventListener('click', () => {
                this.deleteAllIpercoopPdfs();
            });
        }
        
        // Eurospin scraping event listeners
        if (startEurospinScrapingBtn) {
            startEurospinScrapingBtn.addEventListener('click', () => {
                this.startEurospinScraping(false);
            });
        }
        
        if (forceEurospinScrapingBtn) {
            forceEurospinScrapingBtn.addEventListener('click', () => {
                this.startEurospinScraping(true);
            });
        }
        
        if (checkEurospinStatusBtn) {
            checkEurospinStatusBtn.addEventListener('click', () => {
                this.updateEurospinStats();
            });
        }
        
        if (cleanupEurospinBtn) {
            cleanupEurospinBtn.addEventListener('click', () => {
                this.cleanupEurospinFlyers();
            });
        }
        
        if (deleteAllEurospinPdfsBtn) {
            deleteAllEurospinPdfsBtn.addEventListener('click', () => {
                this.deleteAllEurospinPdfs();
            });
        }
    }

    handleFileSelect(files) {
        const validFiles = [];
        const maxSize = 20 * 1024 * 1024; // 20MB

        for (let file of files) {
            if (file.type !== 'application/pdf') {
                this.showMessage('Errore: Solo file PDF sono supportati', 'error');
                continue;
            }

            if (file.size > maxSize) {
                this.showMessage(`Errore: ${file.name} è troppo grande (max 20MB)`, 'error');
                continue;
            }

            validFiles.push(file);
        }

        if (validFiles.length > 10) {
            this.showMessage('Errore: Massimo 10 file per volta', 'error');
            return;
        }

        this.selectedFiles = validFiles;
        this.updateFilePreview();
    }

    updateFilePreview() {
        const uploadArea = document.getElementById('uploadArea');
        
        // Controllo sicurezza per l'elemento uploadArea
        if (!uploadArea) {
            console.warn('Elemento uploadArea non trovato');
            return;
        }
        
        if (this.selectedFiles.length === 0) {
            uploadArea.innerHTML = `
                <div class="upload-icon">📁</div>
                <h3>Trascina i file PDF qui o clicca per selezionare</h3>
                <p>Supporta file PDF fino a 20MB ciascuno (max 10 file)</p>
            `;
        } else {
            const fileList = this.selectedFiles.map(file => 
                `<div style="margin: 5px 0; padding: 8px; background: white; border-radius: 5px; font-size: 0.9rem;">
                    📄 ${file.name} (${this.formatFileSize(file.size)})
                </div>`
            ).join('');
            
            uploadArea.innerHTML = `
                <div class="upload-icon">📄</div>
                <h3>${this.selectedFiles.length} file selezionati</h3>
                <div style="margin-top: 15px;">${fileList}</div>
                <p style="margin-top: 15px; font-size: 0.9rem; color: #666;">Clicca per selezionare altri file</p>
            `;
        }
    }

    async uploadFiles() {
        if (this.selectedFiles.length === 0) {
            this.showMessage('Seleziona almeno un file PDF', 'error');
            return;
        }

        const formData = new FormData();
        
        // Add files
        this.selectedFiles.forEach(file => {
            formData.append('pdfs', file);
        });

        // Add metadata
        const store = document.getElementById('store').value;
        const category = document.getElementById('category').value;
        const cap = document.getElementById('cap').value;

        if (store) formData.append('store', store);
        if (category) formData.append('category', category);
        if (cap) formData.append('location[cap]', cap);

        this.showLoading('loadingUpload', true);
        this.setButtonState('uploadBtn', false);

        try {
            const response = await fetch(`${this.apiBase}/api/pdfs/upload`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage(
                    `✅ ${result.data.totalUploaded} file caricati con successo!`, 
                    'success'
                );
                this.clearForm();
                this.loadFileList();
                this.updateStats();
            } else {
                this.showMessage(`Errore: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showMessage('Errore durante il caricamento', 'error');
        } finally {
            this.showLoading('loadingUpload', false);
            this.setButtonState('uploadBtn', true);
        }
    }

    clearForm() {
        this.selectedFiles = [];
        
        // Controllo sicurezza per gli elementi del form
        const fileInput = document.getElementById('fileInput');
        const store = document.getElementById('store');
        const category = document.getElementById('category');
        const cap = document.getElementById('cap');
        
        if (fileInput) fileInput.value = '';
        if (store) store.value = '';
        if (category) category.value = '';
        if (cap) cap.value = '';
        
        this.updateFilePreview();
        this.hideMessage();
    }

    async loadFileList() {
        this.showLoading('loadingFiles', true);
        
        try {
            // Get list of files from uploads directory
            const response = await fetch(`${this.apiBase}/api/pdfs/files`);
            
            if (!response.ok) {
                // If endpoint doesn't exist, show placeholder
                this.showFileListPlaceholder();
                return;
            }

            const result = await response.json();
            const files = result.files || result; // Gestisce sia {files: [...]} che [...]
            this.renderFileList(files);
        } catch (error) {
            console.error('Error loading files:', error);
            this.showFileListPlaceholder();
        } finally {
            this.showLoading('loadingFiles', false);
        }
    }

    showFileListPlaceholder() {
        const fileList = document.getElementById('fileList');
        if (!fileList) {
            console.warn('Elemento fileList non trovato');
            return;
        }
        fileList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <div style="font-size: 3rem; margin-bottom: 15px;">📁</div>
                <h3>Lista File Non Disponibile</h3>
                <p>L'endpoint per elencare i file non è ancora implementato.</p>
                <p style="margin-top: 10px; font-size: 0.9rem;">I file caricati sono comunque salvati correttamente.</p>
            </div>
        `;
    }

    renderFileList(files) {
        const fileList = document.getElementById('fileList');
        if (!fileList) {
            console.warn('Elemento fileList non trovato');
            return;
        }
        
        if (!files || files.length === 0) {
            fileList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <div style="font-size: 3rem; margin-bottom: 15px;">📄</div>
                    <h3>Nessun File Caricato</h3>
                    <p>Carica il primo volantino PDF per iniziare!</p>
                </div>
            `;
            return;
        }

        const fileItems = files.map(file => `
            <div class="file-item">
                <div class="file-info">
                    <div class="file-name">📄 ${file.originalName || file.name}</div>
                    <div class="file-details">
                        Dimensione: ${this.formatFileSize(file.size || 0)} | 
                        Caricato: ${this.formatDate(file.uploadDate || file.modified)}
                        ${file.store ? ` | Negozio: ${file.store}` : ''}
                        ${file.category ? ` | Categoria: ${file.category}` : ''}
                    </div>
                </div>
                <div class="file-actions">
                    <button class="btn" onclick="adminPanel.viewFile('${file.filename || file.name}')">
                        👁️ Visualizza
                    </button>
                    <button class="btn btn-danger" onclick="adminPanel.deleteFile('${file.filename || file.name}')">
                        🗑️ Elimina
                    </button>
                </div>
            </div>
        `).join('');

        fileList.innerHTML = fileItems;
    }

    async updateStats() {
        try {
            // Mock stats for now - in a real implementation, these would come from an API
            const stats = {
                totalFiles: await this.getTotalFiles(),
                totalSize: await this.getTotalSize(),
                todayUploads: await this.getTodayUploads()
            };

            const totalFilesEl = document.getElementById('totalFiles');
            const totalSizeEl = document.getElementById('totalSize');
            const todayUploadsEl = document.getElementById('todayUploads');
            
            if (totalFilesEl) totalFilesEl.textContent = stats.totalFiles;
            if (totalSizeEl) totalSizeEl.textContent = this.formatFileSize(stats.totalSize);
            if (todayUploadsEl) todayUploadsEl.textContent = stats.todayUploads;
        } catch (error) {
            console.error('Error updating stats:', error);
            document.getElementById('totalFiles').textContent = '-';
            document.getElementById('totalSize').textContent = '-';
            document.getElementById('todayUploads').textContent = '-';
        }
    }

    async getTotalFiles() {
        // Statistiche azzerate
        return 0;
    }

    async getTotalSize() {
        // Statistiche azzerate
        return 0;
    }

    async getTodayUploads() {
        // Statistiche azzerate
        return 0;
    }

    async resetStats() {
        // Metodo per azzerare manualmente le statistiche
        const totalFilesEl = document.getElementById('totalFiles');
        const totalSizeEl = document.getElementById('totalSize');
        const todayUploadsEl = document.getElementById('todayUploads');
        
        if (totalFilesEl) totalFilesEl.textContent = '0';
        if (totalSizeEl) totalSizeEl.textContent = '0 Bytes';
        if (todayUploadsEl) todayUploadsEl.textContent = '0';
        
        this.showMessage('Statistiche azzerate con successo!', 'success');
    }

    viewFile(filename) {
        const url = `${this.apiBase}/api/pdfs/download/${filename}`;
        console.log('🔍 DEBUG - Tentativo di aprire URL:', url);
        
        // Prova prima con window.open
        const newWindow = window.open(url, '_blank');
        
        // Se window.open è bloccato, prova con location.href
        if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') {
            console.log('⚠️ DEBUG - window.open bloccato, uso location.href');
            window.location.href = url;
        } else {
            console.log('✅ DEBUG - PDF aperto in nuova finestra');
        }
    }

    async deleteFile(filename) {
        if (!confirm(`Sei sicuro di voler eliminare il file "${filename}"?`)) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/api/pdfs/delete/${filename}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showMessage('File eliminato con successo', 'success');
                this.loadFileList();
                this.updateStats();
            } else {
                this.showMessage('Errore durante l\'eliminazione del file', 'error');
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showMessage('Errore durante l\'eliminazione del file', 'error');
        }
    }

    async cleanupFiles() {
        if (!confirm('Sei sicuro di voler eliminare i file vecchi? Questa operazione non può essere annullata.')) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/api/pdfs/cleanup`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage(`Pulizia completata: ${result.deletedCount || 0} file eliminati`, 'success');
                this.loadFileList();
                this.updateStats();
            } else {
                this.showMessage(`Errore durante la pulizia: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Cleanup error:', error);
            this.showMessage('Errore durante la pulizia', 'error');
        }
    }

    showMessage(message, type = 'info') {
        const statusMessage = document.getElementById('statusMessage');
        if (!statusMessage) {
            console.warn('Elemento statusMessage non trovato');
            return;
        }
        statusMessage.innerHTML = `<div class="status-message status-${type}">${message}</div>`;
        
        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => this.hideMessage(), 5000);
        }
    }

    hideMessage() {
        const statusMessage = document.getElementById('statusMessage');
        if (statusMessage) {
            statusMessage.innerHTML = '';
        }
    }

    showLoading(elementId, show) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn(`Elemento ${elementId} non trovato`);
            return;
        }
        element.style.display = show ? 'block' : 'none';
    }

    setButtonState(buttonId, enabled) {
        const button = document.getElementById(buttonId);
        if (!button) {
            console.warn(`Pulsante ${buttonId} non trovato`);
            return;
        }
        button.disabled = !enabled;
        
        if (enabled) {
            button.textContent = button.textContent.replace('⏳', '📤');
        } else {
            button.textContent = button.textContent.replace('📤', '⏳');
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDate(dateString) {
        if (!dateString) return 'Data sconosciuta';
        
        const date = new Date(dateString);
        return date.toLocaleDateString('it-IT', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    // Decò Scraping Methods
    async startDecoScraping(force = false) {
        try {
            this.showLoading('loadingDeco', true);
            this.setButtonState('startScrapingBtn', false);
            this.setButtonState('forceScrapingBtn', false);
            
            const response = await fetch(`${this.apiBase}/api/deco/scrape`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ force })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showDecoMessage(
                    `✅ ${result.message}${result.processId ? ` (PID: ${result.processId})` : ''}`,
                    'success'
                );
                
                // Aggiorna le statistiche dopo 5 secondi
                setTimeout(() => {
                    this.updateDecoStats();
                }, 5000);
            } else {
                this.showDecoMessage(`❌ Errore: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Errore durante scraping:', error);
            this.showDecoMessage(`❌ Errore di connessione: ${error.message}`, 'error');
        } finally {
            this.showLoading('loadingDeco', false);
            this.setButtonState('startScrapingBtn', true);
            this.setButtonState('forceScrapingBtn', true);
        }
    }
    
    async updateDecoStats() {
        try {
            const response = await fetch(`${this.apiBase}/api/deco/status`);
            const result = await response.json();
            
            if (result.success) {
                const data = result.data;
                
                // Aggiorna le statistiche
                document.getElementById('decoTotalFlyers').textContent = data.totalFlyers || 0;
                document.getElementById('decoLastWeek').textContent = data.lastWeekFlyers || 0;
                
                // Formatta la data dell'ultimo aggiornamento
                const lastUpdate = data.lastUpdate ? 
                    this.formatDate(data.lastUpdate) : 'Mai';
                document.getElementById('decoLastUpdate').textContent = lastUpdate;
                
                // Mostra i volantini recenti
                this.renderDecoRecentFlyers(data.recentFlyers || []);
                
                this.showDecoMessage('📊 Statistiche aggiornate con successo', 'success');
            } else {
                this.showDecoMessage(`❌ Errore nel caricamento statistiche: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Errore nel caricamento statistiche Decò:', error);
            this.showDecoMessage(`❌ Errore di connessione: ${error.message}`, 'error');
        }
    }
    
    async cleanupDecoFlyers() {
        if (!confirm('Sei sicuro di voler eliminare tutti i volantini Decò scaduti (più vecchi di 30 giorni)?')) {
            return;
        }
        
        try {
            this.setButtonState('cleanupDecoBtn', false);
            
            const response = await fetch(`${this.apiBase}/api/deco/cleanup`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showDecoMessage(
                    `🧹 Cleanup completato: ${result.deleted.records} record e ${result.deleted.files} file eliminati`,
                    'success'
                );
                
                // Aggiorna le statistiche
                this.updateDecoStats();
            } else {
                this.showDecoMessage(`❌ Errore durante cleanup: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Errore durante cleanup:', error);
            this.showDecoMessage(`❌ Errore di connessione: ${error.message}`, 'error');
        } finally {
            this.setButtonState('cleanupDecoBtn', true);
        }
    }
    
    renderDecoRecentFlyers(flyers) {
        const container = document.getElementById('decoRecentFlyers');
        
        if (!flyers || flyers.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Nessun volantino Decò trovato</p>';
            return;
        }
        
        const flyersHtml = flyers.map(flyer => {
            // Gestione sicura dei valori null/undefined
            const store = flyer.store || 'Store sconosciuto';
            const cap = flyer.location?.cap || 'N/A';
            const category = flyer.category || 'N/A';
            const createdAt = flyer.createdAt ? this.formatDate(flyer.createdAt) : 'Data sconosciuta';
            const fileSize = flyer.fileSize || 'Dimensione sconosciuta';
            const flyerId = flyer.id || flyer._id || 'unknown';
            const isValid = flyer.isValid ? '✅ Valido' : '❌ Non valido';
            
            return `
                <div class="file-item">
                    <div class="file-info">
                        <div class="file-name">🏪 ${store}</div>
                        <div class="file-details">
                            📍 CAP: ${cap} | 
                            📂 ${category} | 
                            📅 ${createdAt} | 
                            💾 ${fileSize} | 
                            ${isValid}
                        </div>
                        <div class="file-id" style="font-size: 0.8em; color: #666; margin-top: 5px;">
                            ID: ${flyerId}
                        </div>
                    </div>
                    <div class="file-actions">
                        <button class="btn btn-sm" onclick="adminPanel.showDecoFlyerDetails('${flyerId}')">
                            📋 Dettagli
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="adminPanel.viewDecoPDF('${flyerId}')">
                            📄 Visualizza PDF
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = `
            <h3 style="margin-bottom: 15px; color: #333;">📋 Volantini Decò Recenti</h3>
            <div class="file-list">${flyersHtml}</div>
        `;
    }
    
    showDecoFlyerDetails(flyerId) {
        // Per ora mostra solo un alert con l'ID, in futuro si può implementare un modal
        alert(`Dettagli volantino Decò\nID: ${flyerId}\n\nFunzionalità in sviluppo...`);
    }
    
    async viewDecoPDF(flyerId) {
        try {
            // Ottieni i dettagli del volantino per recuperare l'URL del PDF
            const response = await fetch(`${this.apiBase}/api/volantini/${flyerId}`);
            const result = await response.json();
            
            if (result.success && result.data) {
                const flyer = result.data;
                
                // Controlla se il PDF esiste
                if (flyer.pdfUrl) {
                    // Apri il PDF in una nuova finestra/tab
                    window.open(flyer.pdfUrl, '_blank', 'noopener,noreferrer');
                } else {
                    this.showDecoMessage('❌ URL del PDF non disponibile', 'error');
                }
            } else {
                this.showDecoMessage('❌ Impossibile recuperare i dettagli del volantino', 'error');
            }
        } catch (error) {
            console.error('Errore durante apertura PDF:', error);
            this.showDecoMessage(`❌ Errore durante apertura PDF: ${error.message}`, 'error');
        }
    }
    
    async deleteAllDecoPdfs() {
        // Conferma dell'utente
        const confirmed = confirm(
            '⚠️ ATTENZIONE!\n\n' +
            'Questa operazione eliminerà TUTTI i PDF dei volantini Decò dal sistema.\n' +
            'Questa azione è IRREVERSIBILE.\n\n' +
            'Sei sicuro di voler continuare?'
        );
        
        if (!confirmed) {
            return;
        }
        
        // Seconda conferma per sicurezza
        const doubleConfirmed = confirm(
            '🚨 ULTIMA CONFERMA\n\n' +
            'Stai per eliminare TUTTI i PDF Decò.\n' +
            'Confermi di voler procedere?'
        );
        
        if (!doubleConfirmed) {
            return;
        }
        
        try {
            this.showDecoMessage('🗑️ Eliminazione di tutti i PDF Decò in corso...', 'info');
            this.setButtonState('deleteAllDecoPdfsBtn', false);
            
            const response = await fetch(`${this.apiBase}/api/deco/delete-all-pdfs`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showDecoMessage(
                    `✅ ${result.message}\n` +
                    `📊 Record eliminati: ${result.deleted.records}\n` +
                    `📄 File eliminati: ${result.deleted.files}\n` +
                    `⚠️ File non trovati: ${result.deleted.filesNotFound}`,
                    'success'
                );
                
                // Aggiorna le statistiche e la lista
                await this.updateDecoStats();
            } else {
                this.showDecoMessage(`❌ Errore: ${result.error || result.message}`, 'error');
            }
            
        } catch (error) {
            console.error('Errore durante eliminazione PDF:', error);
            this.showDecoMessage(`❌ Errore durante eliminazione: ${error.message}`, 'error');
        } finally {
            this.setButtonState('deleteAllDecoPdfsBtn', true);
        }
    }
    
    showDecoMessage(message, type = 'info') {
        const messageDiv = document.getElementById('decoStatusMessage');
        messageDiv.innerHTML = `<div class="status-message status-${type}">${message}</div>`;
        
        // Auto-hide dopo 5 secondi per messaggi di successo
        if (type === 'success') {
            setTimeout(() => {
                messageDiv.innerHTML = '';
            }, 5000);
        }
    }
    
    // Ipercoop Methods
    async startIpercoopScraping(force = false) {
        try {
            this.showLoading('loadingIpercoop', true);
            this.setButtonState('startIpercoopScrapingBtn', false);
            this.setButtonState('forceIpercoopScrapingBtn', false);
            
            this.showIpercoopMessage('Avvio scraping Ipercoop...', 'info');
            
            const response = await fetch(`${this.apiBase}/api/ipercoop/scrape`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ force })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showIpercoopMessage(`Scraping completato: ${result.message}`, 'success');
                this.updateIpercoopStats();
            } else {
                this.showIpercoopMessage(`Errore: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Errore durante lo scraping Ipercoop:', error);
            this.showIpercoopMessage('Errore durante lo scraping', 'error');
        } finally {
            this.showLoading('loadingIpercoop', false);
            this.setButtonState('startIpercoopScrapingBtn', true);
            this.setButtonState('forceIpercoopScrapingBtn', true);
        }
    }
    
    async updateIpercoopStats() {
        try {
            const response = await fetch(`${this.apiBase}/api/ipercoop/status`);
            const result = await response.json();
            
            if (response.ok && result.success) {
                const data = result.data;
                document.getElementById('ipercoopTotalFlyers').textContent = data.total || 0;
                document.getElementById('ipercoopLastWeek').textContent = data.lastWeek || 0;
                document.getElementById('ipercoopLastUpdate').textContent = 
                    data.latest && data.latest.createdAt ? this.formatDate(data.latest.createdAt) : 'Mai';
                
                this.showIpercoopMessage(`Statistiche aggiornate: ${data.total || 0} volantini totali`, 'success');
                
                // Load recent flyers if available
                if (data.recentFlyers && data.recentFlyers.length > 0) {
                    this.renderIpercoopRecentFlyers(data.recentFlyers);
                }
            } else {
                this.showIpercoopMessage('Errore nel caricamento delle statistiche', 'error');
            }
        } catch (error) {
            console.error('Errore nel caricamento statistiche Ipercoop:', error);
            this.showIpercoopMessage('Errore di connessione', 'error');
        }
    }
    
    async cleanupIpercoopFlyers() {
        try {
            if (!confirm('Sei sicuro di voler eliminare tutti i volantini Ipercoop scaduti?')) {
                return;
            }
            
            this.showIpercoopMessage('Pulizia in corso...', 'info');
            
            const response = await fetch(`${this.apiBase}/api/ipercoop/cleanup`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showIpercoopMessage(`Pulizia completata: ${result.deletedCount} volantini eliminati`, 'success');
                this.updateIpercoopStats();
            } else {
                this.showIpercoopMessage(`Errore durante la pulizia: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Errore durante la pulizia Ipercoop:', error);
            this.showIpercoopMessage('Errore durante la pulizia', 'error');
        }
    }
    
    renderIpercoopRecentFlyers(flyers) {
        const container = document.getElementById('ipercoopRecentFlyers');
        if (!container || !flyers.length) return;
        
        const html = `
            <h3>Volantini Ipercoop Recenti</h3>
            <div class="file-list">
                ${flyers.map(flyer => `
                    <div class="file-item">
                        <div class="file-info">
                            <div class="file-name">${flyer.store || 'Volantino Ipercoop'}</div>
                            <div class="file-details">
                                📅 ${this.formatDate(flyer.validFrom)} - ${this.formatDate(flyer.validTo)}
                                ${flyer.location && flyer.location.city ? `📍 ${flyer.location.city}` : ''}
                                ${flyer.pdfUrl ? '📄 PDF disponibile' : '❌ PDF non disponibile'}
                            </div>
                        </div>
                        <div class="file-actions">
                            ${flyer.pdfUrl ? 
                                `<button class="btn btn-sm btn-primary" onclick="adminPanel.viewIpercoopPDF('${flyer._id}')">
                                    👁️ Visualizza
                                </button>` : ''
                            }
                            <button class="btn btn-sm" onclick="adminPanel.showIpercoopFlyerDetails('${flyer._id}')">
                                ℹ️ Dettagli
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        container.innerHTML = html;
    }
    
    showIpercoopFlyerDetails(flyerId) {
        // Implementation for showing flyer details
        console.log('Show Ipercoop flyer details:', flyerId);
    }
    
    async viewIpercoopPDF(flyerId) {
        try {
            const response = await fetch(`${this.apiBase}/api/flyers`);
            const flyers = await response.json();
            
            const flyer = flyers.find(f => f._id === flyerId && f.source === 'ipercoop');
            if (flyer && flyer.pdfUrl) {
                // Open PDF in new window
                const pdfWindow = window.open('', '_blank');
                pdfWindow.document.write(`
                    <html>
                        <head>
                            <title>${flyer.title || 'Volantino Ipercoop'}</title>
                            <style>
                                body { margin: 0; padding: 0; }
                                iframe { width: 100%; height: 100vh; border: none; }
                            </style>
                        </head>
                        <body>
                            <iframe src="${flyer.pdfUrl}" type="application/pdf"></iframe>
                        </body>
                    </html>
                `);
            } else {
                this.showIpercoopMessage('PDF non disponibile per questo volantino', 'error');
            }
        } catch (error) {
            console.error('Errore nell\'apertura del PDF Ipercoop:', error);
            this.showIpercoopMessage('Errore nell\'apertura del PDF', 'error');
        }
    }
    
    async deleteAllIpercoopPdfs() {
        try {
            const confirmed = confirm(
                'ATTENZIONE: Questa operazione eliminerà TUTTI i volantini Ipercoop dal database.\n\n' +
                'Questa azione è IRREVERSIBILE.\n\n' +
                'Sei assolutamente sicuro di voler continuare?'
            );
            
            if (!confirmed) {
                return;
            }
            
            // Double confirmation
            const doubleConfirmed = confirm(
                'ULTIMA CONFERMA:\n\n' +
                'Stai per eliminare TUTTI i volantini Ipercoop.\n' +
                'Questa operazione NON può essere annullata.\n\n' +
                'Clicca OK per procedere con l\'eliminazione completa.'
            );
            
            if (!doubleConfirmed) {
                return;
            }
            
            this.showIpercoopMessage('Eliminazione in corso...', 'info');
            
            const response = await fetch(`${this.apiBase}/api/ipercoop/delete-all-pdfs`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showIpercoopMessage(
                    `Eliminazione completata: ${result.deletedCount} volantini eliminati`, 
                    'success'
                );
                this.updateIpercoopStats();
                
                // Clear the recent flyers display
                const recentFlyersContainer = document.getElementById('ipercoopRecentFlyers');
                if (recentFlyersContainer) {
                    recentFlyersContainer.innerHTML = '<p>Nessun volantino disponibile</p>';
                }
            } else {
                this.showIpercoopMessage(`Errore durante l'eliminazione: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Errore durante l\'eliminazione Ipercoop:', error);
            this.showIpercoopMessage('Errore durante l\'eliminazione', 'error');
        }
    }
    
    showIpercoopMessage(message, type = 'info') {
        const messageDiv = document.getElementById('ipercoopStatusMessage');
        if (messageDiv) {
            messageDiv.innerHTML = `<div class="status-message status-${type}">${message}</div>`;
            
            // Auto-hide after 5 seconds for success messages
            if (type === 'success') {
                setTimeout(() => {
                    messageDiv.innerHTML = '';
                }, 5000);
            }
        }
    }
    
    // Eurospin Methods
    async startEurospinScraping(force = false) {
        try {
            this.showLoading('loadingEurospin', true);
            this.setButtonState('startEurospinScrapingBtn', false);
            this.setButtonState('forceEurospinScrapingBtn', false);
            
            this.showEurospinMessage('Avvio scraping Eurospin...', 'info');
            
            const response = await fetch(`${this.apiBase}/api/eurospin/scrape`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ force })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showEurospinMessage(`Scraping completato: ${result.message}`, 'success');
                this.updateEurospinStats();
            } else {
                this.showEurospinMessage(`Errore: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Errore durante lo scraping Eurospin:', error);
            this.showEurospinMessage('Errore durante lo scraping', 'error');
        } finally {
            this.showLoading('loadingEurospin', false);
            this.setButtonState('startEurospinScrapingBtn', true);
            this.setButtonState('forceEurospinScrapingBtn', true);
        }
    }

    async updateEurospinStats() {
        try {
            const response = await fetch(`${this.apiBase}/api/eurospin/stats`);
            const stats = await response.json();
            
            if (response.ok) {
                document.getElementById('eurospinTotalFlyers').textContent = stats.total || 0;
                document.getElementById('eurospinLastWeek').textContent = stats.lastWeek || 0;
                document.getElementById('eurospinLastUpdate').textContent = 
                    stats.lastUpdate ? this.formatDate(stats.lastUpdate) : 'Mai';
                
                if (stats.recentFlyers) {
                    this.renderEurospinRecentFlyers(stats.recentFlyers);
                }
            } else {
                console.error('Errore nel recupero statistiche Eurospin:', stats.error);
            }
        } catch (error) {
            console.error('Errore durante aggiornamento statistiche Eurospin:', error);
        }
    }

    renderEurospinRecentFlyers(flyers) {
        const container = document.getElementById('eurospinRecentFlyers');
        if (!container || !flyers.length) return;
        
        const html = `
            <h3>Volantini Eurospin Recenti</h3>
            <div class="file-list">
                ${flyers.map(flyer => `
                    <div class="file-item">
                        <div class="file-info">
                            <div class="file-name">${flyer.store || 'Volantino Eurospin'}</div>
                            <div class="file-details">
                                📅 ${this.formatDate(flyer.validFrom)} - ${this.formatDate(flyer.validTo)}
                                ${flyer.location && flyer.location.city ? `📍 ${flyer.location.city}` : ''}
                                ${flyer.pdfUrl ? '📄 PDF disponibile' : '❌ PDF non disponibile'}
                            </div>
                        </div>
                        <div class="file-actions">
                            ${flyer.pdfUrl ? 
                                `<button class="btn btn-sm btn-primary" onclick="adminPanel.viewEurospinPDF('${flyer._id}')">
                                    👁️ Visualizza
                                </button>` : ''
                            }
                            <button class="btn btn-sm" onclick="adminPanel.showEurospinFlyerDetails('${flyer._id}')">
                                ℹ️ Dettagli
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        container.innerHTML = html;
    }

    showEurospinMessage(message, type = 'info') {
        const container = document.getElementById('eurospinStatusMessage');
        if (!container) return;
        
        const className = type === 'success' ? 'success' : type === 'error' ? 'error' : 'info';
        container.innerHTML = `<div class="message ${className}">${message}</div>`;
        
        setTimeout(() => {
            container.innerHTML = '';
        }, 5000);
    }

    async cleanupEurospinFlyers() {
        if (!confirm('Sei sicuro di voler eliminare tutti i volantini Eurospin scaduti?')) {
            return;
        }
        
        try {
            this.setButtonState('cleanupEurospinBtn', false);
            
            const response = await fetch(`${this.apiBase}/api/eurospin/cleanup`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showEurospinMessage(`Pulizia completata: ${result.message}`, 'success');
                this.updateEurospinStats();
            } else {
                this.showEurospinMessage(`Errore durante la pulizia: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Errore durante la pulizia Eurospin:', error);
            this.showEurospinMessage('Errore durante la pulizia', 'error');
        } finally {
            this.setButtonState('cleanupEurospinBtn', true);
        }
    }

    async deleteAllEurospinPdfs() {
        if (!confirm('ATTENZIONE: Questa operazione eliminerà TUTTI i PDF Eurospin. Sei sicuro?')) {
            return;
        }
        
        try {
            this.setButtonState('deleteAllEurospinPdfsBtn', false);
            
            const response = await fetch(`${this.apiBase}/api/eurospin/delete-all`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showEurospinMessage('Tutti i PDF Eurospin sono stati eliminati', 'success');
                this.updateEurospinStats();
                
                // Clear the recent flyers display
                const recentFlyersContainer = document.getElementById('eurospinRecentFlyers');
                if (recentFlyersContainer) {
                    recentFlyersContainer.innerHTML = '<p>Nessun volantino disponibile</p>';
                }
            } else {
                this.showEurospinMessage(`Errore durante l'eliminazione: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Errore durante l\'eliminazione Eurospin:', error);
            this.showEurospinMessage('Errore durante l\'eliminazione', 'error');
        } finally {
            this.setButtonState('deleteAllEurospinPdfsBtn', true);
        }
    }

    viewEurospinPDF(flyerId) {
        window.open(`${this.apiBase}/api/eurospin/pdf/${flyerId}`, '_blank');
    }

    showEurospinFlyerDetails(flyerId) {
        // Implementation for showing flyer details
        alert(`Dettagli volantino Eurospin: ${flyerId}`);
    }
}

// Initialize admin panel when page loads
let adminPanel;
document.addEventListener('DOMContentLoaded', () => {
    adminPanel = new AdminPanel();
});

// Auto-refresh stats every 30 seconds
setInterval(() => {
    if (adminPanel) {
        adminPanel.updateStats();
        adminPanel.updateDecoStats();
        adminPanel.updateIpercoopStats();
        adminPanel.updateEurospinStats();
    }
}, 30000);