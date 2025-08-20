#!/usr/bin/env node
/**
 * Script per identificare e rimuovere volantini duplicati dal database
 * Criteri di duplicazione:
 * - Stesso store + stessa categoria + stesso pdfUrl
 * - Stesso store + stessa categoria + stesso pdfPath
 * - Stesso store + date sovrapposte + stessa categoria
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Importa il modello Volantino
const Volantino = require('./models/Volantino');

// Connessione al database
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/volantinomix');
        console.log('✅ Connesso al database MongoDB');
    } catch (error) {
        console.error('❌ Errore connessione database:', error);
        process.exit(1);
    }
};

// Funzione per identificare duplicati
const findDuplicates = async () => {
    console.log('🔍 Ricerca volantini duplicati...');
    
    const allFlyers = await Volantino.find({}).lean();
    console.log(`📊 Trovati ${allFlyers.length} volantini totali`);
    
    const duplicates = [];
    const seen = new Map();
    
    for (const flyer of allFlyers) {
        // Crea chiavi per identificare duplicati
        const keys = [
            // Stesso store + categoria + pdfUrl
            `${flyer.store}_${flyer.category}_${flyer.pdfUrl}`,
            // Stesso store + categoria + pdfPath (se esiste)
            flyer.pdfPath ? `${flyer.store}_${flyer.category}_${flyer.pdfPath}` : null
        ].filter(Boolean);
        
        for (const key of keys) {
            if (seen.has(key)) {
                const original = seen.get(key);
                duplicates.push({
                    key,
                    original: {
                        id: original._id,
                        store: original.store,
                        category: original.category,
                        source: original.source,
                        createdAt: original.createdAt,
                        pdfUrl: original.pdfUrl,
                        pdfPath: original.pdfPath
                    },
                    duplicate: {
                        id: flyer._id,
                        store: flyer.store,
                        category: flyer.category,
                        source: flyer.source,
                        createdAt: flyer.createdAt,
                        pdfUrl: flyer.pdfUrl,
                        pdfPath: flyer.pdfPath
                    }
                });
            } else {
                seen.set(key, flyer);
            }
        }
    }
    
    return duplicates;
};

// Funzione per rimuovere duplicati
const removeDuplicates = async (duplicates, dryRun = true) => {
    console.log(`\n🗑️ ${dryRun ? 'SIMULAZIONE' : 'RIMOZIONE'} duplicati...`);
    
    let removedCount = 0;
    const toRemove = [];
    
    // Raggruppa duplicati per chiave
    const groupedDuplicates = new Map();
    for (const dup of duplicates) {
        if (!groupedDuplicates.has(dup.key)) {
            groupedDuplicates.set(dup.key, []);
        }
        groupedDuplicates.get(dup.key).push(dup);
    }
    
    for (const [key, dups] of groupedDuplicates) {
        console.log(`\n📋 Gruppo duplicati per chiave: ${key}`);
        
        // Raccogli tutti i volantini per questa chiave (originale + duplicati)
        const allInGroup = [];
        const originalIds = new Set();
        
        for (const dup of dups) {
            if (!originalIds.has(dup.original.id.toString())) {
                allInGroup.push(dup.original);
                originalIds.add(dup.original.id.toString());
            }
            allInGroup.push(dup.duplicate);
        }
        
        // Ordina per data di creazione (mantieni il più vecchio)
        allInGroup.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        console.log(`   📊 Trovati ${allInGroup.length} volantini duplicati:`);
        allInGroup.forEach((flyer, index) => {
            const status = index === 0 ? '✅ MANTIENI' : '❌ RIMUOVI';
            console.log(`   ${status} - ID: ${flyer.id} | Store: ${flyer.store} | Source: ${flyer.source} | Data: ${flyer.createdAt}`);
        });
        
        // Rimuovi tutti tranne il primo (più vecchio)
        const flyersToRemove = allInGroup.slice(1);
        toRemove.push(...flyersToRemove);
        removedCount += flyersToRemove.length;
    }
    
    if (!dryRun && toRemove.length > 0) {
        console.log(`\n🗑️ Rimozione di ${toRemove.length} volantini duplicati...`);
        
        for (const flyer of toRemove) {
            try {
                await Volantino.findByIdAndDelete(flyer.id);
                console.log(`✅ Rimosso: ${flyer.id} - ${flyer.store} (${flyer.source})`);
            } catch (error) {
                console.error(`❌ Errore rimozione ${flyer.id}:`, error.message);
            }
        }
    }
    
    return { removedCount, toRemove };
};

// Funzione principale
const main = async () => {
    try {
        await connectDB();
        
        // Trova duplicati
        const duplicates = await findDuplicates();
        
        if (duplicates.length === 0) {
            console.log('✅ Nessun duplicato trovato!');
            return;
        }
        
        console.log(`\n⚠️ Trovati ${duplicates.length} gruppi di duplicati`);
        
        // Prima esegui una simulazione
        console.log('\n=== SIMULAZIONE ===');
        const { removedCount } = await removeDuplicates(duplicates, true);
        
        if (removedCount > 0) {
            console.log(`\n📊 Verranno rimossi ${removedCount} volantini duplicati`);
            
            // Chiedi conferma
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            const answer = await new Promise(resolve => {
                rl.question('\n❓ Vuoi procedere con la rimozione? (y/N): ', resolve);
            });
            
            rl.close();
            
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                console.log('\n=== RIMOZIONE EFFETTIVA ===');
                await removeDuplicates(duplicates, false);
                console.log('\n✅ Rimozione completata!');
            } else {
                console.log('\n❌ Operazione annullata');
            }
        }
        
    } catch (error) {
        console.error('❌ Errore:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnesso dal database');
    }
};

// Esegui lo script
if (require.main === module) {
    main();
}

module.exports = { findDuplicates, removeDuplicates };