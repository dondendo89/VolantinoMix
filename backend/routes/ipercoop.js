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
 * @route POST /api/ipercoop/scrape
 * @desc Avvia lo scraping dei volantini Ipercoop
 * @access Public (con rate limiting)
 */
router.post('/scrape', scrapingRateLimit, [
    body('force').optional().isBoolean().withMessage('force deve essere boolean'),
    body('downloadFolder').optional().isString().withMessage('downloadFolder deve essere una stringa'),
    body('apiUrl').optional().isURL().withMessage('apiUrl deve essere un URL valido')
], handleValidationErrors, async (req, res) => {
    console.log('🏪 DEBUG - Endpoint scraping Ipercoop chiamato');
    console.log('📋 DEBUG - Request body:', req.body);
    
    try {
        const { force = false, downloadFolder = 'volantini_ipercoop', apiUrl = 'http://localhost:5000/api' } = req.body;
        
        // Percorso dello script Python per Ipercoop
        const scriptPath = path.join(__dirname, '../../scraper_ipercoop.py');
        
        // Verifica che lo script esista
        try {
            await fs.access(scriptPath);
        } catch (error) {
            console.error('❌ Script scraper_ipercoop.py non trovato:', scriptPath);
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
                console.log('✅ Scraping Ipercoop completato con successo');
                // Non inviamo la risposta qui perché potrebbe essere già stata inviata
            } else {
                console.error('❌ Errore durante lo scraping Ipercoop');
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
            message: 'Scraping Ipercoop avviato',
            details: {
                force,
                downloadFolder,
                apiUrl,
                scriptPath
            }
        });
        
    } catch (error) {
        console.error('❌ Errore generale nell\'endpoint scraping Ipercoop:', error);
        
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
 * @route GET /api/ipercoop/status
 * @desc Ottiene lo stato dei volantini Ipercoop
 * @access Public
 */
router.get('/status', async (req, res) => {
    try {
        console.log('📊 DEBUG - Richiesta status volantini Ipercoop');
        
        // Conta i volantini Ipercoop nel database
        const totalCount = await Volantino.countDocuments({ source: 'ipercoop' });
        const activeCount = await Volantino.countDocuments({ 
            source: 'ipercoop',
            isActive: true 
        });
        
        // Trova il volantino più recente
        const latestFlyer = await Volantino.findOne({ source: 'ipercoop' })
            .sort({ createdAt: -1 })
            .select('store createdAt updatedAt')
            .lean();
        
        // Trova volantini per stato
        const byStatus = await Volantino.aggregate([
            { $match: { source: 'ipercoop' } },
            { $group: { _id: '$isActive', count: { $sum: 1 } } }
        ]);
        
        const statusCounts = {
            active: 0,
            inactive: 0
        };
        
        byStatus.forEach(item => {
            if (item._id === true) {
                statusCounts.active = item.count;
            } else {
                statusCounts.inactive = item.count;
            }
        });
        
        // Trova i volantini più recenti
        const recentFlyers = await Volantino.find({ source: 'ipercoop' })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('store location.city validFrom validTo pages category createdAt pdfUrl')
            .lean();
        
        console.log('📈 DEBUG - Statistiche Ipercoop:', {
            total: totalCount,
            active: activeCount,
            statusCounts
        });
        
        res.json({
            success: true,
            data: {
                total: totalCount,
                active: activeCount,
                inactive: totalCount - activeCount,
                latest: latestFlyer ? {
                    title: latestFlyer.store,
                    createdAt: latestFlyer.createdAt,
                    updatedAt: latestFlyer.updatedAt
                } : null,
                breakdown: statusCounts,
                recentFlyers: recentFlyers
            }
        });
        
    } catch (error) {
        console.error('❌ Errore nel recupero dello status Ipercoop:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel recupero dello status',
            details: error.message
        });
    }
});

/**
 * @route GET /api/ipercoop
 * @desc Ottiene tutti i volantini Ipercoop dal database
 * @access Public
 */
router.get('/', async (req, res) => {
    try {
        console.log('📋 DEBUG - Richiesta volantini Ipercoop');
        
        // Recupera tutti i volantini Ipercoop dal database
        const ipercoopFlyers = await Volantino.find({
            source: 'ipercoop'
        }).sort({ dataInizio: -1 });
        
        console.log(`📊 DEBUG - Trovati ${ipercoopFlyers.length} volantini Ipercoop`);
        
        res.json({
            success: true,
            data: ipercoopFlyers,
            count: ipercoopFlyers.length,
            message: `Trovati ${ipercoopFlyers.length} volantini Ipercoop`
        });
        
    } catch (error) {
        console.error('❌ Errore nel recupero volantini Ipercoop:', error);
        res.status(500).json({
            success: false,
            error: 'Errore nel recupero volantini Ipercoop',
            message: error.message
        });
    }
});

/**
 * @route DELETE /api/ipercoop/cleanup
 * @desc Rimuove i volantini Ipercoop scaduti e i file PDF associati
 * @access Public (con rate limiting)
 */
router.delete('/cleanup', scrapingRateLimit, async (req, res) => {
    try {
        console.log('🧹 DEBUG - Avvio cleanup volantini Ipercoop scaduti');
        
        const now = new Date();
        
        // Trova volantini scaduti
        const expiredFlyers = await Volantino.find({
            source: 'ipercoop',
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
                    const fullPath = path.resolve(flyer.pdfPath);
                    await fs.unlink(fullPath);
                    deletedFiles++;
                    console.log(`🗑️ DEBUG - File rimosso: ${fullPath}`);
                } catch (fileError) {
                    console.warn(`⚠️ Impossibile rimuovere file: ${flyer.pdfPath}`, fileError.message);
                    errors.push(`File ${flyer.pdfPath}: ${fileError.message}`);
                }
            }
        }
        
        // Rimuovi i volantini dal database
        const deleteResult = await Volantino.deleteMany({
            source: 'ipercoop',
            $or: [
                { validUntil: { $lt: now } },
                { isActive: false }
            ]
        });
        
        console.log(`✅ DEBUG - Cleanup completato: ${deleteResult.deletedCount} volantini rimossi, ${deletedFiles} file eliminati`);
        
        res.json({
            success: true,
            message: 'Cleanup completato',
            details: {
                deletedFlyers: deleteResult.deletedCount,
                deletedFiles,
                errors: errors.length > 0 ? errors : undefined
            }
        });
        
    } catch (error) {
        console.error('❌ Errore durante il cleanup Ipercoop:', error);
        res.status(500).json({
            success: false,
            error: 'Errore durante il cleanup',
            details: error.message
        });
    }
});

/**
 * @route DELETE /api/ipercoop/delete-all-pdfs
 * @desc Elimina tutti i PDF dei volantini Ipercoop (SOLO PER SVILUPPO)
 * @access Public (con rate limiting)
 */
router.delete('/delete-all-pdfs', scrapingRateLimit, async (req, res) => {
    try {
        console.log('🗑️ DEBUG - Eliminazione di tutti i PDF Ipercoop');
        
        // Trova tutti i volantini Ipercoop con PDF
        const flyersWithPdfs = await Volantino.find({
            source: 'ipercoop',
            pdfPath: { $exists: true, $ne: null }
        });
        
        console.log(`📋 DEBUG - Trovati ${flyersWithPdfs.length} volantini con PDF da eliminare`);
        
        let deletedFiles = 0;
        let errors = [];
        
        // Elimina i file PDF
        for (const flyer of flyersWithPdfs) {
            try {
                const fullPath = path.resolve(flyer.pdfPath);
                await fs.unlink(fullPath);
                deletedFiles++;
                console.log(`🗑️ DEBUG - PDF eliminato: ${fullPath}`);
            } catch (fileError) {
                console.warn(`⚠️ Impossibile eliminare PDF: ${flyer.pdfPath}`, fileError.message);
                errors.push(`File ${flyer.pdfPath}: ${fileError.message}`);
            }
        }
        
        // Rimuovi tutti i volantini Ipercoop dal database
        const deleteResult = await Volantino.deleteMany({ source: 'ipercoop' });
        
        console.log(`✅ DEBUG - Eliminazione completata: ${deleteResult.deletedCount} volantini rimossi, ${deletedFiles} PDF eliminati`);
        
        res.json({
            success: true,
            message: 'Tutti i PDF Ipercoop sono stati eliminati',
            details: {
                deletedFlyers: deleteResult.deletedCount,
                deletedFiles,
                errors: errors.length > 0 ? errors : undefined
            }
        });
        
    } catch (error) {
        console.error('❌ Errore durante l\'eliminazione dei PDF Ipercoop:', error);
        res.status(500).json({
            success: false,
            error: 'Errore durante l\'eliminazione',
            details: error.message
        });
    }
});

/**
 * @route POST /api/ipercoop/upload
 * @desc Upload di un volantino Ipercoop
 * @access Public
 */
router.post('/upload', async (req, res) => {
    console.log('📤 DEBUG - Endpoint upload Ipercoop chiamato');
    console.log('📋 DEBUG - Request body:', req.body);
    
    try {
        const { filename, store_name, store_type, location, valid_from, valid_until, pdf_url, pdf_path } = req.body;
        
        // Validazione dei campi obbligatori
        if (!filename || !store_name) {
            return res.status(400).json({
                success: false,
                error: 'Campi obbligatori mancanti: filename, store_name'
            });
        }
        
        // Prepara le date di validità (default: oggi + 30 giorni)
        const validFrom = valid_from ? new Date(valid_from) : new Date();
        const validTo = valid_until ? new Date(valid_until) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        
        // Crea un nuovo volantino nel database
        const volantino = new Volantino({
            store: store_name,
            location: {
                address: 'Via Roma, 1',
                city: 'Roma',
                cap: location || '00100',
                coordinates: {
                    lat: 41.9028,
                    lng: 12.4964
                }
            },
            validFrom: validFrom,
            validTo: validTo,
            pages: 8, // Default per volantini Ipercoop
            category: 'Supermercato',
            pdfUrl: pdf_url || '',
            pdfPath: pdf_path || '', // Percorso locale del file PDF
            fileSize: '10 MB', // Default, può essere migliorato
            metadata: {
                originalFileName: filename,
                source: 'ipercoop',
                uploadDate: new Date()
            },
            source: 'ipercoop'
        });
        
        await volantino.save();
        
        console.log(`✅ Volantino Ipercoop salvato nel database: ${filename}`);
        
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
        console.error('❌ Errore durante l\'upload del volantino Ipercoop:', error);
        res.status(500).json({
            success: false,
            error: 'Errore durante l\'upload',
            details: error.message
        });
    }
});

module.exports = router;