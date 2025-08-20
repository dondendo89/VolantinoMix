const fs = require('fs');
const path = require('path');

const cleanDatabase = async () => {
    try {
        console.log('🧹 Inizio pulizia del database e file...');
        
        // Pulisci la cartella uploads/pdfs
        const uploadsDir = path.join(__dirname, '../uploads/pdfs');
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            let deletedCount = 0;
            
            files.forEach(file => {
                if (file.endsWith('.pdf')) {
                    const filePath = path.join(uploadsDir, file);
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            });
            
            console.log(`🗑️  Eliminati ${deletedCount} file PDF dalla cartella uploads`);
        }
        
        // Pulisci la cartella public/pdfs
        const publicPdfsDir = path.join(__dirname, '../../public/pdfs');
        if (fs.existsSync(publicPdfsDir)) {
            const files = fs.readdirSync(publicPdfsDir);
            let deletedCount = 0;
            
            files.forEach(file => {
                if (file.endsWith('.pdf')) {
                    const filePath = path.join(publicPdfsDir, file);
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            });
            
            console.log(`🗑️  Eliminati ${deletedCount} file PDF dalla cartella public`);
        }
        
        console.log('✅ Pulizia completata!');
        console.log('📝 Nota: Per pulire completamente il database MongoDB, assicurati che sia installato e in esecuzione.');
        console.log('💡 Suggerimento: Installa MongoDB con "brew install mongodb-community" dopo aver aggiornato i Command Line Tools.');
        
    } catch (error) {
        console.error('❌ Errore durante la pulizia:', error.message);
    }
};

// Esegui la pulizia
cleanDatabase();