const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const jobScheduler = require('../services/jobScheduler');

// Rate limiting per le operazioni sui job
const jobRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 ora
    max: 10, // massimo 10 operazioni sui job per IP per ora
    message: {
        error: 'Troppe operazioni sui job, riprova tra 1 ora',
        code: 'JOB_RATE_LIMIT_EXCEEDED'
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

// Applica rate limiting a tutte le route
router.use(jobRateLimit);

/**
 * @route GET /api/jobs/status
 * @desc Ottiene lo stato di tutti i job programmati
 * @access Public
 */
router.get('/status', async (req, res) => {
    try {
        console.log('📊 DEBUG - Richiesta status job');
        
        const jobsStatus = jobScheduler.getJobsStatus();
        
        res.json({
            success: true,
            data: {
                jobs: jobsStatus,
                totalJobs: Object.keys(jobsStatus).length,
                isSchedulerActive: jobScheduler.isInitialized
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ DEBUG - Errore ottenendo status job:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: error.message
        });
    }
});

/**
 * @route POST /api/jobs/run/:jobName
 * @desc Esegue manualmente un job specifico
 * @access Public (con rate limiting)
 */
router.post('/run/:jobName', [
    body('force').optional().isBoolean().withMessage('force deve essere boolean')
], handleValidationErrors, async (req, res) => {
    try {
        const { jobName } = req.params;
        const { force = false } = req.body;
        
        console.log(`🔧 DEBUG - Esecuzione manuale job: ${jobName}`);
        
        // Verifica che il job esista
        const validJobs = ['deco-scraping', 'eurospin-scraping', 'cleanup-expired', 'expired-check'];
        if (!validJobs.includes(jobName)) {
            return res.status(400).json({
                success: false,
                error: 'Job non valido',
                message: `Job '${jobName}' non trovato. Job disponibili: ${validJobs.join(', ')}`,
                availableJobs: validJobs
            });
        }
        
        // Esegui il job
        const result = await jobScheduler.runJobManually(jobName);
        
        console.log(`✅ DEBUG - Job '${jobName}' completato:`, result);
        
        res.json({
            success: true,
            message: `Job '${jobName}' eseguito con successo`,
            jobName,
            result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error(`❌ DEBUG - Errore esecuzione job ${req.params.jobName}:`, error);
        res.status(500).json({
            success: false,
            error: 'Errore durante esecuzione job',
            message: error.message,
            jobName: req.params.jobName
        });
    }
});

/**
 * @route POST /api/jobs/restart
 * @desc Riavvia tutti i job programmati
 * @access Public (con rate limiting)
 */
router.post('/restart', async (req, res) => {
    try {
        console.log('🔄 DEBUG - Riavvio tutti i job');
        
        jobScheduler.restartAllJobs();
        
        const jobsStatus = jobScheduler.getJobsStatus();
        
        res.json({
            success: true,
            message: 'Tutti i job sono stati riavviati',
            jobs: jobsStatus,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ DEBUG - Errore riavvio job:', error);
        res.status(500).json({
            success: false,
            error: 'Errore durante riavvio job',
            message: error.message
        });
    }
});

/**
 * @route POST /api/jobs/stop
 * @desc Ferma tutti i job programmati
 * @access Public (con rate limiting)
 */
router.post('/stop', async (req, res) => {
    try {
        console.log('🛑 DEBUG - Arresto tutti i job');
        
        jobScheduler.stopAllJobs();
        
        res.json({
            success: true,
            message: 'Tutti i job sono stati fermati',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ DEBUG - Errore arresto job:', error);
        res.status(500).json({
            success: false,
            error: 'Errore durante arresto job',
            message: error.message
        });
    }
});

/**
 * @route GET /api/jobs/schedule
 * @desc Ottiene informazioni dettagliate sui programmi dei job
 * @access Public
 */
router.get('/schedule', async (req, res) => {
    try {
        console.log('📅 DEBUG - Richiesta programmi job');
        
        const jobsStatus = jobScheduler.getJobsStatus();
        
        // Aggiungi informazioni sui prossimi run
        const scheduleInfo = {};
        for (const [jobName, jobInfo] of Object.entries(jobsStatus)) {
            scheduleInfo[jobName] = {
                ...jobInfo,
                cronDescription: this.getCronDescription(jobInfo.cronExpression),
                timeUntilNext: jobInfo.nextRun ? 
                    Math.max(0, new Date(jobInfo.nextRun).getTime() - Date.now()) : null
            };
        }
        
        res.json({
            success: true,
            data: {
                schedule: scheduleInfo,
                timezone: 'Europe/Rome',
                currentTime: new Date().toISOString()
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ DEBUG - Errore ottenendo programmi job:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: error.message
        });
    }
});

/**
 * Converte espressione cron in descrizione leggibile
 */
function getCronDescription(cronExpression) {
    const descriptions = {
        '0 8 * * 1': 'Ogni lunedì alle 08:00',
        '0 2 * * 0': 'Ogni domenica alle 02:00',
        '0 9 * * *': 'Ogni giorno alle 09:00'
    };
    
    return descriptions[cronExpression] || `Cron: ${cronExpression}`;
}

module.exports = router;