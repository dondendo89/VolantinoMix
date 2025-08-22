const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const Volantino = require('../models/Volantino');
const PDFService = require('./pdfService');

class JobScheduler {
    constructor() {
        this.jobs = new Map();
        this.isInitialized = false;
    }

    /**
     * Inizializza il sistema di job scheduling
     */
    init() {
        if (this.isInitialized) {
            console.log('⚠️ JobScheduler già inizializzato');
            return;
        }

        console.log('🕐 Inizializzazione JobScheduler...');
        
        // Job per scraping Decò - ogni lunedì alle 08:00
        this.scheduleDecoScraping();
        
        // Job per scraping Eurospin - ogni martedì alle 08:00
        this.scheduleEurospinScraping();
        
        // Job per cleanup volantini scaduti - ogni domenica alle 02:00
        this.scheduleCleanup();
        
        // Job per controllo volantini scaduti - ogni giorno alle 09:00
        this.scheduleExpiredCheck();
        
        // Job per pulizia file PDF temporanei - ogni giorno alle 03:00
        this.schedulePDFCleanup();
        
        this.isInitialized = true;
        console.log('✅ JobScheduler inizializzato con successo');
    }

    /**
     * Programma lo scraping automatico dei volantini Decò
     * Esegue ogni lunedì alle 08:00 (quando tipicamente escono nuove offerte)
     */
    scheduleDecoScraping() {
        const jobName = 'deco-scraping';
        
        // Cron: ogni lunedì alle 08:00
        const cronExpression = '0 8 * * 1';
        
        const task = cron.schedule(cronExpression, async () => {
            console.log('🏪 [CRON] Avvio scraping automatico Decò...');
            
            try {
                await this.executeDecoScraping();
            } catch (error) {
                console.error('❌ [CRON] Errore durante scraping Decò:', error);
            }
        }, {
            scheduled: false,
            timezone: 'Europe/Rome'
        });
        
        this.jobs.set(jobName, {
            task,
            cronExpression,
            description: 'Scraping automatico volantini Decò ogni lunedì',
            lastRun: null,
            nextRun: null
        });
        
        task.start();
        console.log(`📅 Job '${jobName}' programmato: ${cronExpression}`);
    }

    /**
     * Programma lo scraping automatico dei volantini Eurospin
     * Esegue ogni martedì alle 08:00 (quando tipicamente escono nuove offerte)
     */
    scheduleEurospinScraping() {
        const jobName = 'eurospin-scraping';
        
        // Cron: ogni martedì alle 08:00
        const cronExpression = '0 8 * * 2';
        
        const task = cron.schedule(cronExpression, async () => {
            console.log('🛒 [CRON] Avvio scraping automatico Eurospin...');
            
            try {
                await this.executeEurospinScraping();
            } catch (error) {
                console.error('❌ [CRON] Errore durante scraping Eurospin:', error);
            }
        }, {
            scheduled: false,
            timezone: 'Europe/Rome'
        });
        
        this.jobs.set(jobName, {
            task,
            cronExpression,
            description: 'Scraping automatico volantini Eurospin ogni martedì',
            lastRun: null,
            nextRun: null
        });
        
        task.start();
        console.log(`📅 Job '${jobName}' programmato: ${cronExpression}`);
    }

    /**
     * Programma il cleanup automatico dei volantini scaduti
     * Esegue ogni domenica alle 02:00
     */
    scheduleCleanup() {
        const jobName = 'cleanup-expired';
        
        // Cron: ogni domenica alle 02:00
        const cronExpression = '0 2 * * 0';
        
        const task = cron.schedule(cronExpression, async () => {
            console.log('🧹 [CRON] Avvio cleanup volantini scaduti...');
            
            try {
                await this.executeCleanup();
            } catch (error) {
                console.error('❌ [CRON] Errore durante cleanup:', error);
            }
        }, {
            scheduled: false,
            timezone: 'Europe/Rome'
        });
        
        this.jobs.set(jobName, {
            task,
            cronExpression,
            description: 'Cleanup volantini scaduti ogni domenica',
            lastRun: null,
            nextRun: null
        });
        
        task.start();
        console.log(`📅 Job '${jobName}' programmato: ${cronExpression}`);
    }

    /**
     * Programma il controllo giornaliero dei volantini scaduti
     * Esegue ogni giorno alle 09:00 per verificare se ci sono offerte scadute
     */
    scheduleExpiredCheck() {
        const jobName = 'expired-check';
        
        // Cron: ogni giorno alle 09:00
        const cronExpression = '0 9 * * *';
        
        const task = cron.schedule(cronExpression, async () => {
            console.log('🔍 [CRON] Controllo volantini scaduti...');
            
            try {
                await this.checkExpiredFlyers();
            } catch (error) {
                console.error('❌ [CRON] Errore durante controllo scaduti:', error);
            }
        }, {
            scheduled: false,
            timezone: 'Europe/Rome'
        });
        
        this.jobs.set(jobName, {
            task,
            cronExpression,
            description: 'Controllo giornaliero volantini scaduti',
            lastRun: null,
            nextRun: null
        });
        
        task.start();
        console.log(`📅 Job '${jobName}' programmato: ${cronExpression}`);
    }

    /**
     * Programma la pulizia automatica dei file PDF temporanei
     * Esegue ogni giorno alle 03:00 per eliminare file più vecchi di 24 ore
     */
    schedulePDFCleanup() {
        const jobName = 'pdf-cleanup';
        
        // Cron: ogni giorno alle 03:00
        const cronExpression = '0 3 * * *';
        
        const task = cron.schedule(cronExpression, async () => {
            console.log('🗑️ [CRON] Avvio pulizia file PDF temporanei...');
            
            try {
                await this.executePDFCleanup();
            } catch (error) {
                console.error('❌ [CRON] Errore durante pulizia PDF:', error);
            }
        }, {
            scheduled: false,
            timezone: 'Europe/Rome'
        });
        
        this.jobs.set(jobName, {
            task,
            cronExpression,
            description: 'Pulizia file PDF temporanei ogni giorno',
            lastRun: null,
            nextRun: null
        });
        
        task.start();
        console.log(`📅 Job '${jobName}' programmato: ${cronExpression}`);
    }

    /**
     * Esegue lo scraping automatico dei volantini Decò
     */
    async executeDecoScraping() {
        return new Promise((resolve, reject) => {
            console.log('🚀 [SCRAPING] Avvio script scraper_deco.py...');
            
            const scriptPath = path.join(__dirname, '../../scraper_deco.py');
            // Auto-detect API URL based on environment
            const port = process.env.PORT || '3000';
            const apiUrl = `http://localhost:${port}/api`;
            const args = [
                scriptPath,
                '--folder', 'volantini_deco',
                '--api', apiUrl
            ];
            
            const pythonProcess = spawn('python3', args, {
                cwd: path.join(__dirname, '../..'),
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
                console.log('📄 [SCRAPING]', data.toString().trim());
            });
            
            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
                console.log('🚨 [SCRAPING ERROR]', data.toString().trim());
            });
            
            pythonProcess.on('close', (code) => {
                const jobInfo = this.jobs.get('deco-scraping');
                if (jobInfo) {
                    jobInfo.lastRun = new Date();
                }
                
                if (code === 0) {
                    console.log('✅ [SCRAPING] Scraping Decò completato con successo');
                    resolve({ success: true, output: stdout });
                } else {
                    console.log('❌ [SCRAPING] Scraping Decò fallito:', { code, stderr });
                    reject(new Error(`Scraping fallito con codice ${code}: ${stderr}`));
                }
            });
            
            pythonProcess.on('error', (error) => {
                console.error('❌ [SCRAPING] Errore avvio processo:', error);
                reject(error);
            });
        });
    }

    /**
     * Esegue lo scraping dei volantini Eurospin
     */
    async executeEurospinScraping() {
        return new Promise((resolve, reject) => {
            console.log('🚀 [SCRAPING] Avvio script scraper_eurospin.py...');
            
            const scriptPath = path.join(__dirname, '../../scraper_eurospin.py');
            const args = [scriptPath];
            
            const pythonProcess = spawn('python3', args, {
                cwd: path.join(__dirname, '../..'),
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
                console.log('📄 [SCRAPING]', data.toString().trim());
            });
            
            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
                console.log('🚨 [SCRAPING ERROR]', data.toString().trim());
            });
            
            pythonProcess.on('close', (code) => {
                const jobInfo = this.jobs.get('eurospin-scraping');
                if (jobInfo) {
                    jobInfo.lastRun = new Date();
                }
                
                if (code === 0) {
                    console.log('✅ [SCRAPING] Scraping Eurospin completato con successo');
                    resolve({ success: true, output: stdout });
                } else {
                    console.log('❌ [SCRAPING] Scraping Eurospin fallito:', { code, stderr });
                    reject(new Error(`Scraping fallito con codice ${code}: ${stderr}`));
                }
            });
            
            pythonProcess.on('error', (error) => {
                console.error('❌ [SCRAPING] Errore avvio processo:', error);
                reject(error);
            });
        });
    }

    /**
     * Esegue il cleanup dei volantini scaduti
     */
    async executeCleanup() {
        console.log('🧹 [CLEANUP] Avvio cleanup volantini scaduti...');
        
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        // Trova e rimuovi volantini scaduti
        const expiredFlyers = await Volantino.find({
            createdAt: { $lt: thirtyDaysAgo }
        });
        
        console.log(`🗑️ [CLEANUP] Trovati ${expiredFlyers.length} volantini scaduti`);
        
        // Rimuovi dal database
        const deleteResult = await Volantino.deleteMany({
            createdAt: { $lt: thirtyDaysAgo }
        });
        
        const jobInfo = this.jobs.get('cleanup-expired');
        if (jobInfo) {
            jobInfo.lastRun = new Date();
        }
        
        console.log(`✅ [CLEANUP] Rimossi ${deleteResult.deletedCount} volantini scaduti`);
        
        return {
            deleted: deleteResult.deletedCount,
            cutoffDate: thirtyDaysAgo
        };
    }

    /**
     * Esegue la pulizia dei file PDF temporanei
     */
    async executePDFCleanup() {
        console.log('🗑️ [PDF-CLEANUP] Avvio pulizia file PDF temporanei...');
        
        try {
            const result = await PDFService.cleanupTempFiles(24); // 24 ore
            
            const jobInfo = this.jobs.get('pdf-cleanup');
            if (jobInfo) {
                jobInfo.lastRun = new Date();
            }
            
            console.log(`✅ [PDF-CLEANUP] Eliminati ${result.deletedCount} file PDF temporanei`);
            
            return {
                deleted: result.deletedCount,
                maxAge: '24 ore'
            };
            
        } catch (error) {
            console.error('❌ [PDF-CLEANUP] Errore durante pulizia PDF:', error);
            throw error;
        }
    }

    /**
     * Controlla se ci sono volantini scaduti e attiva lo scraping se necessario
     */
    async checkExpiredFlyers() {
        console.log('🔍 [CHECK] Controllo volantini scaduti...');
        
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        // Controlla volantini Decò più vecchi di 7 giorni
        const oldDecoFlyers = await Volantino.countDocuments({
            store: { $regex: /decò/i },
            createdAt: { $lt: sevenDaysAgo }
        });
        
        // Controlla se ci sono volantini Decò recenti (ultimi 3 giorni)
        const recentDecoFlyers = await Volantino.countDocuments({
            store: { $regex: /decò/i },
            createdAt: { $gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
        });
        
        console.log(`📊 [CHECK] Volantini Decò: ${oldDecoFlyers} vecchi, ${recentDecoFlyers} recenti`);
        
        const jobInfo = this.jobs.get('expired-check');
        if (jobInfo) {
            jobInfo.lastRun = new Date();
        }
        
        // Se ci sono volantini vecchi ma nessuno recente, attiva lo scraping
        if (oldDecoFlyers > 0 && recentDecoFlyers === 0) {
            console.log('🚨 [CHECK] Volantini Decò scaduti rilevati, avvio scraping...');
            
            try {
                await this.executeDecoScraping();
                console.log('✅ [CHECK] Scraping automatico completato');
            } catch (error) {
                console.error('❌ [CHECK] Errore durante scraping automatico:', error);
            }
        } else {
            console.log('✅ [CHECK] Volantini Decò aggiornati, nessun scraping necessario');
        }
        
        return {
            oldFlyers: oldDecoFlyers,
            recentFlyers: recentDecoFlyers,
            scrapingTriggered: oldDecoFlyers > 0 && recentDecoFlyers === 0
        };
    }

    /**
     * Ottiene lo stato di tutti i job programmati
     */
    getJobsStatus() {
        const status = {};
        
        for (const [name, jobInfo] of this.jobs) {
            status[name] = {
                description: jobInfo.description,
                cronExpression: jobInfo.cronExpression,
                isRunning: jobInfo.task.getStatus() === 'scheduled',
                lastRun: jobInfo.lastRun,
                nextRun: jobInfo.task.nextDate()?.toDate() || null
            };
        }
        
        return status;
    }

    /**
     * Avvia un job manualmente
     */
    async runJobManually(jobName) {
        console.log(`🔧 [MANUAL] Esecuzione manuale job: ${jobName}`);
        
        try {
            switch (jobName) {
                case 'deco-scraping':
                    return await this.executeDecoScraping();
                case 'eurospin-scraping':
                    return await this.executeEurospinScraping();
                case 'cleanup-expired':
                    return await this.executeCleanup();
                case 'pdf-cleanup':
                    return await this.executePDFCleanup();
                case 'expired-check':
                    return await this.checkExpiredFlyers();
                default:
                    throw new Error(`Job '${jobName}' non riconosciuto`);
            }
        } catch (error) {
            console.error(`❌ Errore esecuzione manuale job ${jobName}:`, error);
            throw error;
        }
    }

    /**
     * Ferma tutti i job
     */
    stopAllJobs() {
        console.log('🛑 Arresto di tutti i job...');
        
        for (const [name, jobInfo] of this.jobs) {
            jobInfo.task.stop();
            console.log(`🛑 Job '${name}' fermato`);
        }
        
        this.jobs = new Map();
        this.isInitialized = false;
        console.log('✅ Tutti i job sono stati fermati');
    }

    /**
     * Riavvia tutti i job
     */
    restartAllJobs() {
        console.log('🔄 Riavvio di tutti i job...');
        this.stopAllJobs();
        this.init();
        console.log('✅ Tutti i job sono stati riavviati');
    }
}

// Singleton instance
const jobScheduler = new JobScheduler();

module.exports = jobScheduler;