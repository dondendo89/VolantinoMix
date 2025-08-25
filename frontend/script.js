// VolantinoMix Frontend JavaScript

class VolantinoMix {
    constructor() {
        this.selectedVolantini = new Set();
        this.volantiniData = [];
        this.currentLocation = null;
        this.debugMode = true; // Abilita i log di debug
        this.log('VolantinoMix inizializzato');
    }

    log(message, data = null) {
        if (this.debugMode) {
            console.log(`[VolantinoMix] ${message}`, data || '');
        }
    }

    error(message, error = null) {
        console.error(`[VolantinoMix ERROR] ${message}`, error || '');
    }

    init() {
        this.log('Inizializzazione app...');
        this.bindEvents();
        this.requestNotificationPermission();
        // Carica automaticamente tutti i volantini all'avvio
        this.searchVolantini();
        this.log('App inizializzata');
    }

    bindEvents() {
        this.log('Binding eventi...');
        
        // Search functionality
        const searchBtn = document.getElementById('search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.log('Click su search button');
                this.searchVolantini();
            });
            this.log('Search button trovato e collegato');
        } else {
            this.log('Search button NON trovato');
        }
        
        // Clear search functionality
        const clearSearchBtn = document.getElementById('clear-search-btn');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                this.log('Click su clear search button');
                this.clearSearch();
            });
            this.log('Clear search button trovato e collegato');
        }
        
        // Search input enter key
        const storeSearchInput = document.getElementById('store-search');
        if (storeSearchInput) {
            storeSearchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.log('Enter premuto nel campo ricerca');
                    this.searchVolantini();
                }
            });
            this.log('Store search input trovato e collegato');
        }
        
        // Filtro supermercati rimosso - ora carica sempre tutti i volantini

        // Generate PDF
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                this.log('Click su generate PDF button');
                this.generatePDF();
            });
            this.log('Generate button trovato e collegato');
        } else {
            this.log('Generate button NON trovato');
        }

        // Mobile menu toggle
        const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
        if (mobileMenuToggle) {
            mobileMenuToggle.addEventListener('click', () => this.toggleMobileMenu());
        }
        
        // Notification button
        const notificationBtn = document.getElementById('notification-btn');
        if (notificationBtn) {
            notificationBtn.addEventListener('click', () => this.requestNotificationPermission());
        }
    }

    async requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }

    showNotification(title, message, type = 'info') {
        // Verifica se le notifiche browser sono supportate e autorizzate
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: 'volantino-notification'
            });
        }
        
        // Implementazione notifiche toast
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <h4>${title}</h4>
                <p>${message}</p>
                <button class="notification-close">&times;</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove dopo 5 secondi
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
        
        // Rimozione manuale
        notification.querySelector('.notification-close').addEventListener('click', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    }

    toggleMobileMenu() {
        const navMenu = document.querySelector('.nav-menu');
        navMenu.classList.toggle('mobile-open');
    }

    // Richiedi permesso per le notifiche
    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                updateNotificationButtonState();
                if (permission === 'granted') {
                    this.showNotification('Notifiche attivate!', 'Riceverai aggiornamenti sui nuovi volantini', 'success');
                }
            });
        } else if (Notification.permission === 'granted') {
            this.showNotification('Notifiche già attive', 'Stai già ricevendo le notifiche', 'info');
        } else {
            this.showNotification('Notifiche bloccate', 'Abilita le notifiche dalle impostazioni del browser', 'warning');
        }
    }

    async getCurrentLocation() {
        const btn = document.getElementById('geolocation-btn');
        const originalText = btn.innerHTML;
        
        btn.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; margin-right: 8px;"></div>Rilevamento...';
        btn.disabled = true;

        try {
            const position = await this.getGeolocation();
            this.currentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            
            // Get address from coordinates
            const address = await this.reverseGeocode(this.currentLocation.lat, this.currentLocation.lng);
            document.getElementById('cap-input').value = address.cap || '';
            
            this.searchVolantini();
            this.showNotification('Posizione rilevata', `Trovati volantini per ${address.city || 'la tua zona'}`);
        } catch (error) {
            console.error('Errore geolocalizzazione:', error);
            alert('Impossibile rilevare la posizione. Inserisci manualmente il CAP.');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    getGeolocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocalizzazione non supportata'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
            );
        });
    }

    async reverseGeocode(lat, lng) {
        // In a real implementation, you would use a geocoding service
        // For demo purposes, return mock data
        return {
            cap: '20100',
            city: 'Milano',
            address: 'Milano, Italia'
        };
    }

    async searchVolantini() {
        this.log('=== INIZIO RICERCA VOLANTINI ===');
        
        this.showLoading(true);
        
        try {
            // Ottieni il valore del campo di ricerca supermercato
            const storeSearchInput = document.getElementById('store-search');
            const storeQuery = storeSearchInput ? storeSearchInput.value.trim() : '';
            
            const searchParams = new URLSearchParams();
            searchParams.append('limit', '50');
            
            // Aggiungi il filtro supermercato se specificato
            if (storeQuery) {
                searchParams.append('store', storeQuery);
                this.log('🏪 Ricerca volantini per supermercato:', storeQuery);
            } else {
                this.log('🏪 Caricamento tutti i volantini (nessun filtro supermercato)');
            }
            
            const url = `${CONFIG.getApiUrl(CONFIG.API_ENDPOINTS.VOLANTINI)}/search?${searchParams.toString()}`;
            this.log('URL chiamata API:', url);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Request-Source': 'VolantinoMix-Frontend',
                    'X-Request-Type': 'search-all-stores'
                }
            });
            this.log('Risposta API ricevuta - Status:', response.status, 'StatusText:', response.statusText);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.log('Dati JSON ricevuti:', data);
            const volantini = data.data || [];
            this.log('Array volantini estratto:', volantini.length, 'elementi');
            
            // Log dei supermercati trovati
            const supermercati = [...new Set(volantini.map(v => v.store).filter(Boolean))];
            this.log('🏪 Supermercati trovati:', supermercati.join(', '));
            this.log('📊 Volantini per supermercato:', supermercati.map(store => ({
                supermercato: store,
                count: volantini.filter(v => v.store === store).length
            })));
            
            this.log('📊 Volantini da renderizzare:', volantini.length);
            this.log('🎨 Chiamata renderVolantini con', volantini.length, 'volantini');
            this.renderVolantini(volantini);
            
            if (volantini.length === 0) {
                this.showEmptyState();
                if (storeQuery) {
                    this.showNotification('Nessun risultato', `Nessun volantino trovato per "${storeQuery}". Prova con un altro nome.`, 'info');
                } else {
                    this.showNotification('Nessun volantino', 'Non ci sono volantini disponibili al momento.', 'info');
                }
            } else {
                if (storeQuery) {
                    this.showNotification('Ricerca completata', `Trovati ${volantini.length} volantini per "${storeQuery}"`, 'success');
                } else {
                    this.showNotification('Volantini caricati', `Caricati ${volantini.length} volantini disponibili`, 'success');
                }
            }
        } catch (error) {
            this.error('Errore durante ricerca volantini:', error);
            this.showEmptyState();
            this.showNotification('Errore', 'Impossibile caricare i volantini. Riprova più tardi.', 'error');
        } finally {
            this.showLoading(false);
            this.log('Ricerca volantini completata');
        }
    }

    clearSearch() {
        this.log('=== PULIZIA RICERCA ===');
        
        // Pulisci il campo di ricerca
        const storeSearchInput = document.getElementById('store-search');
        if (storeSearchInput) {
            storeSearchInput.value = '';
            this.log('Campo ricerca pulito');
        }
        
        // Ricarica tutti i volantini
        this.searchVolantini();
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        const grid = document.getElementById('volantini-grid');
        
        if (show) {
            loading.classList.remove('hidden');
            grid.innerHTML = '';
        } else {
            loading.classList.add('hidden');
        }
    }

    renderVolantini(volantini) {
        this.log('=== RENDERING VOLANTINI ===');
        this.log('Numero volantini da renderizzare:', volantini.length);
        this.log('Dettagli volantini ricevuti:', volantini.map(v => ({
            id: v._id || v.id,
            store: v.store,
            title: v.title
        })));
        
        // DEBUG: Verifica se i volantini vengono effettivamente aggiunti al DOM
        const gridElement = document.getElementById('volantini-grid');
        this.log('🎯 Elemento grid trovato:', !!gridElement);
        this.log('🎯 Grid innerHTML prima del rendering:', gridElement?.innerHTML?.length || 0, 'caratteri');
        
        // Salva i dati dei volantini per uso successivo
        this.volantiniData = volantini;
        this.log('Dati volantini salvati in this.volantiniData:', this.volantiniData.length);
        
        // Manteniamo le selezioni anche quando cambiamo filtro
        // Non rimuoviamo più le selezioni quando cambiamo filtro
        // Commentiamo il codice che rimuove le selezioni obsolete
        /*
        const currentIds = new Set(volantini.map(v => v._id || v.id));
        const obsoleteIds = Array.from(this.selectedVolantini).filter(id => !currentIds.has(id));
        
        if (obsoleteIds.length > 0) {
            this.log('🧹 PULIZIA SELEZIONI OBSOLETE:');
            this.log('ID obsoleti trovati:', obsoleteIds);
            obsoleteIds.forEach(id => {
                this.selectedVolantini.delete(id);
                this.log('Rimosso ID obsoleto dalla selezione:', id);
            });
            this.log('Selezioni pulite. Nuova selezione:', Array.from(this.selectedVolantini));
        } else {
            this.log('✅ Nessuna selezione obsoleta trovata');
        }
        */
        this.log('✅ Mantenute tutte le selezioni precedenti:', Array.from(this.selectedVolantini));
        
        const grid = document.getElementById('volantini-grid');
        if (!grid) {
            this.error('Elemento volantini-grid non trovato!');
            return;
        }
        
        grid.innerHTML = '';
        this.log('Grid pulita, inizio creazione cards...');

        volantini.forEach((volantino, index) => {
            this.log(`Creazione card ${index + 1}/${volantini.length} per:`, {
                id: volantino._id || volantino.id,
                store: volantino.store,
                title: volantino.title || volantino.store
            });
            const card = this.createVolantinoCard(volantino, index);
            grid.appendChild(card);
            this.log(`✅ Card ${index + 1} aggiunta al DOM. Grid children count:`, grid.children.length);
        });
        
        this.log('🎯 Grid innerHTML dopo il rendering:', grid.innerHTML.length, 'caratteri');
        this.log('🎯 Numero totale di card nella grid:', grid.children.length);

        // Add fade-in animation
        setTimeout(() => {
            grid.querySelectorAll('.volantino-card').forEach((card, index) => {
                setTimeout(() => {
                    card.classList.add('fade-in');
                }, index * 100);
            });
        }, 100);
        
        this.log('Cards create, aggiornamento contatori');
        this.updateSelectedCount();
        this.updateGenerateButton();
        this.log('=== FINE RENDERING VOLANTINI ===');
    }

    createVolantinoCard(volantino, index) {
        const card = document.createElement('div');
        card.className = 'volantino-card';
        
        // Support both API format (_id) and sample data format (id)
        const id = volantino._id || volantino.id;
        card.dataset.id = id;
        
        // Verifica se questo volantino è già selezionato
        const isSelected = this.selectedVolantini.has(id);
        if (isSelected) {
            card.classList.add('selected');
            this.log(`Card ${id} creata con stato selezionato`);
        }
        
        // Support both API format (location object) and sample data format (location string)
        const location = typeof volantino.location === 'object' 
            ? `${volantino.location.address}, ${volantino.location.city}` 
            : volantino.location;
            
        // Format dates for API format
        const validFrom = volantino.validFrom instanceof Date 
            ? volantino.validFrom.toLocaleDateString('it-IT')
            : volantino.validFrom;
        const validTo = volantino.validTo instanceof Date 
            ? volantino.validTo.toLocaleDateString('it-IT')
            : volantino.validTo;

        card.innerHTML = `
            <div class="card-header">
                <div class="store-logo">
                    ${volantino.store.charAt(0).toUpperCase()}
                </div>
                <div class="card-info">
                    <h4>${volantino.store}</h4>
                    <p>${location}</p>
                </div>
            </div>
            <div class="card-details">
                <div class="detail-row">
                    <span class="detail-label">Valido dal:</span>
                    <span class="detail-value">${validFrom}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Valido fino al:</span>
                    <span class="detail-value">${validTo}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Pagine:</span>
                    <span class="detail-value">${volantino.pages}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Categoria:</span>
                    <span class="detail-value">${volantino.category}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="select-btn ${isSelected ? 'selected' : ''}" onclick="volantino.toggleSelection('${id}')">
                    ${isSelected ? 'Selezionato' : 'Seleziona'}
                </button>
                <button class="preview-btn" onclick="volantino.previewVolantino('${id}')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
        `;

        return card;
    }

    toggleSelection(id) {
        this.log('=== TOGGLE SELECTION ===');
        this.log('ID volantino cliccato:', id);
        this.log('Stato attuale selectedVolantini (Set):', Array.from(this.selectedVolantini));
        
        // Trova il volantino nei dati
        const volantino = this.volantiniData.find(v => (v._id || v.id) === id);
        if (!volantino) {
            this.error('ERRORE: Volantino non trovato nei dati per ID:', id);
            this.log('Volantini disponibili:', this.volantiniData.map(v => ({
                id: v._id || v.id,
                store: v.store,
                title: v.title
            })));
            return;
        }
        
        this.log('Volantino trovato nei dati:', {
            id: volantino._id || volantino.id,
            store: volantino.store,
            title: volantino.title
        });
        
        const card = document.querySelector(`[data-id="${id}"]`);
        if (!card) {
            this.error('Card non trovata per ID:', id);
            return;
        }
        
        const btn = card.querySelector('.select-btn');
        if (!btn) {
            this.error('Bottone select non trovato nella card per ID:', id);
            return;
        }
        
        const wasSelected = this.selectedVolantini.has(id);
        this.log('Volantino era già selezionato:', wasSelected);
        
        if (wasSelected) {
            this.selectedVolantini.delete(id);
            card.classList.remove('selected');
            btn.textContent = 'Seleziona';
            btn.classList.remove('selected');
            this.log('✗ VOLANTINO RIMOSSO dalla selezione:', volantino.store);
        } else {
            this.selectedVolantini.add(id);
            card.classList.add('selected');
            btn.textContent = 'Selezionato';
            btn.classList.add('selected');
            this.log('✓ VOLANTINO AGGIUNTO alla selezione:', volantino.store);
        }

        this.log('STATO SELEZIONE AGGIORNATO:');
        this.log('- Nuovo stato selectedVolantini (Set):', Array.from(this.selectedVolantini));
        this.log('- Numero totale volantini selezionati:', this.selectedVolantini.size);
        this.log('- Lista dettagliata volantini selezionati:', 
            Array.from(this.selectedVolantini).map(selectedId => {
                const v = this.volantiniData.find(vol => (vol._id || vol.id) === selectedId);
                return v ? { id: selectedId, store: v.store, title: v.title } : { id: selectedId, error: 'non trovato' };
            })
        );
        
        this.updateSelectedCount();
        this.updateGenerateButton();
        this.log('=== FINE TOGGLE SELECTION ===');
    }

    updateSelectedCount() {
        const count = document.getElementById('selected-count');
        count.textContent = this.selectedVolantini.size;
    }

    updateGenerateButton() {
        const btn = document.getElementById('generate-btn');
        
        if (this.selectedVolantini.size > 0) {
            btn.classList.remove('disabled');
            btn.disabled = false;
        } else {
            btn.classList.add('disabled');
            btn.disabled = true;
        }
    }

    previewVolantino(id) {
        const volantino = this.volantiniData.find(v => v.id === id);
        if (volantino) {
            // Open preview in new window/modal
            window.open(volantino.pdfUrl, '_blank');
        }
    }

    async generatePDF() {
        this.log('=== INIZIO GENERAZIONE PDF ===');
        this.log('Volantini selezionati (Set):', Array.from(this.selectedVolantini));
        this.log('Numero volantini selezionati:', this.selectedVolantini.size);
        
        if (this.selectedVolantini.size === 0) {
            this.error('ERRORE: Nessun volantino selezionato');
            alert('Seleziona almeno un volantino per generare il PDF');
            return;
        }
        
        try {
            // Mostra il loading
            this.showLoading(true);
            
            this.log('=== PREPARAZIONE DATI VOLANTINI ===');
            
            // Recupera i dati dei volantini selezionati dal backend
            this.log('Recupero dati volantini selezionati dal backend...');
            const selectedVolantiniData = await this.fetchSelectedVolantiniData(Array.from(this.selectedVolantini));
            
            this.log('=== RIEPILOGO DATI PREPARATI ===');
            this.log('Numero volantini validi preparati:', selectedVolantiniData.length);
            this.log('Dettagli completi volantini da inviare al backend:', selectedVolantiniData.map(v => ({
                id: v._id || v.id,
                store: v.store,
                title: v.title,
                pdfUrl: v.pdfUrl,
                hasValidId: !!(v._id || v.id),
                hasValidPdfUrl: !!v.pdfUrl
            })));
            
            if (selectedVolantiniData.length === 0) {
                throw new Error('Nessun volantino valido trovato per la generazione del PDF');
            }
            
            this.log('=== CHIAMATA API BACKEND ===');
            
            // Chiama l'API
            const result = await this.callGeneratePDFAPI(selectedVolantiniData);
            
            if (result.success) {
                this.log('✅ PDF generato con successo dal backend:', result);
                
                // Estrai i nomi dei supermercati selezionati
                const supermercatiSelezionati = [...new Set(selectedVolantiniData.map(v => v.store))].sort();
                const supermercatiText = supermercatiSelezionati.join(', ');
                
                this.log('🏪 DEBUG - Supermercati estratti dai volantini:', {
                    volantiniProcessati: selectedVolantiniData.length,
                    storesDaVolantini: selectedVolantiniData.map(v => v.store),
                    supermercatiUnici: supermercatiSelezionati,
                    testoFinale: supermercatiText
                });
                
                // Mostra il risultato
                const resultDiv = document.getElementById('pdf-result');
                resultDiv.innerHTML = `
                    <div class="result-success">
                        <h3>✅ PDF Generato con Successo!</h3>
                        <div class="pdf-info">
                            <p><strong>Nome file:</strong> ${result.filename}</p>
                            <p><strong>Supermercati inclusi:</strong> ${supermercatiText}</p>
                            <p><strong>Dimensione:</strong> ${result.fileSize}</p>
                            <p><strong>Pagine totali:</strong> ${result.totalPages}</p>
                        </div>
                        
                        <!-- Flipbook Viewer Incorporato -->
                        <div class="embedded-flipbook">
                            <div class="flipbook-header">
                                <h3>📖 Visualizzazione Flipbook</h3>
                            </div>
                            <div class="flipbook-container">
                                <div id="embedded-flipbook" class="flipbook-page">
                                    <div class="flipbook-loading">
                                        <div class="spinner"></div>
                                        <p>Caricamento flipbook in corso...</p>
                                    </div>
                                </div>
                            </div>
                            <div class="flipbook-controls">
                                <button id="prev-page" class="flipbook-btn" disabled>⬅️ Precedente</button>
                                <span id="page-info" class="page-info">Pagina 1 di ${result.totalPages}</span>
                                <button id="next-page" class="flipbook-btn">Successiva ➡️</button>
                            </div>
                        </div>
                        
                        <div class="pdf-actions">
                            <button onclick="volantino.openFlipbook('${result.url}', '${result.filename}')" class="btn btn-secondary">
                                🔗 Apri in Nuova Finestra
                            </button>
                            <button onclick="window.open('${result.url}', '_blank')" class="btn btn-secondary">
                                📄 Visualizza PDF
                            </button>
                            <button onclick="volantino.downloadPDF('${result.url}', '${result.filename}')" class="btn btn-secondary">
                                💾 Scarica PDF
                            </button>
                        </div>
                        <div class="share-actions">
                            <h4>🔗 Condividi PDF</h4>
                            <div class="share-buttons">
                                <button onclick="volantino.shareWhatsApp('${result.url}', '${result.filename}')" class="btn btn-share btn-whatsapp">
                                    📱 WhatsApp
                                </button>
                                <button onclick="volantino.shareEmail('${result.url}', '${result.filename}')" class="btn btn-share btn-email">
                                    📧 Email
                                </button>
                                <button onclick="volantino.copyLink('${result.url}')" class="btn btn-share btn-copy">
                                    📋 Copia Link
                                </button>
                                <button onclick="volantino.shareGeneric('${result.url}', '${result.filename}')" class="btn btn-share btn-generic">
                                    🔗 Condividi
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                resultDiv.style.display = 'block';
                
                // Integrazione flipbook via iframe (viewer dedicato)
                try {
                    const flipbookContainer = document.getElementById('embedded-flipbook');
                    this.log('🔎 DEBUG flipbook embed (frontend): container?', !!flipbookContainer);
                    if (flipbookContainer) {
                        // Costruisci URL preview affidabile anche se il backend non lo fornisce
                        const guessedPreview = result.filename ? `/api/pdfs/preview/${result.filename}` : null;
                        const inlineUrl = (result.byId && result.byId.previewUrl) || result.previewUrl || guessedPreview || result.url || result.downloadUrl;
                        this.log('🔎 DEBUG flipbook inlineUrl (frontend):', inlineUrl);
                        flipbookContainer.innerHTML = `
                            <object data="${inlineUrl}#view=FitH" type="application/pdf" style="width:100%;height:80vh;">
                                <iframe src="${inlineUrl}#view=FitH" style="width:100%;height:80vh;border:0;" loading="lazy"></iframe>
                                <div style="padding:16px;text-align:center">
                                    Impossibile visualizzare il PDF incorporato. <a href="${inlineUrl}" target="_blank" rel="noopener">Apri il PDF</a>
                                </div>
                            </object>`;
                    }
                } catch (e) {
                    setTimeout(() => {
                        this.initEmbeddedFlipbook(result.url, result.filename);
                    }, 500);
                }
                
                // Mostra notifica di successo
                this.showNotification(
                    'PDF Generato!', 
                    `Il tuo PDF con ${this.selectedVolantini.size} volantini è pronto`, 
                    'success'
                );
                
            } else {
                throw new Error(result.message || 'Errore nella generazione del PDF');
            }
            
        } catch (error) {
            this.error('❌ ERRORE durante la generazione del PDF:', error);
            
            // Mostra errore all'utente
            const resultDiv = document.getElementById('pdf-result');
            resultDiv.innerHTML = `
                <div class="result-error">
                    <h3>❌ Errore nella Generazione</h3>
                    <p>${error.message}</p>
                    <button onclick="location.reload()" class="btn btn-secondary">🔄 Riprova</button>
                </div>
            `;
            resultDiv.style.display = 'block';
            
            // Mostra notifica di errore
            this.showNotification(
                'Errore PDF', 
                'Si è verificato un errore durante la generazione del PDF', 
                'error'
            );
            
        } finally {
            // Nascondi il loading
            this.showLoading(false);
            this.log('=== FINE GENERAZIONE PDF ===');
        }
    }

    async callGeneratePDFAPI(selectedVolantini) {
        this.log('=== CHIAMATA API MERGE PDF ===');
        this.log('Volantini selezionati da inviare:', selectedVolantini);
        
        try {
            // Estrai gli ID dei volantini selezionati
            const flyerIds = selectedVolantini.map(v => v._id || v.id);
            this.log('IDs estratti per API:', flyerIds);
            
            // Estrai i nomi dei supermercati selezionati
            const supermercatiSelezionati = [...new Set(selectedVolantini.map(v => v.store).filter(Boolean))];
            this.log('🏪 Supermercati selezionati per il merge:', supermercatiSelezionati.join(', '));
            
            const requestBody = {
                flyerIds: flyerIds,
                supermercati: supermercatiSelezionati,
                includeAds: true,
                adPositions: ['cover', 'intermediate', 'final'],
                includeTOC: true
            };
            this.log('Body della richiesta:', requestBody);
            
            const apiUrl = CONFIG.getApiUrl(CONFIG.API_ENDPOINTS.PDFS) + '/merge';
            this.log('URL API chiamata:', apiUrl);
            
            // Chiama l'API di merge con il parametro corretto
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Request-Source': 'VolantinoMix-Frontend',
                    'X-Request-Type': 'merge-pdf',
                    'X-Selected-Stores': supermercatiSelezionati.join(',')
                },
                body: JSON.stringify(requestBody)
            });
            
            this.log('Risposta fetch ricevuta - Status:', response.status, 'OK:', response.ok);
            
            if (!response.ok) {
                const errorText = await response.text();
                this.error(`Errore HTTP ${response.status}:`, errorText);
                throw new Error(`Errore HTTP: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            this.log('Risultato JSON ricevuto:', result);
            
            if (result.success) {
                const responseData = {
                    success: true,
                    pdfId: result.data.filename,
                    url: CONFIG.getFileUrl(result.data.downloadUrl),
                    filename: result.data.filename,
                    fileSize: result.data.fileSizeFormatted || result.data.fileSize,
                    totalPages: result.data.totalPages
                };
                this.log('Dati di risposta preparati:', responseData);
                return responseData;
            } else {
                this.error('API ha restituito success=false:', result.message);
                throw new Error(result.message || 'Errore nella generazione del PDF');
            }
            
        } catch (error) {
            this.error('Errore nella chiamata API merge PDF:', error);
            this.log('Tipo errore:', error.name);
            this.log('Messaggio errore:', error.message);
            throw error;
        }
    }

    showEmptyState() {
        const grid = document.getElementById('volantini-grid');
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-bottom: 1rem; opacity: 0.5;">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <h3 style="color: #64748b; margin-bottom: 0.5rem;">Nessun volantino trovato</h3>
                <p style="color: #94a3b8;">Prova con un CAP diverso o usa la geolocalizzazione</p>
            </div>
        `;
    }



    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchSelectedVolantiniData(selectedIds) {
        this.log('=== RECUPERO DATI VOLANTINI SELEZIONATI ===');
        this.log('ID volantini da recuperare:', selectedIds);
        
        const volantiniData = [];
        const invalidIds = [];
        
        for (const id of selectedIds) {
            try {
                this.log(`Recupero dati per volantino ID: ${id}`);
                
                // Prima prova a cercare nei dati locali
                let volantino = this.volantiniData.find(v => (v._id || v.id) === id);
                
                if (!volantino) {
                    // Se non trovato nei dati locali, recupera dal backend
                    this.log(`Volantino ${id} non trovato nei dati locali, recupero dal backend...`);
                    
                    const response = await fetch(`${CONFIG.getApiUrl(CONFIG.API_ENDPOINTS.FLYERS)}/${id}`, {
                        headers: {
                            'X-Request-Source': 'VolantinoMix-Frontend',
                            'X-Request-Type': 'fetch-single-flyer'
                        }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        volantino = data.data;
                        this.log(`✓ Volantino ${id} recuperato dal backend:`, {
                            id: volantino._id || volantino.id,
                            store: volantino.store,
                            title: volantino.title
                        });
                        this.log(`🏪 Supermercato: ${volantino.store || 'Non specificato'}`);
                    } else if (response.status === 404) {
                        this.error(`⚠️ Volantino ${id} non esiste più nel database (404) - rimuovo dalla selezione`);
                        invalidIds.push(id);
                        continue;
                    } else {
                        this.error(`Errore nel recupero del volantino ${id} dal backend:`, response.status);
                        continue;
                    }
                }
                
                if (volantino) {
                    volantiniData.push(volantino);
                    this.log(`✓ Volantino ${id} aggiunto ai dati:`, {
                        id: volantino._id || volantino.id,
                        store: volantino.store,
                        title: volantino.title,
                        pdfUrl: volantino.pdfUrl
                    });
                } else {
                    this.error(`ERRORE: Impossibile recuperare il volantino con ID: ${id}`);
                    invalidIds.push(id);
                }
            } catch (error) {
                this.error(`Errore durante il recupero del volantino ${id}:`, error);
                invalidIds.push(id);
            }
        }
        
        // Rimuovi gli ID non validi dalla selezione
        if (invalidIds.length > 0) {
            this.log(`🧹 Pulizia ID non validi dalla selezione:`, invalidIds);
            invalidIds.forEach(id => {
                this.selectedVolantini.delete(id);
                // Rimuovi anche dalla UI se la card esiste
                const card = document.querySelector(`[data-id="${id}"]`);
                if (card) {
                    card.classList.remove('selected');
                    const btn = card.querySelector('.select-btn');
                    if (btn) {
                        btn.textContent = 'Seleziona';
                        btn.classList.remove('selected');
                    }
                }
            });
            this.updateSelectedCount();
            this.updateGenerateButton();
        }
        
        this.log('=== RIEPILOGO VOLANTINI RECUPERATI ===');
        this.log('Numero volantini recuperati:', volantiniData.length);
        this.log('Dettagli volantini recuperati:', volantiniData.map(v => ({
            id: v._id || v.id,
            store: v.store,
            title: v.title,
            hasValidPdfUrl: !!v.pdfUrl
        })));
        
        return volantiniData;
    }

    // Funzioni di condivisione
    downloadPDF(url, filename) {
        try {
            // Method 1: Try window.open for direct download
            window.open(url, '_blank');
            
            // Method 2: Create and click link as fallback
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, 500);
            
            this.showNotification('Download Avviato', 'Il download del PDF è iniziato!', 'success');
        } catch (error) {
            console.error('Errore download:', error);
            this.showNotification('Errore Download', 'Errore durante il download. Riprova.', 'error');
        }
    }

    shareWhatsApp(url, filename) {
        const message = `🛒 Guarda questi volantini! Ho creato un PDF personalizzato con le migliori offerte: ${filename}\n\n📄 Scarica qui: ${url}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
        this.log('Condivisione WhatsApp:', { url, filename });
    }

    shareEmail(url, filename) {
        const subject = `🛒 Volantini Personalizzati - ${filename}`;
        const body = `Ciao!\n\nHo creato un PDF personalizzato con i migliori volantini e offerte.\n\n📄 Nome file: ${filename}\n🔗 Scarica qui: ${url}\n\nBuono shopping! 🛍️`;
        const emailUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(emailUrl, '_blank');
        this.log('Condivisione Email:', { url, filename });
    }

    async copyLink(url) {
        try {
            await navigator.clipboard.writeText(url);
            this.showNotification('Link Copiato!', 'Il link del PDF è stato copiato negli appunti', 'success');
            this.log('Link copiato:', url);
        } catch (error) {
            // Fallback per browser che non supportano clipboard API
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showNotification('Link Copiato!', 'Il link del PDF è stato copiato negli appunti', 'success');
            this.log('Link copiato (fallback):', url);
        }
    }

    shareGeneric(url, filename) {
        if (navigator.share) {
            // Usa l'API nativa di condivisione se disponibile (principalmente mobile)
            navigator.share({
                title: `Volantini Personalizzati - ${filename}`,
                text: '🛒 Guarda questi volantini! Ho creato un PDF personalizzato con le migliori offerte.',
                url: url
            }).then(() => {
                this.log('Condivisione nativa completata:', { url, filename });
            }).catch((error) => {
                this.error('Errore condivisione nativa:', error);
                this.fallbackShare(url, filename);
            });
        } else {
            this.fallbackShare(url, filename);
        }
    }

    openFlipbook(pdfUrl, filename) {
        // Apre il flipbook viewer con il PDF generato
        const flipbookUrl = `flipbook-viewer.html?pdf=${encodeURIComponent(pdfUrl)}&title=${encodeURIComponent(filename)}`;
        window.open(flipbookUrl, '_blank');
        this.log('Flipbook aperto:', { pdfUrl, filename });
    }

    async initEmbeddedFlipbook(pdfUrl, filename) {
        try {
            const flipbookContainer = document.getElementById('embedded-flipbook');
            if (!flipbookContainer) {
                this.error('Container flipbook non trovato');
                return;
            }

            this.log('🔄 Inizializzazione flipbook incorporato...', { pdfUrl, filename });

            // Carica PDF.js se non già caricato
            if (typeof pdfjsLib === 'undefined') {
                await this.loadPDFJSLite();
            }

            // Carica il PDF
            const loadingTask = pdfjsLib.getDocument({
                url: pdfUrl,
                withCredentials: false,
                disableRange: true,
                disableStream: true
            });
            const pdf = await loadingTask.promise;
            
            this.embeddedPdf = pdf;
            this.currentPage = 1;
            this.totalPages = pdf.numPages;

            // Aggiorna info pagina
            const pageInfo = document.getElementById('page-info');
            if (pageInfo) {
                pageInfo.textContent = `Pagina ${this.currentPage} di ${this.totalPages}`;
            }

            // Configura controlli
            this.setupEmbeddedFlipbookControls();

            // Renderizza prima pagina
            await this.renderEmbeddedPage(this.currentPage);

            this.log('✅ Flipbook incorporato inizializzato con successo');

        } catch (error) {
            this.error('❌ Errore nell\'inizializzazione del flipbook incorporato:', error);
            const flipbookContainer = document.getElementById('embedded-flipbook');
            if (flipbookContainer) {
                flipbookContainer.innerHTML = `
                    <div class="flipbook-error">
                        <p>❌ Errore nel caricamento del flipbook</p>
                        <button onclick="volantino.openFlipbook('${pdfUrl}', '${filename}')" class="btn btn-primary">
                            🔗 Apri in Nuova Finestra
                        </button>
                    </div>
                `;
            }
        }
    }

    async loadPDFJSLite() {
        return new Promise((resolve, reject) => {
            if (typeof pdfjsLib !== 'undefined') {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = '/public/libs/pdf.min.js?v=1';
            script.onload = () => {
                try {
                    pdfjsLib.disableWorker = true;
                    try { pdfjsLib.GlobalWorkerOptions.workerSrc = '/public/libs/pdf.min.js?v=1'; } catch (e) {}
                } catch (e) {}
                resolve();
            };
            script.onerror = (e) => {
                console.error('Errore caricamento PDF.js', script.src, e);
                reject(e);
            };
            document.head.appendChild(script);
        });
    }

    setupEmbeddedFlipbookControls() {
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');

        if (prevBtn) {
            prevBtn.onclick = () => this.goToEmbeddedPage(this.currentPage - 1);
        }
        if (nextBtn) {
            nextBtn.onclick = () => this.goToEmbeddedPage(this.currentPage + 1);
        }

        // Aggiorna stato pulsanti
        this.updateEmbeddedControls();
    }

    updateEmbeddedControls() {
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        const pageInfo = document.getElementById('page-info');

        if (prevBtn) {
            prevBtn.disabled = this.currentPage <= 1;
        }
        if (nextBtn) {
            nextBtn.disabled = this.currentPage >= this.totalPages;
        }
        if (pageInfo) {
            pageInfo.textContent = `Pagina ${this.currentPage} di ${this.totalPages}`;
        }
    }

    async goToEmbeddedPage(pageNum) {
        if (pageNum < 1 || pageNum > this.totalPages) return;
        
        // Mostra annuncio AdSense ogni 3 pagine (esclusa la prima)
        if (pageNum > 1 && pageNum % 3 === 0) {
            this.showAdSenseInterstitial();
        }
        
        this.currentPage = pageNum;
        await this.renderEmbeddedPage(pageNum);
        this.updateEmbeddedControls();
    }

    showAdSenseInterstitial() {
        // Crea overlay per annuncio interstiziale
        const adOverlay = document.createElement('div');
        adOverlay.className = 'adsense-interstitial-overlay';
        adOverlay.innerHTML = `
            <div class="adsense-interstitial-content">
                <div class="adsense-interstitial-header">
                    <h3>📢 Pubblicità</h3>
                    <button class="adsense-close-btn" onclick="this.closest('.adsense-interstitial-overlay').remove()">&times;</button>
                </div>
                <div class="adsense-ad-container">
                    <!-- Slot AdSense per annuncio interstiziale -->
                    <ins class="adsbygoogle"
                         style="display:block"
                         data-ad-client="ca-pub-YOUR_PUBLISHER_ID"
                         data-ad-slot="YOUR_INTERSTITIAL_SLOT_ID"
                         data-ad-format="auto"
                         data-full-width-responsive="true"></ins>
                </div>
                <div class="adsense-interstitial-footer">
                    <p>Continua la lettura del flipbook</p>
                    <button class="btn btn-primary" onclick="this.closest('.adsense-interstitial-overlay').remove()">Continua</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(adOverlay);
        
        // Inizializza AdSense per il nuovo annuncio
        try {
            (adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {
            console.log('AdSense non disponibile:', e);
        }
        
        // Rimuovi automaticamente dopo 10 secondi se l'utente non chiude
        setTimeout(() => {
            if (adOverlay.parentElement) {
                adOverlay.remove();
            }
        }, 10000);
    }

    async renderEmbeddedPage(pageNum) {
        try {
            const page = await this.embeddedPdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.0 });
            
            // Calcola scala per adattare alla larghezza del container
            const container = document.getElementById('embedded-flipbook');
            const containerWidth = container.clientWidth - 40; // padding
            const scale = Math.min(containerWidth / viewport.width, 1.5);
            const scaledViewport = page.getViewport({ scale });

            // Crea canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = scaledViewport.height;
            canvas.width = scaledViewport.width;
            canvas.style.maxWidth = '100%';
            canvas.style.height = 'auto';
            canvas.style.border = '1px solid #ddd';
            canvas.style.borderRadius = '8px';
            canvas.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';

            // Renderizza pagina
            const renderContext = {
                canvasContext: context,
                viewport: scaledViewport
            };

            await page.render(renderContext).promise;

            // Sostituisci contenuto
            container.innerHTML = '';
            container.appendChild(canvas);

        } catch (error) {
            this.error('Errore nel rendering della pagina:', error);
            const container = document.getElementById('embedded-flipbook');
            if (container) {
                container.innerHTML = '<div class="flipbook-error"><p>❌ Errore nel caricamento della pagina</p></div>';
            }
        }
    }

    fallbackShare(url, filename) {
        // Fallback: copia il link e mostra opzioni
        this.copyLink(url);
        const shareText = `🛒 Volantini Personalizzati - ${filename}\n\n📄 Scarica qui: ${url}`;
        
        // Mostra un modal con opzioni di condivisione
        const modal = document.createElement('div');
        modal.className = 'share-modal';
        modal.innerHTML = `
            <div class="share-modal-content">
                <h3>🔗 Condividi PDF</h3>
                <p>Il link è stato copiato negli appunti. Puoi condividerlo su:</p>
                <div class="share-options">
                    <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" class="btn btn-facebook">📘 Facebook</a>
                    <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}" target="_blank" class="btn btn-twitter">🐦 Twitter</a>
                    <a href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('🛒 Volantini Personalizzati')}" target="_blank" class="btn btn-telegram">✈️ Telegram</a>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" class="btn btn-secondary">Chiudi</button>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Rimuovi il modal dopo 10 secondi
        setTimeout(() => {
            if (modal.parentElement) {
                modal.remove();
            }
        }, 10000);
        
        this.log('Fallback share mostrato:', { url, filename });
    }
}

// Initialize the application when DOM is ready
let volantino;

// Wait for DOM to be fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

function initializeApp() {
    volantino = new VolantinoMix();
    volantino.init();
    
    // Make methods available globally for onclick handlers
    window.volantino = volantino;
}

// Initialize notifications when DOM is loaded
function initializeNotifications() {
    // Update notification button state
    updateNotificationButtonState();
    
    // Check for new volantini periodically
    setInterval(() => {
        checkForNewVolantini();
    }, 300000); // Check every 5 minutes
}

function updateNotificationButtonState() {
    const btn = document.getElementById('notification-btn');
    if (btn && 'Notification' in window) {
        if (Notification.permission === 'granted') {
            btn.classList.add('active');
            btn.title = 'Notifiche attive';
        } else {
            btn.classList.remove('active');
            btn.title = 'Attiva notifiche';
        }
    }
}

function checkForNewVolantini() {
    // Simulate checking for new volantini
    if (Math.random() > 0.8) { // 20% chance of new volantini
        volantino.showNotification('Nuovi volantini disponibili!', 'Controlla i nuovi sconti nella tua zona', 'info');
    }
}

// Initialize notifications
initializeNotifications();

// Service Worker registration for PWA capabilities
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}