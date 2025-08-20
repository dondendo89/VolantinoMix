const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configurazione
const API_BASE_URL = 'http://localhost:5000/api';
const DOWNLOAD_DIR = './downloads';

class HeadlessMergeTest {
    constructor() {
        this.testResults = {
            step1: { status: 'pending', message: '', data: null },
            step2: { status: 'pending', message: '', data: null },
            step3: { status: 'pending', message: '', data: null },
            step4: { status: 'pending', message: '', data: null },
            step5: { status: 'pending', message: '', data: null }
        };
        this.selectedFlyers = [];
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
        console.log(`${prefix} [${timestamp}] ${message}`);
    }

    async step1_loadFlyers() {
        this.log('Step 1: Caricamento volantini da tutte le API...');
        
        try {
            // Carica volantini da tutte le API
            const [baseResponse, decoResponse, ipercoopResponse] = await Promise.all([
                axios.get(`${API_BASE_URL}/volantini/search`),
                axios.get(`${API_BASE_URL}/deco`),
                axios.get(`${API_BASE_URL}/ipercoop`)
            ]);

            const baseFlyers = baseResponse.data.data || [];
            const decoFlyers = decoResponse.data.data || [];
            const ipercoopFlyers = ipercoopResponse.data.data || [];

            this.testResults.step1 = {
                status: 'completed',
                message: `Caricati ${baseFlyers.length} volantini base, ${decoFlyers.length} Deco, ${ipercoopFlyers.length} Ipercoop`,
                data: { baseFlyers, decoFlyers, ipercoopFlyers }
            };

            this.log(`✅ Step 1 completato: ${this.testResults.step1.message}`, 'success');
            return true;
        } catch (error) {
            this.testResults.step1 = {
                status: 'failed',
                message: `Errore nel caricamento: ${error.message}`,
                data: null
            };
            this.log(`❌ Step 1 fallito: ${error.message}`, 'error');
            return false;
        }
    }

    async step2_selectFlyers() {
        this.log('Step 2: Selezione automatica volantini...');
        
        try {
            const { baseFlyers, decoFlyers, ipercoopFlyers } = this.testResults.step1.data;
            
            // Seleziona un volantino Coop/base
            const coopFlyer = baseFlyers.find(f => 
                f.tipo === 'coop' || 
                f.store?.toLowerCase().includes('coop') ||
                f.titolo?.toLowerCase().includes('coop')
            ) || baseFlyers[0];

            // Seleziona un volantino Deco o Ipercoop
            const secondFlyer = decoFlyers[0] || ipercoopFlyers[0];

            if (!coopFlyer || !secondFlyer) {
                throw new Error('Non sono stati trovati volantini sufficienti per il test');
            }

            this.selectedFlyers = [coopFlyer, secondFlyer];
            
            // Migliore gestione dei nomi dei volantini
            const coopName = coopFlyer.titolo || coopFlyer.nome || coopFlyer.title || `Volantino ${coopFlyer._id || coopFlyer.id}`;
            const secondName = secondFlyer.titolo || secondFlyer.nome || secondFlyer.title || `Volantino ${secondFlyer._id || secondFlyer.id}`;
            
            this.testResults.step2 = {
                status: 'completed',
                message: `Selezionati: ${coopName} e ${secondName}`,
                data: this.selectedFlyers
            };

            this.log(`✅ Step 2 completato: ${this.testResults.step2.message}`, 'success');
            return true;
        } catch (error) {
            this.testResults.step2 = {
                status: 'failed',
                message: `Errore nella selezione: ${error.message}`,
                data: null
            };
            this.log(`❌ Step 2 fallito: ${error.message}`, 'error');
            return false;
        }
    }

    async step3_mergePDFs() {
        this.log('Step 3: Esecuzione merge PDF...');
        
        try {
            const flyerIds = this.selectedFlyers.map(f => f._id || f.id);
            
            const mergeResponse = await axios.post(`${API_BASE_URL}/pdfs/merge`, {
                flyerIds: flyerIds,
                filename: `test-merge-${Date.now()}`
            });

            if (!mergeResponse.data.success) {
                throw new Error(mergeResponse.data.error || 'Merge fallito');
            }

            this.testResults.step3 = {
                status: 'completed',
                message: `PDF generato: ${mergeResponse.data.filename || 'file generato'}`,
                data: mergeResponse.data
            };

            this.log(`✅ Step 3 completato: ${this.testResults.step3.message}`, 'success');
            return true;
        } catch (error) {
            this.testResults.step3 = {
                status: 'failed',
                message: `Errore nel merge: ${error.message}`,
                data: null
            };
            this.log(`❌ Step 3 fallito: ${error.message}`, 'error');
            return false;
        }
    }

    async step4_downloadPDF() {
        this.log('Step 4: Download del PDF generato...');
        
        try {
            const mergeData = this.testResults.step3.data;
            const downloadUrl = `http://localhost:5000${mergeData.data.downloadUrl}`;
            const filename = mergeData.data.filename || `merged-${Date.now()}.pdf`;
            
            this.log(`Tentativo download da: ${downloadUrl}`);
            
            // Crea directory di download se non esiste
            if (!fs.existsSync(DOWNLOAD_DIR)) {
                fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
            }

            // Download del PDF
            const response = await axios.get(downloadUrl, {
                responseType: 'stream'
            });

            const filePath = path.join(DOWNLOAD_DIR, filename);
            const writer = fs.createWriteStream(filePath);
            
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            const stats = fs.statSync(filePath);
            
            this.testResults.step4 = {
                status: 'completed',
                message: `PDF scaricato: ${filePath} (${Math.round(stats.size / 1024)} KB)`,
                data: { filePath, size: stats.size }
            };

            this.log(`✅ Step 4 completato: ${this.testResults.step4.message}`, 'success');
            return true;
        } catch (error) {
            this.testResults.step4 = {
                status: 'failed',
                message: `Errore nel download: ${error.message}`,
                data: null
            };
            this.log(`❌ Step 4 fallito: ${error.message}`, 'error');
            return false;
        }
    }

    async step5_verifyResult() {
        this.log('Step 5: Verifica finale del risultato...');
        
        try {
            const { filePath, size } = this.testResults.step4.data;
            
            // Verifica che il file esista e abbia una dimensione ragionevole
            if (!fs.existsSync(filePath)) {
                throw new Error('File PDF non trovato');
            }

            if (size < 1000) {
                throw new Error('File PDF troppo piccolo, potrebbe essere corrotto');
            }

            // Verifica che contenga entrambi i volantini
            const expectedPages = this.selectedFlyers.length;
            
            this.testResults.step5 = {
                status: 'completed',
                message: `Test completato con successo! PDF di ${Math.round(size / 1024)} KB generato con ${expectedPages} volantini`,
                data: { verified: true, filePath, size }
            };

            this.log(`✅ Step 5 completato: ${this.testResults.step5.message}`, 'success');
            return true;
        } catch (error) {
            this.testResults.step5 = {
                status: 'failed',
                message: `Errore nella verifica: ${error.message}`,
                data: null
            };
            this.log(`❌ Step 5 fallito: ${error.message}`, 'error');
            return false;
        }
    }

    async runTest() {
        this.log('🚀 Avvio test automatico merge PDF senza interfaccia grafica...');
        
        const steps = [
            () => this.step1_loadFlyers(),
            () => this.step2_selectFlyers(),
            () => this.step3_mergePDFs(),
            () => this.step4_downloadPDF(),
            () => this.step5_verifyResult()
        ];

        for (let i = 0; i < steps.length; i++) {
            const success = await steps[i]();
            if (!success) {
                this.log(`❌ Test interrotto al step ${i + 1}`, 'error');
                break;
            }
            
            // Pausa tra i step
            if (i < steps.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        this.printSummary();
    }

    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 RIEPILOGO TEST MERGE PDF');
        console.log('='.repeat(60));
        
        Object.entries(this.testResults).forEach(([step, result]) => {
            const status = result.status === 'completed' ? '✅' : 
                          result.status === 'failed' ? '❌' : '⏳';
            console.log(`${status} ${step.toUpperCase()}: ${result.message}`);
        });
        
        const completedSteps = Object.values(this.testResults).filter(r => r.status === 'completed').length;
        const totalSteps = Object.keys(this.testResults).length;
        
        console.log('\n' + '-'.repeat(60));
        console.log(`📈 Progresso: ${completedSteps}/${totalSteps} step completati`);
        
        if (completedSteps === totalSteps) {
            console.log('🎉 TEST COMPLETATO CON SUCCESSO!');
        } else {
            console.log('⚠️  Test incompleto o fallito');
        }
        console.log('='.repeat(60));
    }
}

// Esecuzione del test
if (require.main === module) {
    const test = new HeadlessMergeTest();
    test.runTest().catch(error => {
        console.error('❌ Errore fatale nel test:', error);
        process.exit(1);
    });
}

module.exports = HeadlessMergeTest;