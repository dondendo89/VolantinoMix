const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { PDFDocument } = require('pdf-lib');
const PDFService = require('../services/pdfService');
const AdService = require('../services/adService');
const Volantino = require('../models/Volantino');
const Advertisement = require('../models/Advertisement');
const crypto = require('crypto');
const { checkDuplicatesWithAction } = require('../utils/duplicateChecker');

// Rate limiting per le operazioni PDF
const pdfRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minuti
    max: 100, // TEMPORANEO: aumentato per sviluppo (era 20)
    message: {
        error: 'Troppe operazioni PDF, riprova tra 15 minuti',
        code: 'PDF_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Middleware per gestire errori di Multer
const handleMulterError = (err, req, res, next) => {
    console.log('🔍 DEBUG - Multer Error Handler chiamato:', {
        errorType: err.constructor.name,
        isMulterError: err instanceof multer.MulterError,
        errorCode: err.code,
        errorMessage: err.message,
        stack: err.stack
    });
    
    if (err instanceof multer.MulterError) {
        console.log('🚨 DEBUG - MulterError rilevato:', err.code);
        
        if (err.code === 'LIMIT_FILE_SIZE') {
            console.log('📏 DEBUG - File troppo grande rilevato');
            return res.status(400).json({
                success: false,
                error: 'File troppo grande',
                message: 'Il file supera il limite di 20MB. Riduci la dimensione del file e riprova.',
                code: 'FILE_TOO_LARGE'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            console.log('📊 DEBUG - Troppi file rilevati');
            return res.status(400).json({
                success: false,
                error: 'Troppi file',
                message: 'Puoi caricare massimo 10 file alla volta.',
                code: 'TOO_MANY_FILES'
            });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            console.log('❌ DEBUG - Campo file non valido');
            return res.status(400).json({
                success: false,
                error: 'Campo file non valido',
                message: 'Nome del campo file non riconosciuto.',
                code: 'INVALID_FIELD_NAME'
            });
        }
        // Altri errori Multer
        console.log('⚠️ DEBUG - Altro errore Multer:', err.code);
        return res.status(400).json({
            success: false,
            error: 'Errore nell\'upload',
            message: err.message || 'Errore durante l\'upload del file.',
            code: err.code || 'UPLOAD_ERROR'
        });
    }
    
    // Errori del filtro file
    if (err.message === 'Solo file PDF sono consentiti') {
        console.log('📄 DEBUG - Tipo file non valido');
        return res.status(400).json({
            success: false,
            error: 'Tipo file non valido',
            message: 'Solo file PDF sono consentiti. Seleziona un file con estensione .pdf.',
            code: 'INVALID_FILE_TYPE'
        });
    }
    
    // Altri errori
    console.log('🔄 DEBUG - Passaggio errore al middleware successivo');
    next(err);
};

// Configurazione multer per l'upload dei file
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        // Usa la stessa directory sia per upload che per download
        const uploadDir = process.env.NODE_ENV === 'production' ? '/tmp/pdfs' : path.join(__dirname, '../../public/pdfs');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `volantino-${uniqueSuffix}.pdf`);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Solo file PDF sono consentiti'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB max
        files: 10 // massimo 10 file per volta
    }
});

// Middleware per gestire gli errori di validazione
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Dati di input non validi',
            details: errors.array()
        });
    }
    next();
};

// Applica rate limiting a tutte le route
router.use(pdfRateLimit);

// POST /api/pdfs/upload - Upload manuale di PDF
router.post('/upload', (req, res, next) => {
    console.log('🎯 DEBUG - Middleware upload iniziato');
    upload.array('pdfs', 10)(req, res, (err) => {
        if (err) {
            console.log('🚨 DEBUG - Errore durante upload multer:', err);
            return handleMulterError(err, req, res, next);
        }
        console.log('✅ DEBUG - Upload multer completato senza errori');
        next();
    });
}, [
    body('store').optional().trim().isLength({ max: 100 }).withMessage('Nome negozio troppo lungo'),
    body('category').optional().isIn(['Supermercato', 'Discount', 'Elettronica', 'Abbigliamento', 'Casa e Giardino', 'Sport', 'Farmacia', 'Altro']).withMessage('Categoria non valida'),
    body('location.cap').optional().matches(/^[0-9]{5}$/).withMessage('CAP deve essere di 5 cifre')
], handleValidationErrors, async (req, res) => {
    console.log('🚀 DEBUG - Upload endpoint raggiunto');
    console.log('📋 DEBUG - Request info:', {
        method: req.method,
        url: req.url,
        headers: {
            'content-type': req.headers['content-type'],
            'content-length': req.headers['content-length']
        },
        filesCount: req.files ? req.files.length : 0,
        body: req.body
    });
    
    try {
        console.log('🔍 DEBUG - Controllo presenza file...');
        if (!req.files || req.files.length === 0) {
            console.log('❌ DEBUG - Nessun file trovato nella richiesta');
            return res.status(400).json({
                success: false,
                error: 'Nessun file caricato',
                message: 'Seleziona almeno un file PDF da caricare'
            });
        }
        
        console.log('✅ DEBUG - File trovati:', req.files.map(f => ({
            originalname: f.originalname,
            filename: f.filename,
            mimetype: f.mimetype,
            size: f.size,
            path: f.path
        })));

        const uploadedFiles = [];
        const errors = [];

        console.log('🔄 DEBUG - Inizio elaborazione file...');
        for (const file of req.files) {
            console.log(`📄 DEBUG - Elaborazione file: ${file.originalname}`);
            try {
                console.log('📖 DEBUG - Lettura file buffer...');
                // Verifica che il file sia effettivamente un PDF
                const fileBuffer = await fs.readFile(file.path);
                console.log(`📊 DEBUG - Buffer letto, dimensione: ${fileBuffer.length} bytes`);
                
                console.log('🔍 DEBUG - Caricamento PDF con pdf-lib...');
                const pdfDoc = await PDFDocument.load(fileBuffer);
                const pageCount = pdfDoc.getPageCount();
                console.log(`📑 DEBUG - PDF caricato con successo, pagine: ${pageCount}`);

                // Calcola la dimensione del file
                const stats = await fs.stat(file.path);
                const fileSizeInBytes = stats.size;
                
                // Converti fileSize in formato corretto (KB, MB, GB)
                let fileSizeFormatted;
                if (fileSizeInBytes < 1024) {
                    fileSizeFormatted = `1 KB`;  // Minimo 1 KB per rispettare il regex
                } else if (fileSizeInBytes < 1024 * 1024) {
                    fileSizeFormatted = `${Math.round(fileSizeInBytes / 1024)} KB`;
                } else if (fileSizeInBytes < 1024 * 1024 * 1024) {
                    fileSizeFormatted = `${Math.round(fileSizeInBytes / (1024 * 1024))} MB`;
                } else {
                    fileSizeFormatted = `${Math.round(fileSizeInBytes / (1024 * 1024 * 1024))} GB`;
                }

                // Crea l'URL relativo per il file
                const pdfUrl = `/api/pdfs/download/${file.filename}`;

                const fileInfo = {
                    originalName: file.originalname,
                    filename: file.filename,
                    path: file.path,
                    pdfUrl: pdfUrl,
                    size: fileSizeFormatted,
                    sizeBytes: fileSizeInBytes,
                    pages: pageCount,
                    uploadDate: new Date()
                };

                uploadedFiles.push(fileInfo);

            } catch (error) {
                console.error(`Errore nell'elaborazione del file ${file.originalname}:`, error);
                errors.push({
                    filename: file.originalname,
                    error: 'File PDF non valido o corrotto'
                });
                
                // Rimuovi il file non valido
                try {
                    await fs.unlink(file.path);
                } catch (unlinkError) {
                    console.error('Errore nella rimozione del file non valido:', unlinkError);
                }
            }
        }

        // Crea i volantini nel database per ogni file caricato
        const createdFlyers = [];
        const flyerErrors = [];
        const skippedDuplicates = [];
        
        for (const fileInfo of uploadedFiles) {
            try {
                // Estrai i dati dal form
                const store = req.body.store || 'Negozio non specificato';
                const category = req.body.category || 'Altro';
                const cap = req.body['location.cap'] || '00000';
                
                // Determina il source basandosi sul nome del negozio
                let source = 'api'; // default per upload manuali
                if (store.toLowerCase().includes('decò') || store.toLowerCase().includes('deco')) {
                    source = 'deco';
                } else if (store.toLowerCase().includes('ipercoop')) {
                    source = 'ipercoop';
                } else if (store.toLowerCase().includes('eurospin')) {
                    source = 'eurospin';
                }
                
                // Prepara i dati per il controllo duplicati
                const flyerData = {
                    store: store,
                    category: category,
                    pdfUrl: fileInfo.pdfUrl,
                    pdfPath: fileInfo.path,
                    validFrom: new Date(),
                    validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                };
                
                // Controlla duplicati
                const duplicateCheck = await checkDuplicatesWithAction(
                    flyerData, 
                    fileInfo.path, 
                    { autoSkip: true, checkFileHash: true }
                );
                
                if (duplicateCheck.action === 'skip') {
                    console.log(`⚠️ Volantino duplicato saltato: ${fileInfo.filename}`);
                    console.log(`   Motivo: ${duplicateCheck.message}`);
                    
                    skippedDuplicates.push({
                        filename: fileInfo.filename,
                        reason: duplicateCheck.message,
                        duplicates: duplicateCheck.reasons
                    });
                    
                    // Rimuovi il file duplicato
                    try {
                        await fs.unlink(fileInfo.path);
                    } catch (unlinkError) {
                        console.error('Errore nella rimozione del file duplicato:', unlinkError);
                    }
                    
                    continue; // Salta alla prossima iterazione
                }
                
                // Crea il volantino nel database
                const newFlyer = new Volantino({
                    store: store,
                    location: {
                        address: 'Indirizzo non specificato',
                        city: 'Città non specificata',
                        cap: cap,
                        coordinates: {
                            lat: 0,
                            lng: 0
                        }
                    },
                    validFrom: new Date(),
                    validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 giorni da oggi
                    pages: fileInfo.pages,
                    category: category,
                    pdfUrl: fileInfo.pdfUrl,
                    fileSize: fileInfo.size,
                    uploadedBy: 'user',
                    source: source, // Campo source diretto
                    metadata: {
                        source: source, // Mantieni anche in metadata per compatibilità
                        uploadDate: fileInfo.uploadDate,
                        lastModified: fileInfo.uploadDate
                    }
                });
                
                // Aggiungi hash del file ai metadata se disponibile
                if (duplicateCheck.preparedData.fileHash) {
                    newFlyer.metadata.fileHash = duplicateCheck.preparedData.fileHash;
                }
                
                const savedFlyer = await newFlyer.save();
                createdFlyers.push({
                    flyerId: savedFlyer._id,
                    store: savedFlyer.store,
                    cap: savedFlyer.location.cap,
                    pdfUrl: savedFlyer.pdfUrl
                });
                
                console.log(`✅ DEBUG - Volantino creato nel database: ${savedFlyer._id}`);
                
            } catch (error) {
                console.error(`Errore nella creazione del volantino per ${fileInfo.filename}:`, error);
                flyerErrors.push({
                    filename: fileInfo.filename,
                    error: 'Errore nella creazione del volantino nel database'
                });
            }
        }

        // Prepara il messaggio di risposta
        let message = `${uploadedFiles.length} file processati`;
        if (createdFlyers.length > 0) {
            message += `, ${createdFlyers.length} volantini creati`;
        }
        if (skippedDuplicates.length > 0) {
            message += `, ${skippedDuplicates.length} duplicati saltati`;
        }

        res.json({
            success: true,
            message: message,
            data: {
                uploadedFiles,
                createdFlyers,
                skippedDuplicates: skippedDuplicates.length > 0 ? skippedDuplicates : undefined,
                errors: errors.length > 0 ? errors : undefined,
                flyerErrors: flyerErrors.length > 0 ? flyerErrors : undefined,
                totalProcessed: uploadedFiles.length + skippedDuplicates.length,
                totalUploaded: uploadedFiles.length,
                totalFlyersCreated: createdFlyers.length,
                totalDuplicatesSkipped: skippedDuplicates.length,
                totalErrors: errors.length
            }
        });

    } catch (error) {
        console.error('Errore nell\'upload dei PDF:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile completare l\'upload'
        });
    }
});

// POST /api/pdfs/merge - Unisce più volantini in un singolo PDF
router.post('/merge', [
    body('flyerIds').isArray({ min: 1, max: 10 }).withMessage('Deve essere un array di 1-10 volantini'),
    body('flyerIds.*').isMongoId().withMessage('ID volantino non valido'),
    body('includeAds').optional().isBoolean().withMessage('includeAds deve essere boolean'),
    body('adPositions').optional().isArray().withMessage('adPositions deve essere un array'),
    body('adPositions.*').optional().isIn(['cover', 'intermediate', 'final']).withMessage('Posizione pubblicità non valida'),
    body('includeTOC').optional().isBoolean().withMessage('includeTOC deve essere boolean')
], handleValidationErrors, async (req, res) => {
    try {
        const { flyerIds, includeAds = true, adPositions = ['cover', 'intermediate', 'final'], includeTOC = true } = req.body;
        const userLocation = {
            city: req.query.city,
            cap: req.query.cap,
            lat: parseFloat(req.query.lat) || null,
            lng: parseFloat(req.query.lng) || null
        };

        // Opzioni per il servizio PDF
        const options = {
            adPositions: includeAds ? adPositions : [],
            includeTOC
        };

        // Utilizza il servizio PDF per il merging
        const result = await PDFService.mergePDFsWithAds(flyerIds, options, userLocation);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Errore nel merging PDF:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Errore nella generazione del PDF',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/pdfs/download/:filename - Download del PDF unificato
router.get('/download/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        
        // Validazione del nome file per sicurezza
        // Accetta sia il formato upload (volantino-timestamp-random.pdf) che il formato merge (volantino-mix-hash-timestamp.pdf)
        if (!filename.match(/^volantino(-mix-[a-f0-9]+-\d+|-\d+-\d+)\.pdf$/)) {
            return res.status(400).json({
                success: false,
                error: 'Nome file non valido'
            });
        }

        // Usa il percorso corretto in base all'ambiente
        const pdfDir = process.env.NODE_ENV === 'production' ? '/tmp/pdfs' : path.join(__dirname, '../../public/pdfs');
        const filePath = path.join(pdfDir, filename);
        
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({
                success: false,
                error: 'File non trovato',
                message: 'Il PDF richiesto non esiste o è scaduto'
            });
        }

        // Imposta gli header per il download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        // Usa res.download per forzare il download
        res.download(filePath, filename, (err) => {
            if (err) {
                console.error('Errore durante il download:', err);
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: 'Errore durante il download del file'
                    });
                }
            }
        });

    } catch (error) {
        console.error('Errore nel download del PDF:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile scaricare il file'
        });
    }
});

// GET /api/pdfs/preview/:filename - Anteprima del PDF
router.get('/preview/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        
        // Validazione del nome file per sicurezza
        if (!filename.match(/^volantino-mix-[a-f0-9]{8}-\d+\.pdf$/)) {
            return res.status(400).json({
                success: false,
                error: 'Nome file non valido'
            });
        }

        const filePath = path.join(__dirname, '../../public/pdfs', filename);
        
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({
                success: false,
                error: 'File non trovato',
                message: 'Il PDF richiesto non esiste o è scaduto'
            });
        }

        // Imposta gli header per la visualizzazione inline
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache per 1 ora
        
        // Rimuovi X-Frame-Options per permettere iframe cross-origin
        res.removeHeader('X-Frame-Options');
        
        // Aggiungi header CORS per iframe
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        
        // Invia il file
        res.sendFile(filePath);

    } catch (error) {
        console.error('Errore nell\'anteprima del PDF:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile visualizzare il file'
        });
    }
});

// DELETE /api/pdfs/cleanup - Pulizia dei file temporanei (per admin)
router.delete('/cleanup', async (req, res) => {
    try {
        const maxAgeHours = parseInt(req.query.maxAge) || 24;
        const result = await PDFService.cleanupTempFiles(maxAgeHours);
        
        res.json({
            success: true,
            message: `Pulizia completata: ${result.deletedCount} file rimossi`,
            data: {
                deletedFiles: result.deletedCount,
                maxAge: `${maxAgeHours} ore`
            }
        });
        
    } catch (error) {
        console.error('Errore nella pulizia dei file:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile completare la pulizia'
        });
    }
});

// Endpoint per elencare tutti i file PDF caricati
router.get('/files', async (req, res) => {
    try {
        const uploadsDir = path.join(__dirname, '../uploads/pdfs');
        
        try {
            const files = await fs.readdir(uploadsDir);
            const fileDetails = [];
            
            for (const filename of files) {
                if (filename.endsWith('.pdf')) {
                    const filePath = path.join(uploadsDir, filename);
                    const stats = await fs.stat(filePath);
                    
                    fileDetails.push({
                        filename: filename,
                        originalName: filename.replace(/^volantino-\d+-\d+\./, '').replace('.pdf', '') + '.pdf',
                        size: stats.size,
                        uploadDate: stats.birthtime,
                        modified: stats.mtime,
                        url: `/api/pdfs/download/${filename}`
                    });
                }
            }
            
            // Ordina per data di caricamento (più recenti prima)
            fileDetails.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
            
            res.json({
                success: true,
                files: fileDetails,
                total: fileDetails.length
            });
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                res.json({
                    success: true,
                    files: [],
                    total: 0
                });
            } else {
                throw error;
            }
        }
        
    } catch (error) {
        console.error('Errore nel recupero dei file:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile recuperare la lista dei file'
        });
    }
});

// Endpoint per eliminare un singolo file
router.delete('/delete/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        
        // Validazione del nome file per sicurezza
        if (!filename.match(/^volantino-\d+-\d+\.pdf$/)) {
            return res.status(400).json({
                success: false,
                error: 'Nome file non valido'
            });
        }
        
        const filePath = path.join(__dirname, '../uploads/pdfs', filename);
        
        try {
            await fs.access(filePath);
            await fs.unlink(filePath);
            
            res.json({
                success: true,
                message: 'File eliminato con successo',
                filename: filename
            });
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.status(404).json({
                    success: false,
                    error: 'File non trovato'
                });
            }
            throw error;
        }
        
    } catch (error) {
        console.error('Errore nell\'eliminazione del file:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile eliminare il file'
        });
    }
});

// GET /api/pdfs/view/:filename - Visualizza PDF singolo caricato
router.get('/view/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        
        // Validazione del nome file per sicurezza (formato dei file caricati)
        if (!filename.match(/^volantino-\d+-\d+\.pdf$/)) {
            return res.status(400).json({
                success: false,
                error: 'Nome file non valido'
            });
        }

        const filePath = path.join(__dirname, '../uploads/pdfs', filename);
        
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({
                success: false,
                error: 'File non trovato',
                message: 'Il PDF richiesto non esiste'
            });
        }

        // Imposta gli header per la visualizzazione inline
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache per 1 ora
        
        // Invia il file
        res.sendFile(filePath);

    } catch (error) {
        console.error('Errore nella visualizzazione del PDF:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile visualizzare il file'
        });
    }
});

// GET /api/pdf/info/:id - Ottieni informazioni su PDF merged tramite ID
router.get('/info/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Cerca il file PDF merged esistente nella directory corretta
        const publicPdfsDir = path.join(__dirname, '../../public/pdfs');
        
        try {
            const files = await fs.readdir(publicPdfsDir);
            // Cerca un file che corrisponde al pattern e contiene l'id
            const matchingFile = files.find(file => 
                file.endsWith('.pdf') && 
                file.includes(id)
            );
            
            let filename, fileSize, fileSizeFormatted, totalPages;
            
            if (matchingFile) {
                // Usa il file trovato
                filename = matchingFile;
                const filePath = path.join(publicPdfsDir, filename);
                const stats = await fs.stat(filePath);
                fileSize = stats.size;
                fileSizeFormatted = formatFileSize(fileSize);
                
                // Prova a ottenere il numero di pagine dal PDF
                try {
                    const pdfBytes = await fs.readFile(filePath);
                    const pdf = await PDFDocument.load(pdfBytes);
                    totalPages = pdf.getPageCount();
                } catch (pdfError) {
                    console.error('Errore nel leggere il PDF:', pdfError);
                    totalPages = 24; // fallback
                }
            } else {
                // Fallback ai dati mock se non ci sono file
                filename = `volantino-mix-${id.slice(-8)}-${Date.now()}.pdf`;
                fileSize = 3456789;
                fileSizeFormatted = '3.3 MB';
                totalPages = 24;
            }
            
            const pdfData = {
                id: id,
                filename: filename,
                fileSize: fileSize,
                fileSizeFormatted: fileSizeFormatted,
                totalPages: totalPages,
                createdAt: new Date(),
                url: `/api/pdfs/preview/${filename}`,
                downloadUrl: `/api/pdfs/download/${filename}`,
                tableOfContents: [
                    { title: 'Pubblicità Sponsor', pages: '1', startPage: 1 },
                    { title: 'Esselunga', pages: '2-7', startPage: 2 },
                    { title: 'Pubblicità Intermedia', pages: '8', startPage: 8 },
                    { title: 'Conad', pages: '9-14', startPage: 9 },
                    { title: 'Pubblicità Intermedia', pages: '15', startPage: 15 },
                    { title: 'Lidl', pages: '16-21', startPage: 16 },
                    { title: 'MediaWorld', pages: '22-23', startPage: 22 },
                    { title: 'Offerte Finali', pages: '24', startPage: 24 }
                ]
            };
            
            res.json({
                success: true,
                data: pdfData
            });
            
        } catch (dirError) {
            console.error('Errore lettura directory merged:', dirError);
            // Fallback ai dati mock in caso di errore
            const mockPDFData = {
                id: id,
                filename: `volantino-unificato-1755527279092-${id.slice(-8)}.pdf`,
                fileSize: 3456789,
                fileSizeFormatted: '3.3 MB',
                totalPages: 24,
                createdAt: new Date(),
                url: `/api/pdfs/preview/volantino-unificato-1755527279092-${id.slice(-8)}.pdf`,
                downloadUrl: `/api/pdfs/download/volantino-unificato-1755527279092-${id.slice(-8)}.pdf`,
                tableOfContents: [
                    { title: 'Pubblicità Sponsor', pages: '1', startPage: 1 },
                    { title: 'Esselunga', pages: '2-7', startPage: 2 },
                    { title: 'Pubblicità Intermedia', pages: '8', startPage: 8 },
                    { title: 'Conad', pages: '9-14', startPage: 9 },
                    { title: 'Pubblicità Intermedia', pages: '15', startPage: 15 },
                    { title: 'Lidl', pages: '16-21', startPage: 16 },
                    { title: 'MediaWorld', pages: '22-23', startPage: 22 },
                    { title: 'Offerte Finali', pages: '24', startPage: 24 }
                ]
            };
            
            res.json({
                success: true,
                data: mockPDFData
            });
        }
        
    } catch (error) {
        console.error('Errore nel recupero informazioni PDF:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile recuperare le informazioni del PDF'
        });
    }
});

// GET /api/pdf/view/:id - Endpoint per visualizzare PDF merged (mock)
router.get('/view/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Per ora generiamo un PDF mock per il testing
        // Questo dovrebbe essere sostituito con il vero PDF merged
        const mockPDFContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(PDF Mock per ID: ${id}) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000206 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
299
%%EOF`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        res.send(Buffer.from(mockPDFContent));
        
    } catch (error) {
        console.error('Errore nella visualizzazione del PDF:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile visualizzare il PDF'
        });
    }
});

// Endpoint per recuperare tutti i volantini per la gestione amministrativa
router.get('/admin/all-flyers', async (req, res) => {
    try {
        console.log('📋 Recupero tutti i volantini per amministrazione');
        
        // Recupera tutti i volantini dal modello Volantino (che include tutti i tipi)
        let allFlyers = [];
        
        try {
            // Recupera volantini caricati manualmente (senza source o source = 'manual')
            const uploadedFlyers = await Volantino.find({
                $or: [
                    { source: { $exists: false } },
                    { source: 'manual' },
                    { 'metadata.source': 'manual' }
                ]
            }).select({
                _id: 1,
                title: 1,
                store: 1,
                category: 1,
                filename: 1,
                originalName: 1,
                fileSize: 1,
                uploadDate: 1,
                validFrom: 1,
                validTo: 1,
                createdAt: 1,
                'metadata.originalFileName': 1,
                'metadata.uploadDate': 1
            }).lean();
            
            const mappedUploadFlyers = uploadedFlyers.map(flyer => ({
                ...flyer,
                source: 'upload',
                pdfPath: flyer.filename ? `uploads/pdfs/${flyer.filename}` : null,
                displayName: flyer.title || flyer.originalName || flyer.metadata?.originalFileName || 'Volantino senza nome',
                uploadDate: flyer.uploadDate || flyer.metadata?.uploadDate || flyer.createdAt
            }));
            
            allFlyers = allFlyers.concat(mappedUploadFlyers);
            
            // Recupera volantini da scraper (Eurospin, Decò, Ipercoop, Mersi) e API
            const scraperSources = ['eurospin', 'deco', 'ipercoop', 'mersi', 'api'];
            
            for (const source of scraperSources) {
                try {
                    const scraperFlyers = await Volantino.find({
                        $or: [
                            { source: source },
                            { 'metadata.source': source }
                        ]
                    }).select({
                        _id: 1,
                        title: 1,
                        store: 1,
                        category: 1,
                        pdfPath: 1,
                        pdfUrl: 1,
                        fileSize: 1,
                        validFrom: 1,
                        validTo: 1,
                        createdAt: 1,
                        'metadata.uploadDate': 1
                    }).lean();
                    
                    const mappedScraperFlyers = scraperFlyers.map(flyer => ({
                        ...flyer,
                        source: source,
                        displayName: flyer.title || `Volantino ${flyer.store || source}`,
                        uploadDate: flyer.metadata?.uploadDate || flyer.createdAt
                    }));
                    
                    allFlyers = allFlyers.concat(mappedScraperFlyers);
                    console.log(`📋 Recuperati ${mappedScraperFlyers.length} volantini da ${source}`);
                } catch (error) {
                    console.error(`❌ Errore nel recupero volantini ${source}:`, error.message);
                }
            }
        } catch (error) {
            console.error('❌ Errore nel recupero volantini:', error.message);
        }
        
        // Ordina per data di upload/creazione (più recenti prima)
        allFlyers.sort((a, b) => {
            const dateA = new Date(a.uploadDate || a.createdAt || a.dataInizio || 0);
            const dateB = new Date(b.uploadDate || b.createdAt || b.dataInizio || 0);
            return dateB - dateA;
        });
        
        console.log(`✅ Recuperati ${allFlyers.length} volantini totali`);
        
        res.json({
            success: true,
            count: allFlyers.length,
            flyers: allFlyers
        });
        
    } catch (error) {
        console.error('❌ Errore nel recupero volantini per amministrazione:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile recuperare i volantini'
        });
    }
});

// Endpoint per eliminare volantini selezionati
router.delete('/admin/delete-flyers', [
    body('flyerIds').isArray({ min: 1 }).withMessage('Deve essere un array di almeno 1 volantino'),
    body('flyerIds.*.id').isString().withMessage('ID volantino non valido'),
    body('flyerIds.*.source').isIn(['upload', 'eurospin', 'deco', 'ipercoop', 'mersi', 'api']).withMessage('Sorgente non valida')
], handleValidationErrors, async (req, res) => {
    try {
        const { flyerIds } = req.body;
        console.log(`🗑️ Eliminazione di ${flyerIds.length} volantini`);
        
        let deletedCount = 0;
        let errors = [];
        
        for (const flyer of flyerIds) {
            try {
                // Trova il volantino nel database
                const volantino = await Volantino.findById(flyer.id);
                
                if (volantino) {
                    // Se è un volantino caricato manualmente, elimina anche il file fisico
                    if (flyer.source === 'upload' && volantino.filename) {
                        const filePath = path.join(__dirname, '../uploads/pdfs', volantino.filename);
                        try {
                            await fs.unlink(filePath);
                            console.log(`🗑️ File eliminato: ${volantino.filename}`);
                        } catch (fileError) {
                            console.warn(`⚠️ Impossibile eliminare file ${volantino.filename}:`, fileError.message);
                        }
                    }
                    
                    // Se è un volantino da scraper con pdfPath, elimina anche il file PDF
                    if (['eurospin', 'deco', 'ipercoop'].includes(flyer.source) && volantino.pdfPath) {
                        const pdfPath = path.resolve(__dirname, '../../', volantino.pdfPath);
                        try {
                            await fs.unlink(pdfPath);
                            console.log(`🗑️ PDF scraper eliminato: ${volantino.pdfPath}`);
                        } catch (fileError) {
                            console.warn(`⚠️ Impossibile eliminare PDF ${volantino.pdfPath}:`, fileError.message);
                        }
                    }
                    
                    // Elimina il record dal database
                    await Volantino.findByIdAndDelete(flyer.id);
                    deletedCount++;
                    console.log(`✅ Volantino ${flyer.source} eliminato: ${flyer.id}`);
                } else {
                    console.warn(`⚠️ Volantino non trovato: ${flyer.id}`);
                    errors.push(`Volantino non trovato: ${flyer.id}`);
                }
            } catch (error) {
                console.error(`❌ Errore eliminazione volantino ${flyer.source}/${flyer.id}:`, error);
                errors.push(`Errore eliminazione ${flyer.source}/${flyer.id}: ${error.message}`);
            }
        }
        
        console.log(`✅ Eliminati ${deletedCount}/${flyerIds.length} volantini`);
        
        res.json({
            success: true,
            deletedCount,
            totalRequested: flyerIds.length,
            errors: errors.length > 0 ? errors : undefined,
            message: `Eliminati ${deletedCount} volantini su ${flyerIds.length} richiesti`
        });
        
    } catch (error) {
        console.error('❌ Errore nell\'eliminazione volantini:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile eliminare i volantini'
        });
    }
});

// Funzione helper per formattare la dimensione del file
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;