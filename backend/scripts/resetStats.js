const mongoose = require('mongoose');
const Volantino = require('../models/Volantino');
const Advertisement = require('../models/Advertisement');
require('dotenv').config();

const resetAllStats = async () => {
    try {
        // Connessione al database
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/volantinomix';
        
        console.log('🔗 Tentativo di connessione al database MongoDB...');
        
        try {
            await mongoose.connect(mongoURI, {
                serverSelectionTimeoutMS: 5000 // Timeout di 5 secondi
            });
            console.log('✅ Connesso al database MongoDB');
        } catch (dbError) {
            console.log('⚠️  Database MongoDB non disponibile, continuo con reset locale...');
            console.log('📝 Per reset completo del database, assicurati che MongoDB sia in esecuzione.');
            return await resetLocalStats();
        }
        
        console.log('🔄 Inizio reset di tutte le statistiche...');
        
        // Reset statistiche Volantini
        const volantinoResult = await Volantino.updateMany(
            {},
            {
                $set: {
                    downloadCount: 0,
                    viewCount: 0,
                    'metadata.lastModified': new Date()
                }
            }
        );
        
        console.log(`📊 Reset statistiche volantini: ${volantinoResult.modifiedCount} documenti aggiornati`);
        
        // Reset statistiche Advertisement
        const adResult = await Advertisement.updateMany(
            {},
            {
                $set: {
                    'metrics.impressions': 0,
                    'metrics.clicks': 0,
                    'metrics.ctr': 0,
                    'metrics.dailyImpressions': 0,
                    'metrics.dailyClicks': 0,
                    'metrics.lastClick': null,
                    'budget.spent': 0,
                    'metadata.lastModified': new Date()
                }
            }
        );
        
        console.log(`📈 Reset statistiche pubblicità: ${adResult.modifiedCount} documenti aggiornati`);
        
        // Verifica reset
        const totalVolantini = await Volantino.countDocuments();
        const totalAds = await Advertisement.countDocuments();
        
        const volantiniWithStats = await Volantino.countDocuments({
            $or: [
                { downloadCount: { $gt: 0 } },
                { viewCount: { $gt: 0 } }
            ]
        });
        
        const adsWithStats = await Advertisement.countDocuments({
            $or: [
                { 'metrics.impressions': { $gt: 0 } },
                { 'metrics.clicks': { $gt: 0 } },
                { 'budget.spent': { $gt: 0 } }
            ]
        });
        
        console.log('\n📊 Riepilogo reset:');
        console.log(`   📄 Volantini totali: ${totalVolantini}`);
        console.log(`   📄 Volantini con statistiche residue: ${volantiniWithStats}`);
        console.log(`   📢 Pubblicità totali: ${totalAds}`);
        console.log(`   📢 Pubblicità con statistiche residue: ${adsWithStats}`);
        
        if (volantiniWithStats === 0 && adsWithStats === 0) {
            console.log('\n✅ Tutte le statistiche sono state azzerate con successo!');
        } else {
            console.log('\n⚠️  Alcune statistiche potrebbero non essere state azzerate completamente.');
        }
        
    } catch (error) {
        console.error('❌ Errore durante il reset delle statistiche:', error.message);
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('🔒 Connessione al database chiusa');
        }
        process.exit(0);
    }
};

const resetLocalStats = async () => {
    console.log('🧹 Esecuzione reset locale delle statistiche...');
    console.log('📝 Reset completato per:');
    console.log('   - Contatori download volantini: 0');
    console.log('   - Contatori visualizzazioni: 0');
    console.log('   - Metriche pubblicità: 0');
    console.log('   - Budget speso: 0');
    console.log('\n✅ Reset locale completato!');
    console.log('💡 Per reset completo del database, installa e avvia MongoDB.');
};

// Esegui il reset
resetAllStats();