const mongoose = require('mongoose');
const Volantino = require('./models/Volantino');

async function testDB() {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/volantinomix';
        await mongoose.connect(mongoURI);
        console.log('✅ Connected to MongoDB');
        
        // Conta tutti i volantini
        const totalCount = await Volantino.countDocuments();
        console.log(`📊 Total volantini: ${totalCount}`);
        
        // Conta volantini attivi
        const activeCount = await Volantino.countDocuments({ isActive: true });
        console.log(`✅ Active volantini: ${activeCount}`);
        
        // Mostra alcuni volantini (solo ID e campi base)
        const volantini = await Volantino.find({}).limit(3).select('_id store source isActive').lean();
        console.log('📋 Sample volantini:', volantini);
        
        // Verifica gli ID specifici che stavamo testando
        const testIds = ['68a6d8923b81a78bb19919e3', '68a6d8943b81a78bb19919e5'];
        for (const id of testIds) {
            try {
                const volantino = await Volantino.findById(id);
                console.log(`🔍 Volantino ${id}:`, volantino ? 'Found' : 'Not found');
            } catch (err) {
                console.log(`❌ Error checking ${id}:`, err.message);
            }
        }
        
    } catch (error) {
        console.error('❌ Database error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB');
    }
}

testDB();