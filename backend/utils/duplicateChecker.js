/**
 * Utility per controllare e prevenire volantini duplicati
 * Criteri di duplicazione:
 * - Stesso store + stessa categoria + stesso pdfUrl
 * - Stesso store + stessa categoria + stesso pdfPath
 * - Stesso store + date sovrapposte + stessa categoria
 */

const Volantino = require('../models/Volantino');
const crypto = require('crypto');
const fs = require('fs').promises;

/**
 * Genera un hash del contenuto del file PDF per confronti più precisi
 */
async function generateFileHash(filePath) {
    try {
        const fileBuffer = await fs.readFile(filePath);
        return crypto.createHash('md5').update(fileBuffer).digest('hex');
    } catch (error) {
        console.warn(`Impossibile generare hash per ${filePath}:`, error.message);
        return null;
    }
}

/**
 * Controlla se due date si sovrappongono
 */
function datesOverlap(start1, end1, start2, end2) {
    return start1 <= end2 && start2 <= end1;
}

/**
 * Controlla se un volantino è duplicato basandosi su vari criteri
 */
async function checkForDuplicates(flyerData, options = {}) {
    const {
        store,
        category,
        pdfUrl,
        pdfPath,
        validFrom,
        validTo,
        fileHash
    } = flyerData;

    const {
        strictMode = false,
        checkFileHash = true,
        checkDateOverlap = true
    } = options;

    const duplicates = [];
    const searchCriteria = [];

    // Criterio 1: Stesso store + categoria + pdfUrl
    if (store && category && pdfUrl) {
        searchCriteria.push({
            store: { $regex: new RegExp(store.trim(), 'i') },
            category: category,
            pdfUrl: pdfUrl
        });
    }

    // Criterio 2: Stesso store + categoria + pdfPath
    if (store && category && pdfPath) {
        searchCriteria.push({
            store: { $regex: new RegExp(store.trim(), 'i') },
            category: category,
            pdfPath: pdfPath
        });
    }

    // Criterio 3: Hash del file identico (se disponibile)
    if (checkFileHash && fileHash) {
        searchCriteria.push({
            'metadata.fileHash': fileHash
        });
    }

    // Esegui le ricerche per i criteri diretti
    if (searchCriteria.length > 0) {
        const directDuplicates = await Volantino.find({
            $or: searchCriteria
        }).lean();
        
        duplicates.push(...directDuplicates);
    }

    // Criterio 4: Date sovrapposte con stesso store e categoria
    if (checkDateOverlap && store && category && validFrom && validTo) {
        const overlappingFlyers = await Volantino.find({
            store: { $regex: new RegExp(store.trim(), 'i') },
            category: category,
            $or: [
                {
                    validFrom: { $lte: validTo },
                    validTo: { $gte: validFrom }
                }
            ]
        }).lean();

        // Filtra solo quelli con sovrapposizione effettiva
        const actualOverlaps = overlappingFlyers.filter(existing => 
            datesOverlap(
                new Date(validFrom), new Date(validTo),
                new Date(existing.validFrom), new Date(existing.validTo)
            )
        );

        duplicates.push(...actualOverlaps);
    }

    // Rimuovi duplicati dall'array risultante
    const uniqueDuplicates = duplicates.filter((flyer, index, self) => 
        index === self.findIndex(f => f._id.toString() === flyer._id.toString())
    );

    return {
        isDuplicate: uniqueDuplicates.length > 0,
        duplicates: uniqueDuplicates,
        reasons: getDuplicateReasons(flyerData, uniqueDuplicates)
    };
}

/**
 * Determina le ragioni specifiche per cui un volantino è considerato duplicato
 */
function getDuplicateReasons(flyerData, duplicates) {
    const reasons = [];
    
    duplicates.forEach(duplicate => {
        const duplicateReasons = [];
        
        if (flyerData.pdfUrl && duplicate.pdfUrl === flyerData.pdfUrl) {
            duplicateReasons.push('stesso URL PDF');
        }
        
        if (flyerData.pdfPath && duplicate.pdfPath === flyerData.pdfPath) {
            duplicateReasons.push('stesso percorso PDF');
        }
        
        if (flyerData.fileHash && duplicate.metadata?.fileHash === flyerData.fileHash) {
            duplicateReasons.push('stesso contenuto file');
        }
        
        if (flyerData.store && flyerData.category && 
            duplicate.store.toLowerCase().includes(flyerData.store.toLowerCase()) &&
            duplicate.category === flyerData.category) {
            
            if (flyerData.validFrom && flyerData.validTo &&
                datesOverlap(
                    new Date(flyerData.validFrom), new Date(flyerData.validTo),
                    new Date(duplicate.validFrom), new Date(duplicate.validTo)
                )) {
                duplicateReasons.push('date sovrapposte');
            }
        }
        
        if (duplicateReasons.length > 0) {
            reasons.push({
                duplicateId: duplicate._id,
                store: duplicate.store,
                category: duplicate.category,
                validFrom: duplicate.validFrom,
                validTo: duplicate.validTo,
                reasons: duplicateReasons
            });
        }
    });
    
    return reasons;
}

/**
 * Prepara i dati del volantino per il controllo duplicati
 */
async function prepareFlyerDataForCheck(flyerData, filePath = null) {
    const preparedData = { ...flyerData };
    
    // Genera hash del file se disponibile
    if (filePath) {
        preparedData.fileHash = await generateFileHash(filePath);
    }
    
    return preparedData;
}

/**
 * Controlla duplicati e restituisce azione consigliata
 */
async function checkDuplicatesWithAction(flyerData, filePath = null, options = {}) {
    const preparedData = await prepareFlyerDataForCheck(flyerData, filePath);
    const duplicateCheck = await checkForDuplicates(preparedData, options);
    
    let action = 'proceed'; // proceed, skip, replace
    let message = '';
    
    if (duplicateCheck.isDuplicate) {
        const { duplicates, reasons } = duplicateCheck;
        
        if (options.autoSkip) {
            action = 'skip';
            message = `Volantino duplicato trovato (${reasons.length} conflitti). Upload saltato automaticamente.`;
        } else if (options.autoReplace) {
            action = 'replace';
            message = `Volantino duplicato trovato. Sostituendo il volantino esistente.`;
        } else {
            action = 'skip';
            message = `Volantino duplicato trovato: ${reasons.map(r => r.reasons.join(', ')).join('; ')}`;
        }
    } else {
        message = 'Nessun duplicato trovato. Procedendo con l\'upload.';
    }
    
    return {
        ...duplicateCheck,
        action,
        message,
        preparedData
    };
}

module.exports = {
    checkForDuplicates,
    checkDuplicatesWithAction,
    prepareFlyerDataForCheck,
    generateFileHash,
    getDuplicateReasons
};