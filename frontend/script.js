// VolantinoMix Frontend JavaScript

class VolantinoMix {
    constructor() {
        this.selectedVolantini = new Set();
        this.volantiniData = [];
        this.currentLocation = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.requestNotificationPermission();
        this.loadSampleData();
    }

    bindEvents() {
        // Search functionality
        document.getElementById('search-btn').addEventListener('click', () => this.searchVolantini());
        document.getElementById('cap-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchVolantini();
        });

        // Geolocation
        document.getElementById('geolocation-btn').addEventListener('click', () => this.getCurrentLocation());

        // Generate PDF
        document.getElementById('generate-btn').addEventListener('click', () => this.generatePDF());

        // Mobile menu toggle
        document.querySelector('.mobile-menu-toggle').addEventListener('click', () => this.toggleMobileMenu());
    }

    async requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }

    showNotification(title, message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: '/favicon.ico'
            });
        }
    }

    toggleMobileMenu() {
        const navMenu = document.querySelector('.nav-menu');
        navMenu.classList.toggle('mobile-open');
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
        const cap = document.getElementById('cap-input').value.trim();
        
        if (!cap && !this.currentLocation) {
            alert('Inserisci un CAP o usa la geolocalizzazione');
            return;
        }

        this.showLoading(true);
        
        try {
            // Simulate API call
            await this.delay(1500);
            
            const filteredVolantini = this.volantiniData.filter(volantino => {
                if (cap) {
                    return volantino.cap.includes(cap.substring(0, 3));
                }
                return true; // If using geolocation, show all for demo
            });

            this.renderVolantini(filteredVolantini);
            
            if (filteredVolantini.length === 0) {
                this.showEmptyState();
            }
        } catch (error) {
            console.error('Errore ricerca:', error);
            alert('Errore durante la ricerca. Riprova.');
        } finally {
            this.showLoading(false);
        }
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
        const grid = document.getElementById('volantini-grid');
        grid.innerHTML = '';

        volantini.forEach((volantino, index) => {
            const card = this.createVolantinoCard(volantino, index);
            grid.appendChild(card);
        });

        // Add fade-in animation
        setTimeout(() => {
            grid.querySelectorAll('.volantino-card').forEach((card, index) => {
                setTimeout(() => {
                    card.classList.add('fade-in');
                }, index * 100);
            });
        }, 100);
    }

    createVolantinoCard(volantino, index) {
        const card = document.createElement('div');
        card.className = 'volantino-card';
        card.dataset.id = volantino.id;

        card.innerHTML = `
            <div class="card-header">
                <div class="store-logo">
                    ${volantino.store.charAt(0).toUpperCase()}
                </div>
                <div class="card-info">
                    <h4>${volantino.store}</h4>
                    <p>${volantino.location}</p>
                </div>
            </div>
            <div class="card-details">
                <div class="detail-row">
                    <span class="detail-label">Valido dal:</span>
                    <span class="detail-value">${volantino.validFrom}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Valido fino al:</span>
                    <span class="detail-value">${volantino.validTo}</span>
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
                <button class="select-btn" onclick="volantino.toggleSelection('${volantino.id}')">
                    Seleziona
                </button>
                <button class="preview-btn" onclick="volantino.previewVolantino('${volantino.id}')">
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
        const card = document.querySelector(`[data-id="${id}"]`);
        const btn = card.querySelector('.select-btn');
        
        if (this.selectedVolantini.has(id)) {
            this.selectedVolantini.delete(id);
            card.classList.remove('selected');
            btn.textContent = 'Seleziona';
            btn.classList.remove('selected');
        } else {
            this.selectedVolantini.add(id);
            card.classList.add('selected');
            btn.textContent = 'Selezionato';
            btn.classList.add('selected');
        }

        this.updateSelectedCount();
        this.updateGenerateButton();
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
        if (this.selectedVolantini.size === 0) return;

        const btn = document.getElementById('generate-btn');
        const originalText = btn.innerHTML;
        
        btn.innerHTML = '<div class="spinner" style="width: 24px; height: 24px; margin-right: 8px;"></div>Generazione in corso...';
        btn.disabled = true;

        try {
            const selectedData = Array.from(this.selectedVolantini).map(id => 
                this.volantiniData.find(v => v.id === id)
            );

            // Simulate PDF generation
            await this.delay(3000);
            
            // In a real implementation, this would call the backend API
            const response = await this.callGeneratePDFAPI(selectedData);
            
            if (response.success) {
                this.showNotification('PDF Generato', 'Il tuo volantino unificato è pronto!');
                // Redirect to unified PDF page
                window.location.href = `unified.html?id=${response.pdfId}`;
            } else {
                throw new Error(response.error || 'Errore durante la generazione');
            }
        } catch (error) {
            console.error('Errore generazione PDF:', error);
            alert('Errore durante la generazione del PDF. Riprova.');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    async callGeneratePDFAPI(selectedVolantini) {
        // Simulate API call
        await this.delay(2000);
        
        return {
            success: true,
            pdfId: 'pdf_' + Date.now(),
            url: '/api/pdf/download/pdf_' + Date.now()
        };
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

    loadSampleData() {
        // Sample data for demonstration
        this.volantiniData = [
            {
                id: 'esselunga_001',
                store: 'Esselunga',
                location: 'Milano Centro',
                validFrom: '15/01/2024',
                validTo: '28/01/2024',
                pages: 8,
                category: 'Supermercato',
                cap: ['20100', '20121', '20122'],
                pdfUrl: '/samples/esselunga.pdf'
            },
            {
                id: 'conad_001',
                store: 'Conad',
                location: 'Milano Porta Garibaldi',
                validFrom: '10/01/2024',
                validTo: '25/01/2024',
                pages: 12,
                category: 'Supermercato',
                cap: ['20100', '20154'],
                pdfUrl: '/samples/conad.pdf'
            },
            {
                id: 'lidl_001',
                store: 'Lidl',
                location: 'Milano Bicocca',
                validFrom: '18/01/2024',
                validTo: '31/01/2024',
                pages: 6,
                category: 'Discount',
                cap: ['20100', '20126'],
                pdfUrl: '/samples/lidl.pdf'
            },
            {
                id: 'mediaworld_001',
                store: 'MediaWorld',
                location: 'Milano San Siro',
                validFrom: '12/01/2024',
                validTo: '26/01/2024',
                pages: 16,
                category: 'Elettronica',
                cap: ['20100', '20151'],
                pdfUrl: '/samples/mediaworld.pdf'
            },
            {
                id: 'ikea_001',
                store: 'IKEA',
                location: 'Milano Corsico',
                validFrom: '01/01/2024',
                validTo: '31/01/2024',
                pages: 24,
                category: 'Arredamento',
                cap: ['20100', '20094'],
                pdfUrl: '/samples/ikea.pdf'
            },
            {
                id: 'carrefour_001',
                store: 'Carrefour',
                location: 'Milano Lampugnano',
                validFrom: '20/01/2024',
                validTo: '02/02/2024',
                pages: 10,
                category: 'Ipermercato',
                cap: ['20100', '20151'],
                pdfUrl: '/samples/carrefour.pdf'
            }
        ];
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the application
const volantino = new VolantinoMix();

// Make methods available globally for onclick handlers
window.volantino = volantino;

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