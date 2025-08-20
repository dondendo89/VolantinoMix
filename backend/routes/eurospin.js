const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const Volantino = require('../models/Volantino');
const { checkDuplicatesWithAction } = require('../utils/duplicateChecker');

// Rate limiting per le operazioni di scraping
const scrapingRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 ora
    max: 50, // TEMPORANEO: aumentato per sviluppo (era 5)
    message: {
        error: 'Troppe operazioni di scraping, riprova tra 1 ora',
        code: 'SCRAPING_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Middleware per gestire gli errori di validazione
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Errori di validazione',
            details: errors.array()
        });
    }
    next();
};

/**
 * @route POST /api/eurospin/scrape
 * @desc Avvia lo scraping dei volantini Eurospin
 * @access Public (con rate limiting)
 */
router.post('/scrape', scrapingRateLimit, [
    body('force').optional().isBoolean().withMessage('force deve essere boolean'),
    body('downloadFolder').optional().isString().withMessage('downloadFolder deve essere una stringa'),
    body('apiUrl').optional().isURL().withMessage('apiUrl deve essere un URL valido')
], handleValidationErrors, async (req, res) => {
    console.log('🛍️ DEBUG - Endpoint scraping Eurospin chiamato');
    console.log('📋 DEBUG - Request body:', req.body);
    
    try {
        const { force = false, downloadFolder = 'volantini_eurospin', apiUrl = 'http://localhost:5000/api' } = req.body;
        
        // Percorso dello script Python per Eurospin
        const scriptPath = path.join(__dirname, '../../scraper_eurospin.py');
        
        // Verifica che lo script esista
        try {
            await fs.access(scriptPath);
        } catch (error) {
            console.error('❌ Script scraper_eurospin.py non trovato:', scriptPath);
            return res.status(500).json({
                success: false,
                error: 'Script di scraping non trovato',
                details: `File non trovato: ${scriptPath}`
            });
        }
        
        console.log('🐍 DEBUG - Avvio script Python:', scriptPath);
        console.log('📁 DEBUG - Download folder:', downloadFolder);
        console.log('🔗 DEBUG - API URL:', apiUrl);
        console.log('⚡ DEBUG - Force mode:', force);
        
        // Prepara gli argomenti per lo script Python
        const args = [
            scriptPath,
            '--download-folder', downloadFolder,
            '--api-url', apiUrl
        ];
        
        if (force) {
            args.push('--force');
        }
        
        console.log('🚀 DEBUG - Comando Python:', 'python3', args.join(' '));
        
        // Avvia il processo Python
        const pythonProcess = spawn('python3', args, {
            cwd: path.join(__dirname, '../..'),
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let errorOutput = '';
        
        pythonProcess.stdout.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            console.log('📤 Python stdout:', chunk.trim());
        });
        
        pythonProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            errorOutput += chunk;
            console.error('📥 Python stderr:', chunk.trim());
        });
        
        pythonProcess.on('close', (code) => {
            console.log(`🏁 DEBUG - Processo Python terminato con codice: ${code}`);
            
            if (code === 0) {
                console.log('✅ Scraping Eurospin completato con successo');
            } else {
                console.error('❌ Errore durante lo scraping Eurospin');
                console.error('Output:', output);
                console.error('Error output:', errorOutput);
            }
        });
        
        pythonProcess.on('error', (error) => {
            console.error('❌ Errore nell\'avvio del processo Python:', error);
            if (!res.headersSent) {
                return res.status(500).json({
                    success: false,
                    error: 'Errore nell\'avvio dello scraping',
                    details: error.message
                });
            }
        });
        
        // Risposta immediata
        res.json({
            success: true,
            message: 'Scraping Eurospin avviato',
            details: {
                force,
                downloadFolder,
                apiUrl,
                scriptPath
            }
        });
        
    } catch (error) {
        console.error('❌ Errore generale nell\'endpoint scraping Eurospin:', error);
        
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Errore interno del server',
                details: error.message
            });
        }
    }
});

/**
 * @route GET /api/eurospin/stats
 * @desc Ottiene le statistiche dei volantini Eurospin
 * @access Public
 */
router.get('/stats', async (req, res) => {
    try {
        console.log('📊 DEBUG - Richiesta statistiche volantini Eurospin');
        
        // Conta i volantini Eurospin nel database
        const totalCount = await Volantino.countDocuments({ source: 'eurospin' });
        
        // Conta volantini aggiunti nell'ultima settimana
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const lastWeekCount = await Volantino.countDocuments({
            source: 'eurospin',
            createdAt: { $gte: oneWeekAgo }
        });
        
        // Trova il volantino più recente
        const latestFlyer = await Volantino.findOne({ source: 'eurospin' })
            .sort({ createdAt: -1 })
            .select('createdAt')
            .lean();
        
        // Trova i volantini più recenti per la visualizzazione
        const recentFlyers = await Volantino.find({ source: 'eurospin' })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('store location.city validFrom validTo pages category createdAt pdfUrl')
            .lean();
        
        res.json({
            success: true,
            total: totalCount,
            lastWeek: lastWeekCount,
            lastUpdate: latestFlyer ? latestFlyer.createdAt : null,
            recentFlyers: recentFlyers
        });
        
    } catch (error) {
        console.error('❌ Errore nel recupero statistiche Eurospin:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel recupero statistiche Eurospin',
            message: error.message
        });
    }
});

/**
 * @route GET /api/eurospin/flyers
 * @desc Ottiene tutti i volantini Eurospin
 * @access Public
 */
router.get('/flyers', async (req, res) => {
    try {
        console.log('📋 DEBUG - Richiesta volantini Eurospin');
        
        const eurospinFlyers = await Volantino.find({ source: 'eurospin' })
            .sort({ createdAt: -1 })
            .select('-__v')
            .lean();
        
        res.json({
            success: true,
            data: eurospinFlyers,
            count: eurospinFlyers.length,
            message: `Trovati ${eurospinFlyers.length} volantini Eurospin`
        });
        
    } catch (error) {
        console.error('❌ Errore nel recupero volantini Eurospin:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel recupero volantini Eurospin',
            message: error.message
        });
    }
});

/**
 * @route DELETE /api/eurospin/cleanup
 * @desc Rimuove i volantini Eurospin scaduti e i file PDF associati
 * @access Public (con rate limiting)
 */
router.delete('/cleanup', scrapingRateLimit, async (req, res) => {
    try {
        console.log('🧹 DEBUG - Avvio cleanup volantini Eurospin scaduti');
        
        const now = new Date();
        
        // Trova volantini scaduti
        const expiredFlyers = await Volantino.find({
            source: 'eurospin',
            $or: [
                { validUntil: { $lt: now } },
                { isActive: false }
            ]
        });
        
        console.log(`📋 DEBUG - Trovati ${expiredFlyers.length} volantini scaduti da rimuovere`);
        
        let deletedFiles = 0;
        let errors = [];
        
        // Rimuovi i file PDF associati
        for (const flyer of expiredFlyers) {
            if (flyer.pdfPath) {
                try {
                    // Costruisci il percorso assoluto corretto
        const fullPath = path.resolve(__dirname, '../../', flyer.pdfPath);
                    await fs.unlink(fullPath);
                    deletedFiles++;
                    console.log(`🗑️ DEBUG - File eliminato: ${fullPath}`);
                } catch (fileError) {
                    console.error(`❌ DEBUG - Errore eliminazione file ${flyer.pdfPath}:`, fileError.message);
                    errors.push({
                        file: flyer.pdfPath,
                        error: fileError.message
                    });
                }
            }
        }
        
        // Rimuovi i record dal database
        const deleteResult = await Volantino.deleteMany({
            source: 'eurospin',
            $or: [
                { validUntil: { $lt: now } },
                { isActive: false }
            ]
        });
        
        console.log(`✅ DEBUG - Cleanup completato: ${deleteResult.deletedCount} record eliminati, ${deletedFiles} file eliminati`);
        
        res.json({
            success: true,
            message: `Cleanup completato: eliminati ${deleteResult.deletedCount} volantini scaduti`,
            details: {
                deletedRecords: deleteResult.deletedCount,
                deletedFiles,
                errors: errors.length > 0 ? errors : undefined
            }
        });
        
    } catch (error) {
        console.error('❌ Errore durante cleanup Eurospin:', error);
        res.status(500).json({
            success: false,
            error: 'Errore durante cleanup',
            message: error.message
        });
    }
});

/**
 * @route DELETE /api/eurospin/delete-all
 * @desc Elimina tutti i volantini Eurospin e i file PDF associati
 * @access Public (con rate limiting)
 */
router.delete('/delete-all', scrapingRateLimit, async (req, res) => {
    try {
        console.log('🗑️ DEBUG - Avvio eliminazione di tutti i volantini Eurospin');
        
        // Trova tutti i volantini Eurospin
        const allFlyers = await Volantino.find({ source: 'eurospin' });
        
        console.log(`📋 DEBUG - Trovati ${allFlyers.length} volantini Eurospin da eliminare`);
        
        let deletedFiles = 0;
        let filesNotFound = 0;
        let errors = [];
        
        // Elimina i file PDF associati
        for (const flyer of allFlyers) {
            if (flyer.pdfPath) {
                try {
                    const fullPath = path.resolve(flyer.pdfPath);
                    await fs.unlink(fullPath);
                    deletedFiles++;
                    console.log(`🗑️ DEBUG - File eliminato: ${fullPath}`);
                } catch (fileError) {
                    if (fileError.code === 'ENOENT') {
                        filesNotFound++;
                        console.log(`⚠️ DEBUG - File non trovato: ${flyer.pdfPath}`);
                    } else {
                        console.error(`❌ DEBUG - Errore eliminazione file ${flyer.pdfPath}:`, fileError.message);
                        errors.push({
                            file: flyer.pdfPath,
                            error: fileError.message
                        });
                    }
                }
            }
        }
        
        // Elimina tutti i record dal database
        const deleteResult = await Volantino.deleteMany({ source: 'eurospin' });
        
        console.log(`✅ DEBUG - Eliminazione completata: ${deleteResult.deletedCount} record eliminati`);
        
        res.json({
            success: true,
            message: `Eliminati tutti i volantini Eurospin: ${deleteResult.deletedCount} record`,
            deleted: {
                records: deleteResult.deletedCount,
                files: deletedFiles,
                filesNotFound,
                errors: errors.length
            }
        });
        
    } catch (error) {
        console.error('❌ Errore durante eliminazione Eurospin:', error);
        res.status(500).json({
            success: false,
            error: 'Errore durante eliminazione',
            message: error.message
        });
    }
});

/**
 * @route GET /api/eurospin/pdf/:id
 * @desc Visualizza un PDF Eurospin specifico
 * @access Public
 */
router.get('/pdf/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const flyer = await Volantino.findById(id);
        
        if (!flyer || flyer.source !== 'eurospin') {
            return res.status(404).json({
                success: false,
                error: 'Volantino Eurospin non trovato'
            });
        }
        
        if (!flyer.pdfPath) {
            return res.status(404).json({
                success: false,
                error: 'PDF non disponibile per questo volantino'
            });
        }
        
        // Costruisci il percorso assoluto corretto
        const fullPath = path.resolve(__dirname, '../../', flyer.pdfPath);
        
        // Verifica che il file esista
        try {
            await fs.access(fullPath);
        } catch (error) {
            return res.status(404).json({
                success: false,
                error: 'File PDF non trovato sul server'
            });
        }
        
        // Invia il file PDF
        res.sendFile(fullPath);
        
    } catch (error) {
        console.error('❌ Errore nel recupero PDF Eurospin:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel recupero del PDF',
            message: error.message
        });
    }
});

/**
 * @route POST /api/eurospin/upload
 * @desc Carica un volantino Eurospin nel database
 * @access Public
 */
router.post('/upload', async (req, res) => {
    try {
        console.log('📤 DEBUG - Upload volantino Eurospin:', req.body);
        
        const { filename, store_name, store_type, location, pdf_url, pdf_path } = req.body;
        
        if (!filename || !store_name) {
            return res.status(400).json({
                success: false,
                error: 'Parametri mancanti: filename e store_name sono obbligatori'
            });
        }
        
        // Date di validità (default: da oggi a 30 giorni)
        const validFrom = new Date();
        const validTo = new Date();
        validTo.setDate(validTo.getDate() + 30);
        
        // Genera un URL PDF se non fornito
        let finalPdfUrl = pdf_url;
        if (!finalPdfUrl && pdf_path) {
            // Genera un URL basato sul percorso del file
            const fileName = path.basename(pdf_path);
            finalPdfUrl = `http://localhost:5000/api/pdfs/download/${fileName}`;
        }
        if (!finalPdfUrl) {
            finalPdfUrl = `http://localhost:5000/api/eurospin/pdf/placeholder`;
        }

        // Prepara i dati per il controllo duplicati
        const flyerData = {
            store: store_name || 'Eurospin',
            category: 'Supermercato',
            pdfUrl: finalPdfUrl,
            pdfPath: pdf_path || '',
            validFrom: validFrom,
            validTo: validTo
        };
        
        // Controlla duplicati
        const duplicateCheck = await checkDuplicatesWithAction(
            flyerData, 
            pdf_path, 
            { autoSkip: true, checkFileHash: true }
        );
        
        if (duplicateCheck.action === 'skip') {
            console.log(`⚠️ Volantino Eurospin duplicato saltato: ${filename}`);
            console.log(`   Motivo: ${duplicateCheck.message}`);
            
            return res.json({
                success: false,
                message: 'Volantino duplicato non caricato',
                reason: duplicateCheck.message,
                duplicates: duplicateCheck.reasons
            });
        }
        
        // Crea nuovo volantino
        const volantino = new Volantino({
            filename: filename,
            store: store_name || 'Eurospin',
            store_name: store_name || 'Eurospin',
            location: {
                cap: location || '00100',
                city: 'Roma', // Default
                address: 'Varie sedi',
                coordinates: {
                    lat: 41.9028,
                    lng: 12.4964
                }
            },
            validFrom: validFrom,
            validTo: validTo,
            pages: 8, // Default per volantini Eurospin
            category: 'Supermercato',
            pdfUrl: finalPdfUrl,
            pdfPath: pdf_path || '', // Percorso locale del file PDF
            fileSize: '10 MB', // Default, può essere migliorato
            metadata: {
                originalFileName: filename,
                source: 'eurospin',
                uploadDate: new Date(),
                fileHash: duplicateCheck.preparedData.fileHash
            },
            source: 'eurospin'
        });
        
        await volantino.save();
        
        console.log(`✅ Volantino Eurospin salvato nel database: ${filename}`);
        
        res.json({
            success: true,
            message: 'Volantino caricato con successo',
            volantino: {
                id: volantino._id,
                filename: volantino.filename,
                store_name: volantino.store_name,
                upload_date: volantino.upload_date
            }
        });
        
    } catch (error) {
        console.error('❌ Errore durante l\'upload del volantino Eurospin:', error);
        res.status(500).json({
            success: false,
            error: 'Errore durante l\'upload',
            details: error.message
        });
    }
});

module.exports = router;