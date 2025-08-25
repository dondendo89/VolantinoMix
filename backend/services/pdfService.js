const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const AdService = require('./adService');
const Volantino = require('../models/Volantino');
const { getGridFSBucket } = require('../utils/gridfs');

class PDFService {
    constructor() {
        // Su Render, usa /tmp per i file temporanei
        this.tempDir = process.env.NODE_ENV === 'production' ? '/tmp' : path.join(__dirname, '../../temp');
        const configuredDir = process.env.PDF_DIR;
        const defaultOutput = process.env.NODE_ENV === 'production' ? '/tmp/pdfs' : path.join(__dirname, '../../public/pdfs');
        this.outputDir = configuredDir && configuredDir.trim() !== '' ? configuredDir : defaultOutput;
        this.maxFileSize = 50 * 1024 * 1024; // 50MB
        this.allowedMimeTypes = ['application/pdf'];
        
        // Assicura che le directory esistano
        this.ensureDirectories();
    }

    /**
     * Assicura che le directory necessarie esistano
     */
    async ensureDirectories() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
            await fs.mkdir(this.outputDir, { recursive: true });
        } catch (error) {
            console.error('Errore nella creazione delle directory:', error);
        }
    }

    /**
     * Unisce più PDF con inserimento dinamico di pubblicità
     * @param {Array} volantiniIds - Array degli ID dei volantini da unire
     * @param {Object} options - Opzioni per il merging
     * @param {Object} userLocation - Posizione dell'utente per targeting ads
     * @returns {Promise<Object>} Informazioni sul PDF generato
     */
    async mergePDFsWithAds(volantiniIds, options = {}, userLocation = {}) {
        const startTime = Date.now();
        const mergeId = crypto.createHash('md5').update(volantiniIds.join('-') + startTime).digest('hex').substring(0, 8);
        
        try {
            console.log(`[MERGE-${mergeId}] Inizio merge di ${volantiniIds.length} volantini`, {
                volantiniIds,
                options,
                userLocation,
                timestamp: new Date().toISOString()
            });
            
            // Validazione input
            if (!Array.isArray(volantiniIds) || volantiniIds.length === 0) {
                throw new Error('Array di volantini vuoto o non valido');
            }

            // Log della query prima dell'esecuzione
            console.log(`[MERGE-${mergeId}] Query volantini:`, {
                volantiniIds,
                query: { _id: { $in: volantiniIds }, isActive: true }
            });

            // Recupera i volantini dal database
            const volantini = await Volantino.find({
                _id: { $in: volantiniIds },
                isActive: true
            }).lean();

            console.log(`[MERGE-${mergeId}] Risultati query:`, {
                found: volantini.length,
                volantini: volantini.map(v => ({ id: v._id, store: v.store, isActive: v.isActive }))
            });

            // Log dettagliato per volantini mancanti
            const foundIds = volantini.map(v => v._id.toString());
            const missingIds = volantiniIds.filter(id => !foundIds.includes(id.toString()));
            
            if (missingIds.length > 0) {
                console.warn(`[MERGE-${mergeId}] Volantini non trovati o inattivi:`, {
                    requestedIds: volantiniIds,
                    foundIds,
                    missingIds,
                    timestamp: new Date().toISOString()
                });
                
                // Verifica se i volantini mancanti esistono ma sono inattivi
                const inactiveVolantini = await Volantino.find({
                    _id: { $in: missingIds },
                    isActive: false
                }).lean();
                
                if (inactiveVolantini.length > 0) {
                    console.warn(`[MERGE-${mergeId}] Volantini disattivati trovati:`, 
                        inactiveVolantini.map(v => ({
                            id: v._id,
                            store: v.store,
                            location: v.location?.city,
                            validUntil: v.validUntil,
                            deactivatedAt: v.updatedAt
                        }))
                    );
                }
            }

            if (volantini.length === 0) {
                throw new Error(`Nessun volantino valido trovato. Richiesti: ${volantiniIds.length}, Trovati: 0`);
            }

            // Ordina i volantini secondo l'ordine richiesto
            const orderedVolantini = volantiniIds.map(id => 
                volantini.find(v => v._id.toString() === id.toString())
            ).filter(Boolean);

            // Ottieni le pubblicità da inserire
            const adPositions = options.adPositions || ['cover', 'intermediate', 'final'];
            const ads = await AdService.getAdsForPDF(orderedVolantini, userLocation, adPositions);

            // Crea il PDF unificato
            const mergedPDF = await PDFDocument.create();
            
            // Metadati del PDF
            mergedPDF.setTitle('VolantinoMix - Volantini Unificati');
            mergedPDF.setAuthor('VolantinoMix');
            mergedPDF.setSubject('Raccolta volantini promozionali');
            mergedPDF.setCreator('VolantinoMix Platform');
            mergedPDF.setProducer('VolantinoMix PDF Service');
            mergedPDF.setCreationDate(new Date());
            mergedPDF.setModificationDate(new Date());

            let pageCount = 0;
            const tableOfContents = [];
            const mergeStats = {
                totalVolantini: volantiniIds.length,
                successfulVolantini: 0,
                failedVolantini: 0,
                placeholderPages: 0,
                totalPages: 0,
                errors: []
            };

            // Inserisci pubblicità di copertina
            const coverAds = ads.filter(ad => ad.position === 'cover');
            for (const ad of coverAds) {
                await AdService.createAdPage(mergedPDF, ad);
                pageCount++;
                tableOfContents.push({
                    title: `Pubblicità: ${ad.title}`,
                    page: pageCount,
                    type: 'ad'
                });
            }

            // Inserisci volantini con pubblicità intermedie
            const intermediateAds = ads.filter(ad => ad.position === 'intermediate');
            let adIndex = 0;

            for (let i = 0; i < orderedVolantini.length; i++) {
                const volantino = orderedVolantini[i];
                
                try {
                    // Carica e inserisci il PDF del volantino
                    const volantinoPDF = await this.loadPDFFromVolantino(volantino);
                    const pages = await mergedPDF.copyPages(volantinoPDF, volantinoPDF.getPageIndices());
                    
                    const startPage = pageCount + 1;
                    pages.forEach(page => {
                        mergedPDF.addPage(page);
                        pageCount++;
                    });

                    // Incrementa contatore successi
                    mergeStats.successfulVolantini++;

                    // Aggiungi al sommario
                    tableOfContents.push({
                        title: `${volantino.store} - ${volantino.location.city}`,
                        page: startPage,
                        pages: pages.length,
                        type: 'flyer',
                        category: volantino.category,
                        validUntil: volantino.validUntil
                    });

                    console.log(`[MERGE-${mergeId}] Caricato con successo: ${volantino.store} - ${volantino.location.city} (${pages.length} pagine)`);

                    // Incrementa il contatore delle visualizzazioni
                    await Volantino.findByIdAndUpdate(volantino._id, {
                        $inc: { 'metrics.views': 1 }
                    });

                    // Inserisci pubblicità intermedia (tranne dopo l'ultimo volantino)
                    if (i < orderedVolantini.length - 1 && adIndex < intermediateAds.length) {
                        const ad = intermediateAds[adIndex];
                        await AdService.createAdPage(mergedPDF, ad);
                        pageCount++;
                        adIndex++;
                        
                        tableOfContents.push({
                            title: `Pubblicità: ${ad.title}`,
                            page: pageCount,
                            type: 'ad'
                        });
                    }

                } catch (error) {
                    mergeStats.failedVolantini++;
                    mergeStats.errors.push({
                        volantino: `${volantino.store} - ${volantino.location.city}`,
                        error: error.message,
                        errorType: error.message.includes('HTTP 404') ? 'URL_NOT_FOUND' : 
                                  error.message.includes('ENOENT') ? 'FILE_NOT_FOUND' : 'OTHER'
                    });
                    
                    console.error(`[MERGE-${mergeId}] Errore nel caricamento del volantino ${volantino._id} (${volantino.store} - ${volantino.location.city}):`, {
                        error: error.message,
                        pdfUrl: volantino.pdfUrl,
                        pdfPath: volantino.pdfPath,
                        errorType: error.message.includes('HTTP 404') ? 'URL_NOT_FOUND' : 
                                  error.message.includes('ENOENT') ? 'FILE_NOT_FOUND' : 'OTHER'
                    });
                    
                    try {
                        // Crea una pagina placeholder per il volantino non disponibile
                        const placeholderPDF = await this.createPlaceholderPage(volantino, error);
                        const placeholderPages = await mergedPDF.copyPages(placeholderPDF, [0]);
                        
                        for (const page of placeholderPages) {
                            mergedPDF.addPage(page);
                            pageCount++;
                        }
                        
                        mergeStats.placeholderPages++;
                        
                        // Aggiungi al sommario come volantino non disponibile
                        tableOfContents.push({
                            title: `${volantino.store} - ${volantino.location.city} (Non disponibile)`,
                            page: pageCount,
                            pages: 1,
                            type: 'flyer_error',
                            category: volantino.category,
                            validUntil: volantino.validUntil,
                            error: error.message.includes('HTTP 404') ? 'PDF non più disponibile' : 'Errore di caricamento'
                        });
                        
                        console.log(`[MERGE-${mergeId}] Aggiunta pagina placeholder per ${volantino.store} - ${volantino.location.city}`);
                        
                    } catch (placeholderError) {
                        console.error(`[MERGE-${mergeId}] Errore nella creazione del placeholder per ${volantino._id}:`, placeholderError);
                        
                        // Fallback: aggiungi solo al sommario senza pagina
                        tableOfContents.push({
                            title: `${volantino.store} - ${volantino.location.city} (Non disponibile)`,
                            page: null,
                            pages: 0,
                            type: 'flyer_error',
                            category: volantino.category,
                            validUntil: volantino.validUntil,
                            error: 'Errore critico di caricamento'
                        });
                    }
                    
                    // Continua con gli altri volantini
                }
            }

            // Inserisci pubblicità finali
            const finalAds = ads.filter(ad => ad.position === 'final');
            for (const ad of finalAds) {
                await AdService.createAdPage(mergedPDF, ad);
                pageCount++;
                tableOfContents.push({
                    title: `Offerta: ${ad.title}`,
                    page: pageCount,
                    type: 'ad'
                });
            }

            // Crea pagina sommario se richiesta
            if (options.includeTOC !== false && tableOfContents.length > 1) {
                await this.createTableOfContentsPage(mergedPDF, tableOfContents, 0);
            }

            // Genera nome file unico
            const timestamp = Date.now();
            const hash = crypto.createHash('md5')
                .update(volantiniIds.join('-') + timestamp)
                .digest('hex')
                .substring(0, 8);
            
            const filename = `volantino-mix-${hash}-${timestamp}.pdf`;
            const filepath = path.join(this.outputDir, filename);

            // Salva il PDF
            const pdfBytes = await mergedPDF.save();
            await fs.writeFile(filepath, pdfBytes);

            // Salvataggio anche su GridFS per persistenza su piani free
            try {
                const bucket = getGridFSBucket();
                const uploadStream = bucket.openUploadStream(filename, {
                    contentType: 'application/pdf',
                    metadata: { source: 'merged', volantiniIds }
                });
                uploadStream.end(Buffer.from(pdfBytes));
            } catch (gerr) {
                console.warn('⚠️ GridFS non disponibile o errore upload merged:', gerr.message);
            }

            // Calcola statistiche
            const fileSize = pdfBytes.length;
            const totalPages = pageCount;
            const flyerCount = orderedVolantini.length;
            const adCount = ads.length;

            // Informazioni di ritorno
            const result = {
                filename,
                filepath,
                fileSize,
                fileSizeFormatted: this.formatFileSize(fileSize),
                totalPages,
                flyerCount,
                adCount,
                tableOfContents,
                downloadUrl: `/api/pdfs/download/${filename}`,
                previewUrl: `/api/pdfs/preview/${filename}`,
                mergeId,
                byId: {
                    downloadUrl: `/api/pdfs/download/by-id/${mergeId}`,
                    previewUrl: `/api/pdfs/preview/by-id/${mergeId}`
                },
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 ore
                metadata: {
                    volantini: orderedVolantini.map(v => ({
                        id: v._id,
                        store: v.store,
                        city: v.location.city,
                        category: v.category
                    })),
                    ads: ads.map(ad => ({
                        id: ad._id,
                        title: ad.title,
                        position: ad.position,
                        category: ad.category
                    })),
                    userLocation
                }
            };

            // Aggiorna statistiche finali
             mergeStats.totalPages = totalPages;
            
            const processingTime = Date.now() - startTime;
            
            console.log(`[MERGE-${mergeId}] PDF generato con successo: ${filename}`, {
                fileSize: this.formatFileSize(fileSize),
                totalPages,
                processingTime: `${processingTime}ms`,
                stats: mergeStats,
                result
            });
            
            return result;

        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error(`[MERGE-${mergeId}] Errore nel merging dei PDF:`, {
                error: error.message,
                stack: error.stack,
                processingTime: `${processingTime}ms`,
                volantiniIds,
                options
            });
            throw new Error(`Errore nella generazione del PDF: ${error.message}`);
        }
    }

    /**
     * Carica un PDF da URL
     */
    async loadPDFFromUrl(url) {
        try {
            // Se è un percorso relativo, convertilo in URL completo
            if (!url.startsWith('http')) {
                // In produzione su Render, converti i percorsi relativi in URL completi
                if (process.env.NODE_ENV === 'production') {
                    if (url.startsWith('/api/pdfs/download/') || url.startsWith('/uploads/')) {
                        const baseUrl = process.env.BASE_URL || 'https://volantinomix.onrender.com';
                        url = baseUrl + url;
                    } else {
                        // Per altri percorsi relativi, prova a costruire l'URL
                        const baseUrl = process.env.BASE_URL || 'https://volantinomix.onrender.com';
                        url = baseUrl + '/api/pdfs/download/' + path.basename(url);
                    }
                } else {
                    // In sviluppo locale, mantieni la logica esistente per i file locali
                    let localPath;
                    
                    // Gestisci percorsi che iniziano con /api/pdfs/download/
                    if (url.startsWith('/api/pdfs/download/')) {
                        const filename = path.basename(url);
                        // Prova prima nella cartella public del progetto principale
                        localPath = path.join(__dirname, '../../public/pdfs', filename);
                        
                        // Se non esiste, prova nella cartella public del backend
                        if (!await fs.access(localPath).then(() => true).catch(() => false)) {
                            localPath = path.join(__dirname, '../public/pdfs', filename);
                        }
                    } else if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
                        // Se l'URL inizia già con '/uploads/' o 'uploads/', usa il percorso relativo dalla directory backend
                        const cleanUrl = url.startsWith('/') ? url.substring(1) : url;
                        localPath = path.join(__dirname, '..', cleanUrl);
                    } else {
                        // Altrimenti, aggiungi il prefisso uploads
                        localPath = path.join(__dirname, '../uploads', url);
                    }
                    
                    // Prova a caricare il file dal percorso principale
                    try {
                        const pdfBytes = await fs.readFile(localPath);
                        return await PDFDocument.load(pdfBytes);
                    } catch (error) {
                        // Se non trovato, prova nelle cartelle specifiche degli scraper
                        const filename = path.basename(url);
                        
                        // Prova nella cartella volantini_deco per i volantini Decò
                        const decoPath = path.join(__dirname, '../../volantini_deco', filename);
                        try {
                            const pdfBytes = await fs.readFile(decoPath);
                            return await PDFDocument.load(pdfBytes);
                        } catch (decoError) {
                            // Se non trovato neanche lì, rilancia l'errore originale
                            throw error;
                        }
                    }
                }
            }

            // Se è un URL remoto
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const pdfBytes = new Uint8Array(arrayBuffer);
            
            return await PDFDocument.load(pdfBytes);

        } catch (error) {
            const errorDetails = {
                url,
                errorMessage: error.message,
                errorType: error.message.includes('HTTP 404') ? 'URL_NOT_FOUND' : 
                          error.message.includes('ENOENT') ? 'FILE_NOT_FOUND' : 
                          error.message.includes('HTTP') ? 'HTTP_ERROR' : 'OTHER',
                timestamp: new Date().toISOString(),
                isProduction: process.env.NODE_ENV === 'production'
            };
            
            console.error(`Errore nel caricamento PDF da ${url}:`, errorDetails);
            throw error;
        }
    }

    /**
     * Carica un PDF da un oggetto volantino (usa pdfPath se disponibile, altrimenti pdfUrl)
     */
    async loadPDFFromVolantino(volantino) {
        try {
            // In produzione su Render, usa sempre pdfUrl e ignora pdfPath
            if (process.env.NODE_ENV === 'production') {
                if (volantino.pdfUrl) {
                    console.log(`Ambiente produzione: caricando PDF da pdfUrl: ${volantino.pdfUrl}`);
                    return await this.loadPDFFromUrl(volantino.pdfUrl);
                } else {
                    throw new Error('Nessun pdfUrl disponibile per il volantino in produzione');
                }
            }
            
            // In sviluppo locale, prova prima con pdfPath se disponibile
            if (volantino.pdfPath) {
                try {
                    const pdfBytes = await fs.readFile(volantino.pdfPath);
                    return await PDFDocument.load(pdfBytes);
                } catch (error) {
                    console.log(`Errore nel caricamento da pdfPath ${volantino.pdfPath}:`, error.message);
                }
            }
            
            // Se pdfPath non funziona o non è disponibile, prova con pdfUrl
            if (volantino.pdfUrl) {
                return await this.loadPDFFromUrl(volantino.pdfUrl);
            }
            
            throw new Error('Nessun percorso PDF valido trovato per il volantino');
        } catch (error) {
            const errorDetails = {
                volantino: {
                    id: volantino._id,
                    store: volantino.store,
                    location: volantino.location?.city,
                    source: volantino.source,
                    pdfUrl: volantino.pdfUrl,
                    pdfPath: volantino.pdfPath,
                    validUntil: volantino.validUntil
                },
                errorMessage: error.message,
                errorType: error.message.includes('HTTP 404') ? 'URL_NOT_FOUND' : 
                          error.message.includes('ENOENT') ? 'FILE_NOT_FOUND' : 
                          error.message.includes('HTTP') ? 'HTTP_ERROR' : 'OTHER',
                timestamp: new Date().toISOString(),
                isProduction: process.env.NODE_ENV === 'production'
            };
            
            console.error(`Errore nel caricamento del volantino ${volantino._id} (${volantino.store} - ${volantino.location?.city}):`, errorDetails);
            throw error;
        }
    }

    /**
     * Crea una pagina placeholder per volantini non disponibili
     */
    async createPlaceholderPage(volantino, error) {
        try {
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([595.28, 841.89]);
            const { width, height } = page.getSize();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            
            const margin = 50;
            let currentY = height - 100;

            // Colori
            const errorColor = rgb(0.8, 0.2, 0.2);
            const textColor = rgb(0.3, 0.3, 0.3);
            const bgColor = rgb(0.95, 0.95, 0.95);

            // Background
            page.drawRectangle({
                x: 0,
                y: 0,
                width: width,
                height: height,
                color: bgColor
            });

            // Header con errore
            page.drawRectangle({
                x: margin,
                y: currentY - 20,
                width: width - 2 * margin,
                height: 60,
                color: rgb(1, 0.9, 0.9),
                borderColor: errorColor,
                borderWidth: 2
            });

            page.drawText('VOLANTINO NON DISPONIBILE', {
                x: margin + 20,
                y: currentY,
                size: 20,
                font: boldFont,
                color: errorColor
            });
            currentY -= 80;

            // Informazioni volantino
            page.drawText(`Store: ${volantino.store}`, {
                x: margin,
                y: currentY,
                size: 16,
                font: boldFont,
                color: textColor
            });
            currentY -= 30;

            page.drawText(`Città: ${volantino.location.city}`, {
                x: margin,
                y: currentY,
                size: 14,
                font: font,
                color: textColor
            });
            currentY -= 25;

            page.drawText(`Categoria: ${volantino.category}`, {
                x: margin,
                y: currentY,
                size: 14,
                font: font,
                color: textColor
            });
            currentY -= 25;

            if (volantino.validUntil) {
                page.drawText(`Valido fino al: ${new Date(volantino.validUntil).toLocaleDateString('it-IT')}`, {
                    x: margin,
                    y: currentY,
                    size: 14,
                    font: font,
                    color: textColor
                });
                currentY -= 40;
            }

            // Motivo dell'errore
            page.drawText('Motivo:', {
                x: margin,
                y: currentY,
                size: 14,
                font: boldFont,
                color: textColor
            });
            currentY -= 25;

            const errorMessage = error.message.includes('HTTP 404') ? 
                'Il PDF non è più disponibile sul server' :
                error.message.includes('ENOENT') ?
                'File non trovato nel sistema' :
                'Errore di caricamento del PDF';

            page.drawText(errorMessage, {
                x: margin,
                y: currentY,
                size: 12,
                font: font,
                color: errorColor
            });
            currentY -= 40;

            // Suggerimenti
            page.drawText('Suggerimenti:', {
                x: margin,
                y: currentY,
                size: 14,
                font: boldFont,
                color: textColor
            });
            currentY -= 25;

            const suggestions = [
                '• Controlla se il volantino è ancora valido',
                '• Verifica la connessione internet',
                '• Riprova più tardi',
                '• Contatta il supporto se il problema persiste'
            ];

            for (const suggestion of suggestions) {
                page.drawText(suggestion, {
                    x: margin,
                    y: currentY,
                    size: 12,
                    font: font,
                    color: textColor
                });
                currentY -= 20;
            }

            // Footer
            page.drawText(`Generato il ${new Date().toLocaleDateString('it-IT')} alle ${new Date().toLocaleTimeString('it-IT')}`, {
                x: margin,
                y: 30,
                size: 10,
                font: font,
                color: rgb(0.5, 0.5, 0.5)
            });

            return pdfDoc;
        } catch (error) {
            console.error('Errore nella creazione della pagina placeholder:', error);
            throw error;
        }
    }

    /**
     * Crea una pagina sommario
     */
    async createTableOfContentsPage(pdfDoc, tableOfContents, insertIndex = 0) {
        try {
            const page = pdfDoc.insertPage(insertIndex, [595.28, 841.89]);
            const { width, height } = page.getSize();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            
            const margin = 50;
            let currentY = height - 100;

            // Colori
            const primaryColor = rgb(0.2, 0.4, 0.8);
            const textColor = rgb(0.1, 0.1, 0.1);
            const accentColor = rgb(0.0, 0.7, 0.3);

            // Header
            page.drawRectangle({
                x: 0,
                y: height - 80,
                width: width,
                height: 80,
                color: primaryColor
            });

            page.drawText('VolantinoMix', {
                x: margin,
                y: height - 50,
                size: 24,
                font: boldFont,
                color: rgb(1, 1, 1)
            });

            // Titolo sommario
            page.drawText('Sommario', {
                x: margin,
                y: currentY,
                size: 24,
                font: boldFont,
                color: primaryColor
            });
            currentY -= 50;

            // Linea separatrice
            page.drawLine({
                start: { x: margin, y: currentY },
                end: { x: width - margin, y: currentY },
                thickness: 2,
                color: accentColor
            });
            currentY -= 30;

            // Contenuti
            for (const item of tableOfContents) {
                if (currentY < 100) break; // Evita overflow

                let icon, title, pageText, titleColor;
                
                if (item.type === 'flyer_error') {
                    icon = '[ERR]';
                    title = `${icon} ${item.title}`;
                    pageText = item.error || 'Non disponibile';
                    titleColor = rgb(0.8, 0.2, 0.2); // Rosso per errori
                } else {
                    icon = item.type === 'ad' ? '[AD]' : '[PDF]';
                    title = `${icon} ${item.title}`;
                    pageText = `Pag. ${item.page}`;
                    titleColor = item.type === 'ad' ? rgb(0.6, 0.6, 0.6) : textColor;
                }

                // Titolo
                page.drawText(title, {
                    x: margin,
                    y: currentY,
                    size: 12,
                    font: item.type === 'ad' ? font : boldFont,
                    color: titleColor
                });

                // Numero pagina o messaggio di errore
                page.drawText(pageText, {
                    x: width - margin - 120,
                    y: currentY,
                    size: 10,
                    font: font,
                    color: item.type === 'flyer_error' ? rgb(0.8, 0.2, 0.2) : textColor
                });

                // Linea punteggiata (solo per volantini e pubblicità, non per errori)
                if (item.type !== 'flyer_error') {
                    const dotsStart = margin + 250;
                    const dotsEnd = width - margin - 140;
                    for (let x = dotsStart; x < dotsEnd; x += 10) {
                        page.drawText('.', {
                            x: x,
                            y: currentY,
                            size: 8,
                            font: font,
                            color: rgb(0.7, 0.7, 0.7)
                        });
                    }
                }

                currentY -= 25;

                // Informazioni aggiuntive per i volantini
                if (item.type === 'flyer' && item.category) {
                    page.drawText(`   Categoria: ${item.category}`, {
                        x: margin + 20,
                        y: currentY,
                        size: 10,
                        font: font,
                        color: rgb(0.5, 0.5, 0.5)
                    });
                    currentY -= 20;
                }
            }

            // Footer
            page.drawText(`Generato il ${new Date().toLocaleDateString('it-IT')}`, {
                x: margin,
                y: 30,
                size: 10,
                font: font,
                color: rgb(0.5, 0.5, 0.5)
            });

            const flyerCount = tableOfContents.filter(t => t.type === 'flyer').length;
            const adCount = tableOfContents.filter(t => t.type === 'ad').length;
            const errorCount = tableOfContents.filter(t => t.type === 'flyer_error').length;
            
            let summaryText = `Totale: ${flyerCount} volantini, ${adCount} pubblicità`;
            if (errorCount > 0) {
                summaryText += `, ${errorCount} non disponibili`;
            }
            
            page.drawText(summaryText, {
                x: width - 300,
                y: 30,
                size: 10,
                font: font,
                color: rgb(0.5, 0.5, 0.5)
            });

        } catch (error) {
            console.error('Errore nella creazione del sommario:', error);
        }
    }

    /**
     * Valida un file PDF
     */
    async validatePDF(filePath, originalName) {
        try {
            const stats = await fs.stat(filePath);
            
            // Verifica dimensione
            if (stats.size > this.maxFileSize) {
                throw new Error(`File troppo grande: ${this.formatFileSize(stats.size)} (max: ${this.formatFileSize(this.maxFileSize)})`);
            }

            // Verifica che sia un PDF valido
            const pdfBytes = await fs.readFile(filePath);
            const pdf = await PDFDocument.load(pdfBytes);
            
            const pageCount = pdf.getPageCount();
            if (pageCount === 0) {
                throw new Error('PDF vuoto o corrotto');
            }

            return {
                isValid: true,
                fileSize: stats.size,
                pageCount,
                title: pdf.getTitle() || originalName
            };

        } catch (error) {
            return {
                isValid: false,
                error: error.message
            };
        }
    }

    /**
     * Pulisce i file temporanei più vecchi di X ore
     */
    async cleanupTempFiles(maxAgeHours = 24) {
        try {
            const files = await fs.readdir(this.outputDir);
            const now = Date.now();
            const maxAge = maxAgeHours * 60 * 60 * 1000;
            let deletedCount = 0;

            for (const file of files) {
                const filePath = path.join(this.outputDir, file);
                const stats = await fs.stat(filePath);
                
                if (now - stats.mtime.getTime() > maxAge) {
                    await fs.unlink(filePath);
                    deletedCount++;
                }
            }

            console.log(`Cleanup completato: ${deletedCount} file eliminati`);
            return { deletedCount };

        } catch (error) {
            console.error('Errore nel cleanup:', error);
            throw error;
        }
    }

    /**
     * Ottiene informazioni su un PDF
     */
    async getPDFInfo(filename) {
        try {
            const filepath = path.join(this.outputDir, filename);
            const stats = await fs.stat(filepath);
            
            return {
                filename,
                fileSize: stats.size,
                fileSizeFormatted: this.formatFileSize(stats.size),
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime,
                downloadUrl: `/api/pdfs/download/${filename}`,
                previewUrl: `/api/pdfs/preview/${filename}`
            };

        } catch (error) {
            throw new Error(`File non trovato: ${filename}`);
        }
    }

    /**
     * Formatta la dimensione del file
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Genera anteprima thumbnail del PDF
     */
    async generateThumbnail(pdfPath, outputPath, options = {}) {
        try {
            // Questa funzione richiederebbe una libreria come pdf2pic
            // Per ora restituiamo un placeholder
            console.log(`Thumbnail generation requested for ${pdfPath}`);
            return {
                success: false,
                message: 'Thumbnail generation not implemented'
            };
        } catch (error) {
            console.error('Errore nella generazione thumbnail:', error);
            throw error;
        }
    }

    /**
     * Ottiene statistiche sui PDF generati
     */
    async getStats(timeframe = 24) {
        try {
            const files = await fs.readdir(this.outputDir);
            const since = Date.now() - (timeframe * 60 * 60 * 1000);
            let totalSize = 0;
            let recentFiles = 0;

            for (const file of files) {
                const filePath = path.join(this.outputDir, file);
                const stats = await fs.stat(filePath);
                totalSize += stats.size;
                
                if (stats.mtime.getTime() > since) {
                    recentFiles++;
                }
            }

            return {
                totalFiles: files.length,
                recentFiles,
                totalSize,
                totalSizeFormatted: this.formatFileSize(totalSize),
                averageSize: files.length > 0 ? Math.round(totalSize / files.length) : 0,
                timeframe
            };

        } catch (error) {
            console.error('Errore nel calcolo statistiche:', error);
            return {
                totalFiles: 0,
                recentFiles: 0,
                totalSize: 0,
                totalSizeFormatted: '0 Bytes',
                averageSize: 0,
                timeframe
            };
        }
    }
}

module.exports = new PDFService();