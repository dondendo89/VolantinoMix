const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Middleware per gestire errori di validazione
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Dati non validi',
            details: errors.array()
        });
    }
    next();
};

// POST /api/import/all - Importa tutti i volantini da tutte le fonti
router.post('/all', [
    body('sources').optional().isArray().withMessage('Sources deve essere un array'),
    body('skipDuplicates').optional().isBoolean().withMessage('skipDuplicates deve essere boolean'),
    body('dryRun').optional().isBoolean().withMessage('dryRun deve essere boolean')
], handleValidationErrors, async (req, res) => {
    try {
        const {
            sources = ['deco', 'eurospin', 'ipercoop', 'mersi', 'integrazione'],
            skipDuplicates = true,
            dryRun = false
        } = req.body;

        console.log('🚀 Avvio importazione completa volantini...');
        console.log(`📋 Fonti selezionate: ${sources.join(', ')}`);
        console.log(`⚠️ Salta duplicati: ${skipDuplicates}`);
        console.log(`🧪 Dry run: ${dryRun}`);

        const results = {
            success: true,
            totalProcessed: 0,
            totalCreated: 0,
            totalDuplicatesSkipped: 0,
            totalErrors: 0,
            sources: {},
            startTime: new Date(),
            endTime: null,
            duration: null
        };

        // Percorso base del progetto (dove sono gli script Python)
        // In locale usa la cartella parent, in produzione usa la directory corrente
        const isLocal = __dirname.includes('/Users/') || __dirname.includes('/home/');
        const projectRoot = isLocal ? path.join(__dirname, '..') : __dirname.replace('/routes', '');

        // Configurazione script per ogni fonte
        const scriptConfigs = {
            deco: {
                script: 'scraper_deco.py',
                name: 'Deco Scraper',
                description: 'Scraping volantini Deco'
            },
            eurospin: {
                script: 'scraper_eurospin.py',
                name: 'Eurospin Scraper',
                description: 'Scraping volantini Eurospin'
            },
            ipercoop: {
                script: 'scraper_ipercoop.py',
                name: 'Ipercoop Scraper',
                description: 'Scraping volantini Ipercoop'
            },
            mersi: {
                script: 'scraper_mersi.py',
                name: 'Mersi Scraper',
                description: 'Scraping volantini Mersi'
            },
            eurospin_site: {
                script: 'scraper_eurospin_site.py',
                name: 'Eurospin Site Scraper',
                description: 'Scraping PDF dal sito Eurospin'
            },
            lidl_site: {
                script: 'scraper_lidl_site.py',
                name: 'Lidl Site Scraper',
                description: 'Scraping PDF dal sito Lidl'
            },
            md_site: {
                script: 'scraper_md_site.py',
                name: 'MD Site Scraper',
                description: 'Scraping PDF dal sito MD'
            },
            integrazione: {
                script: 'integrazione_volantini.py',
                name: 'Integrazione Volantini',
                description: 'Integrazione volantini da cartella locale'
            }
        };

        // Funzione per eseguire uno script Python
        const runScript = (scriptName, sourceName) => {
            return new Promise((resolve, reject) => {
                const scriptPath = path.join(projectRoot, scriptName);
                
                // Verifica che lo script esista
                if (!fs.existsSync(scriptPath)) {
                    reject(new Error(`Script ${scriptName} non trovato`));
                    return;
                }

                console.log(`🔄 Avvio ${sourceName}: ${scriptName}`);
                
                const pythonProcess = spawn('python3', [scriptPath], {
                    cwd: projectRoot,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                let stdout = '';
                let stderr = '';

                pythonProcess.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                pythonProcess.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                pythonProcess.on('close', (code) => {
                    if (code === 0) {
                        console.log(`✅ ${sourceName} completato con successo`);
                        
                        // Estrai statistiche dall'output
                        const stats = extractStatsFromOutput(stdout, sourceName);
                        resolve(stats);
                    } else {
                        console.error(`❌ ${sourceName} fallito con codice ${code}`);
                        console.error(`Stderr: ${stderr}`);
                        reject(new Error(`${sourceName} fallito: ${stderr || 'Errore sconosciuto'}`));
                    }
                });

                pythonProcess.on('error', (error) => {
                    console.error(`💥 Errore nell'esecuzione di ${sourceName}:`, error);
                    reject(error);
                });
            });
        };

        // Funzione per estrarre statistiche dall'output
        const extractStatsFromOutput = (output, sourceName) => {
            const stats = {
                source: sourceName,
                processed: 0,
                created: 0,
                duplicatesSkipped: 0,
                errors: 0,
                success: true
            };

            try {
                // Cerca pattern comuni negli output degli scraper
                const patterns = {
                    processed: /(?:PDF trovati|volantini trovati|file trovati):\s*(\d+)/i,
                    created: /(?:PDF caricati|volantini caricati|caricati con successo):\s*(\d+)/i,
                    duplicatesSkipped: /(?:duplicati saltati|saltati):\s*(\d+)/i,
                    errors: /(?:errori|failed|falliti):\s*(\d+)/i
                };

                Object.keys(patterns).forEach(key => {
                    const match = output.match(patterns[key]);
                    if (match) {
                        stats[key] = parseInt(match[1]) || 0;
                    }
                });

                // Evita fallback su numeri arbitrari nell'output (es. anni/versioni)
                // Se i pattern non coincidono, lascia i valori a 0 e delega il conteggio al chiamante
            } catch (error) {
                console.warn(`⚠️ Impossibile estrarre statistiche per ${sourceName}:`, error.message);
            }

            return stats;
        };

        // Esegui gli script in sequenza
        for (const source of sources) {
            if (!scriptConfigs[source]) {
                console.warn(`⚠️ Fonte sconosciuta: ${source}`);
                continue;
            }

            const config = scriptConfigs[source];
            
            try {
                if (dryRun) {
                    console.log(`🧪 [DRY RUN] Simulazione ${config.name}`);
                    results.sources[source] = {
                        source: source,
                        processed: 0,
                        created: 0,
                        duplicatesSkipped: 0,
                        errors: 0,
                        success: true,
                        dryRun: true
                    };
                } else {
                    const stats = await runScript(config.script, config.name);
                    results.sources[source] = stats;
                    
                    // Aggiorna totali
                    results.totalProcessed += stats.processed;
                    results.totalCreated += stats.created;
                    results.totalDuplicatesSkipped += stats.duplicatesSkipped;
                    results.totalErrors += stats.errors;
                }
            } catch (error) {
                console.error(`❌ Errore durante l'esecuzione di ${config.name}:`, error.message);
                results.sources[source] = {
                    source: source,
                    processed: 0,
                    created: 0,
                    duplicatesSkipped: 0,
                    errors: 1,
                    success: false,
                    error: error.message
                };
                results.totalErrors += 1;
            }
        }

        // Calcola durata
        results.endTime = new Date();
        results.duration = Math.round((results.endTime - results.startTime) / 1000);

        // Determina successo generale
        const hasErrors = Object.values(results.sources).some(s => !s.success);
        results.success = !hasErrors;

        console.log('\n' + '='.repeat(60));
        console.log('📊 RIEPILOGO IMPORTAZIONE COMPLETA');
        console.log('='.repeat(60));
        console.log(`⏱️ Durata: ${results.duration} secondi`);
        console.log(`📁 Fonti processate: ${Object.keys(results.sources).length}`);
        console.log(`🔍 Volantini processati: ${results.totalProcessed}`);
        console.log(`✅ Volantini creati: ${results.totalCreated}`);
        console.log(`⚠️ Duplicati saltati: ${results.totalDuplicatesSkipped}`);
        console.log(`❌ Errori: ${results.totalErrors}`);
        console.log(`🎯 Successo generale: ${results.success ? 'SÌ' : 'NO'}`);
        console.log('='.repeat(60));

        // Dettagli per fonte
        Object.entries(results.sources).forEach(([source, stats]) => {
            const status = stats.success ? '✅' : '❌';
            console.log(`${status} ${source.toUpperCase()}: ${stats.created} creati, ${stats.duplicatesSkipped} duplicati, ${stats.errors} errori`);
        });

        res.json(results);

    } catch (error) {
        console.error('💥 Errore durante l\'importazione completa:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: error.message,
            totalProcessed: 0,
            totalCreated: 0,
            totalDuplicatesSkipped: 0,
            totalErrors: 1
        });
    }
});

// GET /api/import/status - Stato degli script di importazione
// Temporary debug endpoint to list files
router.get('/debug-files', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const checkDir = (dirPath) => {
      try {
        const files = fs.readdirSync(dirPath);
        return {
          exists: true,
          files: files.filter(f => f.endsWith('.py')),
          allFiles: files
        };
      } catch (err) {
        return { exists: false, error: err.message };
      }
    };
    
    res.json({
      success: true,
      directories: {
        '/': checkDir('/'),
        '/app': checkDir('/app'),
        cwd: checkDir(process.cwd()),
        __dirname: checkDir(__dirname)
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        __dirname,
        cwd: process.cwd()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/status', async (req, res) => {
    try {
        // Usa la stessa logica del percorso dell'endpoint /all
        // In produzione usa sempre la working directory corrente
        const isLocal = __dirname.includes('/Users/') || __dirname.includes('/home/');
        const projectRoot = isLocal ? path.join(__dirname, '..') : __dirname.replace('/routes', '');
        
        const scripts = [
            'scraper_deco.py',
            'scraper_eurospin.py',
            'scraper_ipercoop.py',
            'integrazione_volantini.py'
        ];

        const status = {
            success: true,
            scripts: {},
            projectRoot,
            environment: {
                NODE_ENV: process.env.NODE_ENV,
                __dirname: __dirname,
                cwd: process.cwd()
            },
            debug: {
                __dirname,
                isLocal,
                condition: `__dirname.includes('/Users/') || __dirname.includes('/home/')`
            }
        };

        scripts.forEach(script => {
            const scriptPath = path.join(projectRoot, script);
            const exists = fs.existsSync(scriptPath);
            
            status.scripts[script] = {
                exists,
                path: scriptPath,
                readable: exists ? fs.access ? true : false : false
            };
        });

        res.json(status);

    } catch (error) {
        console.error('Errore nel controllo stato script:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: error.message
        });
    }
});

// POST /api/import/source - Importa da una singola fonte
router.post('/source/:sourceName', [
    body('dryRun').optional().isBoolean().withMessage('dryRun deve essere boolean')
], handleValidationErrors, async (req, res) => {
    try {
        const { sourceName } = req.params;
        const { dryRun = false } = req.body;

        const scriptConfigs = {
            deco: 'scraper_deco.py',
            eurospin: 'scraper_eurospin.py',
            ipercoop: 'scraper_ipercoop.py',
            mersi: 'scraper_mersi.py',
            integrazione: 'integrazione_volantini.py'
        };

        if (!scriptConfigs[sourceName]) {
            return res.status(400).json({
                success: false,
                error: 'Fonte non valida',
                message: `Fonte '${sourceName}' non supportata. Fonti disponibili: ${Object.keys(scriptConfigs).join(', ')}`
            });
        }

        const scriptName = scriptConfigs[sourceName];
        const isLocal = __dirname.includes('/Users/') || __dirname.includes('/home/');
        const projectRoot = isLocal ? path.join(__dirname, '..') : __dirname.replace('/routes', '');
        const scriptPath = path.join(projectRoot, scriptName);

        if (!fs.existsSync(scriptPath)) {
            return res.status(404).json({
                success: false,
                error: 'Script non trovato',
                message: `Script ${scriptName} non trovato in ${scriptPath}`
            });
        }

        if (dryRun) {
            return res.json({
                success: true,
                dryRun: true,
                source: sourceName,
                script: scriptName,
                message: `Dry run per ${sourceName} - script ${scriptName} pronto per l'esecuzione`
            });
        }

        // Esegui lo script
        const pythonProcess = spawn('python3', [scriptPath], {
            cwd: projectRoot,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                res.json({
                    success: true,
                    source: sourceName,
                    script: scriptName,
                    exitCode: code,
                    output: output.slice(-1000), // Ultimi 1000 caratteri
                    message: `Importazione da ${sourceName} completata con successo`
                });
            } else {
                res.status(500).json({
                    success: false,
                    source: sourceName,
                    script: scriptName,
                    exitCode: code,
                    output: output.slice(-1000),
                    error: errorOutput.slice(-1000),
                    message: `Importazione da ${sourceName} fallita`
                });
            }
        });

        pythonProcess.on('error', (error) => {
            res.status(500).json({
                success: false,
                source: sourceName,
                script: scriptName,
                error: error.message,
                message: `Errore nell'esecuzione dello script per ${sourceName}`
            });
        });

    } catch (error) {
        console.error(`Errore nell'importazione da ${req.params.sourceName}:`, error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: error.message
        });
    }
});

module.exports = router;