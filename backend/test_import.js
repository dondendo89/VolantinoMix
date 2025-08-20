const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function testImportAPI() {
    console.log('🧪 Test API Importazione Volantini\n');
    
    try {
        // Test 1: Controllo stato script
        console.log('📋 Test 1: Controllo stato script...');
        const statusResponse = await axios.get(`${API_BASE}/import/status`);
        console.log('✅ Stato script:', statusResponse.data);
        console.log('');
        
        // Test 2: Importazione singola fonte (dry run)
        console.log('📋 Test 2: Importazione singola fonte (dry run)...');
        const singleSourceResponse = await axios.post(`${API_BASE}/import/source/deco`, {
            dryRun: true,
            skipDuplicates: true
        });
        console.log('✅ Importazione singola (dry run):', singleSourceResponse.data);
        console.log('');
        
        // Test 3: Importazione completa (dry run)
        console.log('📋 Test 3: Importazione completa (dry run)...');
        const allSourcesResponse = await axios.post(`${API_BASE}/import/all`, {
            sources: ['deco', 'eurospin'],
            dryRun: true,
            skipDuplicates: true
        });
        console.log('✅ Importazione completa (dry run):', allSourcesResponse.data);
        console.log('');
        
        console.log('🎉 Tutti i test completati con successo!');
        
    } catch (error) {
        console.error('❌ Errore durante i test:', error.response?.data || error.message);
        process.exit(1);
    }
}

// Esegui i test
testImportAPI();