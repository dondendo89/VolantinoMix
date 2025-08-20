const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const Volantino = require('../models/Volantino');

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
 * @route POST /api/deco/scrape
 * @desc Avvia lo scraping dei volantini Decò
 * @access Public (con rate limiting)
 */
router.post('/scrape', scrapingRateLimit, [
    body('force').optional().isBoolean().withMessage('force deve essere boolean'),
    body('downloadFolder').optional().isString().withMessage('downloadFolder deve essere una stringa'),
    body('apiUrl').optional().isURL().withMessage('apiUrl deve essere un URL valido')
], handleValidationErrors, async (req, res) => {
    console.log('🏪 DEBUG - Endpoint scraping Decò chiamato');
    console.log('📋 DEBUG - Request body:', req.body);
    
    try {
        const { force = false, downloadFolder = 'volantini_deco', apiUrl = 'http://localhost:5000/api' } = req.body;
        
        // Path dello script Python
        const scriptPath = path.join(__dirname, '../../scraper_deco.py');
        
        // Verifica che lo script esista
        try {
            await fs.access(scriptPath);
        } catch (error) {
            console.log('❌ DEBUG - Script scraper_deco.py non trovato:', scriptPath);
            return res.status(500).json({
                success: false,
                error: 'Script di scraping non trovato',
                message: 'Il file scraper_deco.py non è presente nel sistema',
                code: 'SCRAPER_NOT_FOUND'
            });
        }
        
        // Prepara gli argomenti per lo script Python
        const args = [
            scriptPath,
            '--folder', downloadFolder,
            '--api', apiUrl
        ];
        
        if (!force) {
            // Controlla se ci sono già volantini Decò recenti (ultimi 7 giorni)
            const recentFlyers = await Volantino.find({
                source: 'deco',
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            }).countDocuments();
            
            if (recentFlyers > 0) {
                console.log(`⏭️ DEBUG - Trovati ${recentFlyers} volantini Decò recenti, skip scraping`);
                return res.json({
                    success: true,
                    message: 'Scraping saltato: volantini Decò già aggiornati di recente',
                    recentFlyers,
                    lastUpdate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
                });
            }
        }
        
        console.log('🚀 DEBUG - Avvio script Python:', args.join(' '));
        
        // Avvia lo script Python in modo asincrono
        const pythonProcess = spawn('python3', args, {
            cwd: path.join(__dirname, '../..'),
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
            console.log('📄 SCRAPER OUTPUT:', data.toString().trim());
        });
        
        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
            console.log('🚨 SCRAPER ERROR:', data.toString().trim());
        });
        
        // Gestisce la fine del processo
        pythonProcess.on('close', async (code) => {
            console.log(`🏁 DEBUG - Script terminato con codice: ${code}`);
            
            if (code === 0) {
                // Parsing delle statistiche dal output
                const statsMatch = stdout.match(/📊 RIEPILOGO SCRAPING DECÒ[\s\S]*?🌐 API endpoint: (.+)/m);
                let stats = {
                    found: 0,
                    downloaded: 0,
                    uploaded: 0,
                    errors: 0
                };
                
                if (statsMatch) {
                    const foundMatch = stdout.match(/🔍 PDF trovati: (\d+)/);
                    const downloadedMatch = stdout.match(/📥 PDF scaricati: (\d+)/);
                    const uploadedMatch = stdout.match(/📤 PDF caricati in VolantinoMix: (\d+)/);
                    const errorsMatch = stdout.match(/❌ Errori: (\d+)/);
                    
                    if (foundMatch) stats.found = parseInt(foundMatch[1]);
                    if (downloadedMatch) stats.downloaded = parseInt(downloadedMatch[1]);
                    if (uploadedMatch) stats.uploaded = parseInt(uploadedMatch[1]);
                    if (errorsMatch) stats.errors = parseInt(errorsMatch[1]);
                }
                
                console.log('✅ DEBUG - Scraping completato con successo:', stats);
            } else {
                console.log('❌ DEBUG - Scraping fallito:', { code, stderr });
            }
        });
        
        // Risposta immediata (processo asincrono)
        res.json({
            success: true,
            message: 'Scraping Decò avviato in background',
            processId: pythonProcess.pid,
            timestamp: new Date().toISOString(),
            parameters: {
                force,
                downloadFolder,
                apiUrl
            }
        });
        
    } catch (error) {
        console.error('❌ DEBUG - Errore durante scraping:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: error.message,
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
});

/**
 * @route GET /api/deco/status
 * @desc Ottiene lo stato dei volantini Decò nel database
 * @access Public
 */
router.get('/status', async (req, res) => {
    try {
        console.log('📊 DEBUG - Richiesta status volantini Decò');
        
        // Conta i volantini Decò per tipo
        const decoStats = await Volantino.aggregate([
            {
                $match: {
                    store: { $regex: /decò/i }
                }
            },
            {
                $group: {
                    _id: '$store',
                    count: { $sum: 1 },
                    lastUpdate: { $max: '$createdAt' },
                    avgFileSize: { $avg: '$fileSize' }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);
        
        // Volantini Decò più recenti
        const recentFlyers = await Volantino.find({
            store: { $regex: /decò/i }
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('store category location.cap createdAt filename fileSize');
        
        // Statistiche generali
        const totalDeco = await Volantino.countDocuments({
            store: { $regex: /decò/i }
        });
        
        const lastWeekDeco = await Volantino.countDocuments({
            store: { $regex: /decò/i },
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        });
        
        res.json({
            success: true,
            data: {
                totalFlyers: totalDeco,
                lastWeekFlyers: lastWeekDeco,
                storeBreakdown: decoStats,
                recentFlyers,
                lastUpdate: decoStats.length > 0 ? Math.max(...decoStats.map(s => new Date(s.lastUpdate))) : null
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ DEBUG - Errore ottenendo status Decò:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: error.message
        });
    }
});

/**
 * @route GET /api/deco
 * @desc Ottiene tutti i volantini Decò dal database
 * @access Public
 */
router.get('/', async (req, res) => {
    try {
        console.log('📋 DEBUG - Richiesta volantini Decò');
        
        // Recupera tutti i volantini Decò dal database
        const decoFlyers = await Volantino.find({
            source: 'deco'
        }).sort({ createdAt: -1 });
        
        console.log(`📊 DEBUG - Trovati ${decoFlyers.length} volantini Decò`);
        
        res.json({
            success: true,
            data: decoFlyers,
            count: decoFlyers.length,
            message: `Trovati ${decoFlyers.length} volantini Decò`
        });
        
    } catch (error) {
        console.error('❌ Errore nel recupero volantini Decò:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel recupero volantini Decò',
            message: error.message
        });
    }
});

/**
 * @route DELETE /api/deco/cleanup
 * @desc Rimuove volantini Decò scaduti (più vecchi di 30 giorni)
 * @access Public (con rate limiting)
 */
router.delete('/cleanup', scrapingRateLimit, async (req, res) => {
    try {
        console.log('🧹 DEBUG - Avvio cleanup volantini Decò scaduti');
        
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        // Trova volantini Decò scaduti
        const expiredFlyers = await Volantino.find({
            store: { $regex: /decò/i },
            createdAt: { $lt: thirtyDaysAgo }
        });
        
        console.log(`🗑️ DEBUG - Trovati ${expiredFlyers.length} volantini Decò scaduti`);
        
        // Rimuovi i file fisici
        let filesDeleted = 0;
        for (const flyer of expiredFlyers) {
            try {
                const filePath = path.join(__dirname, '../uploads/pdfs', flyer.filename);
                await fs.unlink(filePath);
                filesDeleted++;
                console.log(`🗑️ DEBUG - File rimosso: ${flyer.filename}`);
            } catch (fileError) {
                console.log(`⚠️ DEBUG - Errore rimozione file ${flyer.filename}:`, fileError.message);
            }
        }
        
        // Rimuovi i record dal database
        const deleteResult = await Volantino.deleteMany({
            store: { $regex: /decò/i },
            createdAt: { $lt: thirtyDaysAgo }
        });
        
        console.log(`✅ DEBUG - Cleanup completato: ${deleteResult.deletedCount} record, ${filesDeleted} file`);
        
        res.json({
            success: true,
            message: 'Cleanup volantini Decò completato',
            deleted: {
                records: deleteResult.deletedCount,
                files: filesDeleted
            },
            cutoffDate: thirtyDaysAgo.toISOString()
        });
        
    } catch (error) {
        console.error('❌ DEBUG - Errore durante cleanup:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: error.message
        });
    }
});

/**
 * @route DELETE /api/deco/delete-all-pdfs
 * @desc Elimina tutti i PDF dei volantini Decò
 * @access Public (con rate limiting)
 */
router.delete('/delete-all-pdfs', scrapingRateLimit, async (req, res) => {
    try {
        console.log('🗑️ DEBUG - Avvio eliminazione di tutti i PDF Decò');
        
        // Trova tutti i volantini Decò
        const decoFlyers = await Volantino.find({
            store: { $regex: /decò/i }
        });
        
        console.log(`🗑️ DEBUG - Trovati ${decoFlyers.length} volantini Decò totali`);
        
        // Rimuovi i file fisici
        let filesDeleted = 0;
        let filesNotFound = 0;
        
        for (const flyer of decoFlyers) {
            try {
                // Prova prima nella cartella uploads/pdfs
                let filePath = path.join(__dirname, '../uploads/pdfs', flyer.filename);
                try {
                    await fs.unlink(filePath);
                    filesDeleted++;
                    console.log(`🗑️ DEBUG - File rimosso da uploads: ${flyer.filename}`);
                } catch (uploadError) {
                    // Se non trovato in uploads, prova nella cartella volantini_deco
                    filePath = path.join(__dirname, '../../volantini_deco', flyer.filename);
                    try {
                        await fs.unlink(filePath);
                        filesDeleted++;
                        console.log(`🗑️ DEBUG - File rimosso da volantini_deco: ${flyer.filename}`);
                    } catch (decoError) {
                        filesNotFound++;
                        console.log(`⚠️ DEBUG - File non trovato: ${flyer.filename}`);
                    }
                }
            } catch (fileError) {
                console.log(`⚠️ DEBUG - Errore rimozione file ${flyer.filename}:`, fileError.message);
            }
        }
        
        // Rimuovi tutti i record Decò dal database
        const deleteResult = await Volantino.deleteMany({
            store: { $regex: /decò/i }
        });
        
        console.log(`✅ DEBUG - Eliminazione completata: ${deleteResult.deletedCount} record, ${filesDeleted} file eliminati, ${filesNotFound} file non trovati`);
        
        res.json({
            success: true,
            message: 'Tutti i PDF Decò sono stati eliminati',
            deleted: {
                records: deleteResult.deletedCount,
                files: filesDeleted,
                filesNotFound: filesNotFound
            }
        });
        
    } catch (error) {
        console.error('❌ DEBUG - Errore durante eliminazione PDF:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: error.message
        });
    }
});

module.exports = router;