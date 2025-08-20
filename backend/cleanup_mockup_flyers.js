const mongoose = require('mongoose');
const Volantino = require('./models/Volantino');
require('dotenv').config();

async function cleanupMockupFlyers() {
    try {
        // Connetti al database
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/volantinomix');
        console.log('✅ Connesso al database MongoDB');
        
        // Recupera tutti i volantini
        const allFlyers = await Volantino.find({}).select('_id title store category source pdfUrl validFrom validTo');
        console.log(`📊 Trovati ${allFlyers.length} volantini totali nel database`);
        
        if (allFlyers.length === 0) {
            console.log('ℹ️ Nessun volantino trovato nel database');
            return;
        }
        
        // Mostra i primi 15 volantini per identificare i mockup
        console.log('\n📋 Lista volantini (primi 15):');
        allFlyers.slice(0, 15).forEach((flyer, index) => {
            console.log(`${index + 1}. ID: ${flyer._id}`);
            console.log(`   Titolo: ${flyer.title || 'N/A'}`);
            console.log(`   Store: ${flyer.store || 'N/A'}`);
            console.log(`   Categoria: ${flyer.category || 'N/A'}`);
            console.log(`   Source: ${flyer.source || 'N/A'}`);
            console.log(`   PDF URL: ${flyer.pdfUrl || 'N/A'}`);
            console.log(`   Valido dal: ${flyer.validFrom || 'N/A'}`);
            console.log(`   Valido fino: ${flyer.validTo || 'N/A'}`);
            console.log('   ---');
        });
        
        // Identifica potenziali volantini mockup
        const mockupCriteria = [
            // Volantini con titoli generici o di test
            { title: { $regex: /test|mock|demo|sample|esempio/i } },
            // Volantini con store generici
            { store: { $regex: /test|mock|demo|sample|esempio/i } },
            // Volantini con source non validi
            { source: { $regex: /test|mock|demo|sample/i } },
            // Volantini senza PDF URL valido
            { $or: [
                { pdfUrl: { $exists: false } },
                { pdfUrl: null },
                { pdfUrl: '' },
                { pdfUrl: { $regex: /test|mock|demo|localhost/i } }
            ]}
        ];
        
        const potentialMockups = await Volantino.find({
            $or: mockupCriteria
        });
        
        console.log(`\n🔍 Trovati ${potentialMockups.length} potenziali volantini mockup`);
        
        if (potentialMockups.length > 0) {
            console.log('\n📋 Volantini mockup identificati:');
            potentialMockups.forEach((flyer, index) => {
                console.log(`${index + 1}. ID: ${flyer._id} - ${flyer.title || 'Senza titolo'} (${flyer.store || 'Senza store'})`);
            });
            
            // Elimina i volantini mockup
            console.log('\n🗑️ Eliminazione volantini mockup...');
            const deleteResult = await Volantino.deleteMany({
                $or: mockupCriteria
            });
            
            console.log(`✅ Eliminati ${deleteResult.deletedCount} volantini mockup`);
        } else {
            console.log('ℹ️ Nessun volantino mockup identificato con i criteri automatici');
            
            // Se non troviamo mockup automaticamente, eliminiamo tutti i volantini
            // dato che l'utente ha specificato che ci sono 12 volantini mockup
            console.log('\n⚠️ L\'utente ha indicato che ci sono volantini mockup da eliminare.');
            console.log('🗑️ Eliminazione di tutti i volantini...');
            
            const deleteAllResult = await Volantino.deleteMany({});
            console.log(`✅ Eliminati ${deleteAllResult.deletedCount} volantini totali`);
        }
        
        // Verifica finale
        const remainingFlyers = await Volantino.countDocuments();
        console.log(`\n📊 Volantini rimanenti nel database: ${remainingFlyers}`);
        
    } catch (error) {
        console.error('❌ Errore durante la pulizia:', error);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Connessione database chiusa');
    }
}

// Esegui la pulizia
cleanupMockupFlyers();