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
 * @route POST /api/mersi/scrape
 * @desc Avvia lo scraping dei volantini MerSi
 * @access Public (con rate limiting)
 */
router.post('/scrape', scrapingRateLimit, [
    body('force').optional().isBoolean().withMessage('force deve essere boolean'),
    body('downloadFolder').optional().isString().withMessage('downloadFolder deve essere una stringa'),
    body('apiUrl').optional().isURL().withMessage('apiUrl deve essere un URL valido')
], handleValidationErrors, async (req, res) => {
    console.log('🏪 DEBUG - Endpoint scraping MerSi chiamato');
    console.log('📋 DEBUG - Request body:', req.body);
    
    try {
        const { force = false, downloadFolder = 'volantini/mersi', apiUrl = 'http://localhost:5000/api' } = req.body;
        
        // Path dello script Python
        const scriptPath = path.join(__dirname, '../../scraper_mersi.py');
        
        // Verifica che lo script esista
        try {
            await fs.access(scriptPath);
        } catch (error) {
            console.log('❌ DEBUG - Script scraper_mersi.py non trovato:', scriptPath);
            return res.status(500).json({
                success: false,
                error: 'Script di scraping non trovato',
                message: 'Il file scraper_mersi.py non è presente nel sistema',
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
            // Controlla se ci sono già volantini MerSi recenti (ultimi 7 giorni)
            const recentFlyers = await Volantino.find({
                source: 'mersi',
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            }).countDocuments();
            
            if (recentFlyers > 0) {
                console.log(`⏭️ DEBUG - Trovati ${recentFlyers} volantini MerSi recenti, skip scraping`);
                return res.json({
                    success: true,
                    message: 'Scraping saltato: volantini MerSi già aggiornati di recente',
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
                const statsMatch = stdout.match(/📊 RIEPILOGO SCRAPING MERSI[\s\S]*?🌐 API endpoint: (.+)/m);
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
            message: 'Scraping MerSi avviato in background',
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
 * @route GET /api/mersi/status
 * @desc Ottiene lo stato dei volantini MerSi nel database
 * @access Public
 */
router.get('/status', async (req, res) => {
    try {
        console.log('📊 DEBUG - Richiesta status volantini MerSi');
        
        // Conta i volantini MerSi per tipo
        const mersiStats = await Volantino.aggregate([
            {
                $match: {
                    store: { $regex: /mersi/i }
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
        
        // Volantini MerSi più recenti
        const recentFlyers = await Volantino.find({
            store: { $regex: /mersi/i }
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('store category location.cap createdAt filename fileSize');
        
        // Statistiche generali
        const totalMersi = await Volantino.countDocuments({
            store: { $regex: /mersi/i }
        });
        
        const lastWeekMersi = await Volantino.countDocuments({
            store: { $regex: /mersi/i },
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        });
        
        res.json({
            success: true,
            data: {
                totalFlyers: totalMersi,
                lastWeekFlyers: lastWeekMersi,
                storeBreakdown: mersiStats,
                recentFlyers,
                lastUpdate: mersiStats.length > 0 ? Math.max(...mersiStats.map(s => new Date(s.lastUpdate))) : null
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ DEBUG - Errore ottenendo status MerSi:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: error.message
        });
    }
});

module.exports = router;