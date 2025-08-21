class VolantiniMergeTest {
    constructor() {
        this.volantiniData = [];
        this.selectedVolantini = new Set();
        this.testLog = document.getElementById('test-log');
        this.testStatus = document.getElementById('test-status');
        this.downloadSection = document.getElementById('download-section');
        this.downloadLink = document.getElementById('download-link');
        this.currentStep = 0;
        this.testResults = {
            success: false,
            pdfUrl: null,
            errors: []
        };
    }

    init() {
        this.bindEvents();
        this.log('Test inizializzato. Pronto per l\'esecuzione.');
    }

    bindEvents() {
        document.getElementById('start-test').addEventListener('click', () => this.startTest());
        document.getElementById('reset-test').addEventListener('click', () => this.resetTest());
    }

    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        this.testLog.textContent += `[${timestamp}] ${message}\n`;
        this.testLog.scrollTop = this.testLog.scrollHeight;
        console.log(`[TEST] ${message}`);
    }

    updateStatus(message) {
        this.testStatus.textContent = message;
        this.log(`STATUS: ${message}`);
    }

    updateStepStatus(stepNumber, status) {
        const step = document.getElementById(`step-${stepNumber}`);
        if (step) {
            step.className = `test-step ${status}`;
        }
    }

    async startTest() {
        try {
            this.updateStatus('🚀 Avvio test automatico...');
            document.getElementById('start-test').disabled = true;
            
            await this.step1_loadVolantini();
            await this.step2_selectVolantini();
            await this.step3_mergePDF();
            await this.step4_downloadPDF();
            await this.step5_verifyResult();
            
            this.updateStatus('✅ Test completato con successo!');
            this.testResults.success = true;
            
        } catch (error) {
            this.log(`❌ ERRORE: ${error.message}`);
            this.updateStatus(`❌ Test fallito: ${error.message}`);
            this.testResults.errors.push(error.message);
        } finally {
            document.getElementById('start-test').disabled = false;
        }
    }

    async step1_loadVolantini() {
        this.log('📋 Step 1: Caricamento volantini...');
        this.updateStepStatus(1, 'running');
        
        try {
            // Carica volantini da tutte le fonti
            const responses = await Promise.all([
                fetch(CONFIG.getApiUrl(CONFIG.API_ENDPOINTS.VOLANTINI) + '/search'),
            fetch(CONFIG.getApiUrl(CONFIG.API_ENDPOINTS.DECO)),
            fetch(CONFIG.getApiUrl(CONFIG.API_ENDPOINTS.IPERCOOP))
            ]);
            
            const [volantiniResp, decoResp, ipercoopResp] = responses;
            
            if (!volantiniResp.ok) throw new Error('Errore caricamento volantini base');
            if (!decoResp.ok) throw new Error('Errore caricamento volantini Deco');
            if (!ipercoopResp.ok) throw new Error('Errore caricamento volantini Ipercoop');
            
            const volantiniBase = await volantiniResp.json();
            const volantiniDeco = await decoResp.json();
            const volantiniIpercoop = await ipercoopResp.json();
            
            // Combina tutti i volantini
            this.volantiniData = [
                ...volantiniBase,
                ...volantiniDeco.map(v => ({...v, source: 'deco'})),
                ...volantiniIpercoop.map(v => ({...v, source: 'ipercoop'}))
            ];
            
            this.log(`✅ Caricati ${this.volantiniData.length} volantini totali`);
            this.log(`   - Volantini base: ${volantiniBase.length}`);
            this.log(`   - Volantini Deco: ${volantiniDeco.length}`);
            this.log(`   - Volantini Ipercoop: ${volantiniIpercoop.length}`);
            
            this.updateStepStatus(1, 'success');
            
        } catch (error) {
            this.updateStepStatus(1, 'error');
            throw new Error(`Step 1 fallito: ${error.message}`);
        }
    }

    async step2_selectVolantini() {
        this.log('🎯 Step 2: Selezione automatica volantini...');
        this.updateStepStatus(2, 'running');
        
        try {
            // Trova un volantino Coop/base
            const coopVolantino = this.volantiniData.find(v => 
                !v.source || v.source === 'base' || 
                (v.supermercato && v.supermercato.toLowerCase().includes('coop'))
            );
            
            // Trova un volantino Deco
            const decoVolantino = this.volantiniData.find(v => 
                v.source === 'deco' || 
                (v.supermercato && v.supermercato.toLowerCase().includes('deco'))
            );
            
            if (!coopVolantino) {
                throw new Error('Nessun volantino Coop/base trovato');
            }
            
            if (!decoVolantino) {
                throw new Error('Nessun volantino Deco trovato');
            }
            
            // Seleziona i volantini
            const coopId = coopVolantino._id || coopVolantino.id;
            const decoId = decoVolantino._id || decoVolantino.id;
            
            this.selectedVolantini.add(coopId);
            this.selectedVolantini.add(decoId);
            
            this.log(`✅ Selezionato volantino Coop: ${coopVolantino.supermercato || 'Coop'} (ID: ${coopId})`);
            this.log(`✅ Selezionato volantino Deco: ${decoVolantino.supermercato || 'Deco'} (ID: ${decoId})`);
            
            this.updateStepStatus(2, 'success');
            
        } catch (error) {
            this.updateStepStatus(2, 'error');
            throw new Error(`Step 2 fallito: ${error.message}`);
        }
    }

    async step3_mergePDF() {
        this.log('🔄 Step 3: Esecuzione merge PDF...');
        this.updateStepStatus(3, 'running');
        
        try {
            // Prepara i dati per il merge
            const selectedData = Array.from(this.selectedVolantini)
                .map(id => this.volantiniData.find(v => (v._id || v.id) === id))
                .filter(v => v !== undefined);
            
            if (selectedData.length === 0) {
                throw new Error('Nessun volantino valido selezionato per il merge');
            }
            
            this.log(`📋 Preparazione merge di ${selectedData.length} volantini...`);
            
            // Estrai gli ID per l'API
            const flyerIds = selectedData.map(v => v._id || v.id);
            
            this.log(`🔗 Chiamata API merge con IDs: ${flyerIds.join(', ')}`);
            
            // Chiama l'API per il merge
            const response = await fetch(CONFIG.getApiUrl(CONFIG.API_ENDPOINTS.PDFS) + '/merge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    flyerIds: flyerIds,
                    includeTOC: true,
                    includeAds: false
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Errore API merge: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(`Merge fallito: ${result.error || 'Errore sconosciuto'}`);
            }
            
            this.testResults.pdfUrl = result.pdfUrl;
            this.log(`✅ PDF generato con successo: ${result.pdfUrl}`);
            
            this.updateStepStatus(3, 'success');
            
        } catch (error) {
            this.updateStepStatus(3, 'error');
            throw new Error(`Step 3 fallito: ${error.message}`);
        }
    }

    async step4_downloadPDF() {
        this.log('⬇️ Step 4: Preparazione download PDF...');
        this.updateStepStatus(4, 'running');
        
        try {
            if (!this.testResults.pdfUrl) {
                throw new Error('URL PDF non disponibile');
            }
            
            // Verifica che il PDF sia accessibile
            const response = await fetch(this.testResults.pdfUrl);
            if (!response.ok) {
                throw new Error(`PDF non accessibile: ${response.status}`);
            }
            
            // Configura il link di download
            this.downloadLink.href = this.testResults.pdfUrl;
            this.downloadLink.download = `test-merge-${Date.now()}.pdf`;
            
            // Aggiungi pulsante Flipbook
            const flipbookBtn = document.createElement('button');
            flipbookBtn.textContent = '📖 Visualizza Flipbook';
            flipbookBtn.className = 'btn';
            flipbookBtn.style.marginLeft = '10px';
            flipbookBtn.onclick = () => this.openFlipbook();
            
            // Aggiungi il pulsante se non esiste già
            if (!document.getElementById('flipbook-btn')) {
                flipbookBtn.id = 'flipbook-btn';
                this.downloadSection.appendChild(flipbookBtn);
            }
            
            this.downloadSection.style.display = 'block';
            
            this.log(`✅ PDF pronto per il download: ${this.testResults.pdfUrl}`);
            this.log(`📁 Dimensione file: ${(response.headers.get('content-length') / 1024).toFixed(2)} KB`);
            
            this.updateStepStatus(4, 'success');
            
        } catch (error) {
            this.updateStepStatus(4, 'error');
            throw new Error(`Step 4 fallito: ${error.message}`);
        }
    }

    async step5_verifyResult() {
        this.log('✅ Step 5: Verifica risultato finale...');
        this.updateStepStatus(5, 'running');
        
        try {
            // Verifica che tutti i passaggi siano stati completati
            if (!this.testResults.pdfUrl) {
                throw new Error('PDF URL non generato');
            }
            
            if (this.selectedVolantini.size < 2) {
                throw new Error('Numero insufficiente di volantini selezionati');
            }
            
            // Verifica finale dell'accessibilità del PDF
            const response = await fetch(this.testResults.pdfUrl, { method: 'HEAD' });
            if (!response.ok) {
                throw new Error('PDF finale non accessibile');
            }
            
            this.log('✅ Verifica completata con successo!');
            this.log(`📊 Riepilogo test:`);
            this.log(`   - Volantini caricati: ${this.volantiniData.length}`);
            this.log(`   - Volantini selezionati: ${this.selectedVolantini.size}`);
            this.log(`   - PDF generato: ${this.testResults.pdfUrl}`);
            this.log(`   - Errori: ${this.testResults.errors.length}`);
            
            this.updateStepStatus(5, 'success');
            
        } catch (error) {
            this.updateStepStatus(5, 'error');
            throw new Error(`Step 5 fallito: ${error.message}`);
        }
    }

    openFlipbook() {
        if (!this.testResults.pdfUrl) {
            this.log('❌ Nessun PDF disponibile per il flipbook');
            return;
        }
        
        const filename = `test-merge-${Date.now()}.pdf`;
        const flipbookUrl = `flipbook-viewer.html?pdf=${encodeURIComponent(this.testResults.pdfUrl)}&title=${encodeURIComponent(filename)}`;
        window.open(flipbookUrl, '_blank');
        this.log('📖 Flipbook aperto in una nuova finestra');
    }

    resetTest() {
        this.log('🔄 Reset del test...');
        this.volantiniData = [];
        this.selectedVolantini.clear();
        this.currentStep = 0;
        this.testResults = {
            success: false,
            pdfUrl: null,
            errors: []
        };
        
        // Reset UI
        this.updateStatus('Pronto per iniziare il test');
        this.downloadSection.style.display = 'none';
        
        // Reset step status
        for (let i = 1; i <= 5; i++) {
            this.updateStepStatus(i, '');
        }
        
        // Clear log
        this.testLog.textContent = 'Log del test:\n';
        this.log('Test resettato. Pronto per una nuova esecuzione.');
    }
}

// Inizializza il test quando il DOM è pronto
let mergeTest;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTest);
} else {
    initializeTest();
}

function initializeTest() {
    mergeTest = new VolantiniMergeTest();
    mergeTest.init();
}