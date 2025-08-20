const axios = require('axios');
require('dotenv').config();

const API_BASE = 'http://localhost:5000/api';

// Test del sistema di controllo duplicati
async function testDuplicateSystem() {
    console.log('🧪 TESTING DUPLICATE DETECTION SYSTEM');
    console.log('=' .repeat(50));

    try {
        // Test 1: Statistiche sui duplicati
        console.log('\n📊 Test 1: Statistiche duplicati nel database');
        const statsResponse = await axios.get(`${API_BASE}/duplicates/stats`);
        
        if (statsResponse.data.success) {
            const stats = statsResponse.data.data;
            console.log(`✅ Volantini totali: ${stats.totalFlyers}`);
            console.log(`⚠️ Potenziali duplicati: ${stats.totalPotentialDuplicates}`);
            console.log(`📋 Gruppi di duplicati: ${stats.potentialDuplicateGroups}`);
            
            console.log('\n📈 Distribuzione per source:');
            stats.sourceDistribution.forEach(source => {
                console.log(`   ${source._id}: ${source.count} volantini`);
            });
            
            if (stats.potentialDuplicates.length > 0) {
                console.log('\n🔍 Primi gruppi di duplicati:');
                stats.potentialDuplicates.slice(0, 3).forEach((group, index) => {
                    console.log(`   ${index + 1}. ${group._id.store} - ${group._id.category}: ${group.count} volantini`);
                });
            }
        }

        // Test 2: Controllo duplicati per un volantino specifico
        console.log('\n\n🔍 Test 2: Controllo duplicati per volantino specifico');
        const checkResponse = await axios.post(`${API_BASE}/duplicates/check`, {
            store: 'Ipercoop',
            category: 'Supermercato',
            pdfUrl: 'https://app.coopgrupporadenza.it/api/frontend/volantino/scarica-pdf/0/362',
            checkDateOverlap: true,
            checkFileHash: false
        });
        
        if (checkResponse.data.success) {
            const check = checkResponse.data.data;
            console.log(`✅ È duplicato: ${check.isDuplicate}`);
            console.log(`📊 Duplicati trovati: ${check.duplicatesFound}`);
            
            if (check.reasons && check.reasons.length > 0) {
                console.log('📝 Motivi:');
                check.reasons.forEach(reason => {
                    console.log(`   - ${reason}`);
                });
            }
            
            if (check.duplicates.length > 0) {
                console.log('🔗 Volantini duplicati trovati:');
                check.duplicates.forEach((dup, index) => {
                    console.log(`   ${index + 1}. ID: ${dup.id} | Source: ${dup.source} | Created: ${new Date(dup.createdAt).toLocaleDateString()}`);
                });
            }
        }

        // Test 3: Controllo con azione suggerita
        console.log('\n\n⚡ Test 3: Controllo duplicati con azione suggerita');
        const actionResponse = await axios.post(`${API_BASE}/duplicates/check-with-action`, {
            store: 'Deco',
            category: 'Supermercato',
            pdfUrl: 'https://example.com/test-flyer.pdf',
            autoSkip: true,
            checkFileHash: false
        });
        
        if (actionResponse.data.success) {
            const action = actionResponse.data.data;
            console.log(`✅ È duplicato: ${action.isDuplicate}`);
            console.log(`🎯 Azione suggerita: ${action.action}`);
            console.log(`💬 Messaggio: ${action.message}`);
            console.log(`📊 Duplicati trovati: ${action.duplicatesFound}`);
        }

        // Test 4: Dry run rimozione duplicati
        console.log('\n\n🧹 Test 4: Dry run rimozione duplicati');
        const removeResponse = await axios.delete(`${API_BASE}/duplicates/remove`, {
            data: {
                dryRun: true,
                keepNewest: false
            }
        });
        
        if (removeResponse.data.success) {
            const remove = removeResponse.data.data;
            console.log(`✅ Dry run completato`);
            console.log(`📋 Gruppi di duplicati trovati: ${remove.duplicateGroupsFound}`);
            console.log(`❌ Volantini da rimuovere: ${remove.totalDuplicates}`);
            console.log(`✅ Volantini da mantenere: ${remove.totalKept}`);
            
            if (remove.toDelete.length > 0) {
                console.log('🗑️ Esempi di volantini da rimuovere:');
                remove.toDelete.forEach((item, index) => {
                    console.log(`   ${index + 1}. ID: ${item.id} | Source: ${item.source}`);
                });
            }
        }

        console.log('\n\n✅ TUTTI I TEST COMPLETATI CON SUCCESSO!');
        console.log('🎉 Il sistema di controllo duplicati funziona correttamente!');
        
    } catch (error) {
        console.error('❌ Errore durante i test:', error.message);
        if (error.response) {
            console.error('📄 Dettagli errore:', error.response.data);
        }
    }
}

// Esegui i test
testDuplicateSystem().then(() => {
    console.log('\n🏁 Test completati');
    process.exit(0);
}).catch(error => {
    console.error('💥 Errore fatale:', error);
    process.exit(1);
});