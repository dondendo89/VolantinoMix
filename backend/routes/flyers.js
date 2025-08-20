const express = require('express');
const router = express.Router();
const Volantino = require('../models/Volantino');
const { body, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

// Rate limiting per le API dei volantini
const flyersRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minuti
    max: 100, // massimo 100 richieste per IP
    message: {
        error: 'Troppe richieste, riprova tra 15 minuti',
        code: 'RATE_LIMIT_EXCEEDED'
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
            error: 'Dati di input non validi',
            details: errors.array()
        });
    }
    next();
};

// Applica rate limiting a tutte le route
router.use(flyersRateLimit);

// GET /api/flyers - Ottieni tutti i volantini attivi
router.get('/', [
    query('page').optional().isInt({ min: 1 }).withMessage('La pagina deve essere un numero positivo'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Il limite deve essere tra 1 e 50'),
    query('category').optional().isIn(['Supermercato', 'Discount', 'Elettronica', 'Abbigliamento', 'Casa e Giardino', 'Sport', 'Farmacia', 'Altro']).withMessage('Categoria non valida'),
    query('sort').optional().isIn(['newest', 'oldest', 'popular', 'expiring']).withMessage('Ordinamento non valido')
], handleValidationErrors, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const category = req.query.category;
        const sort = req.query.sort || 'newest';
        
        // Costruisci query per il database
        let query = {};
        if (category) {
            query.category = category;
        }
        
        // Definisci ordinamento
        let sortQuery = {};
        switch (sort) {
            case 'oldest':
                sortQuery = { createdAt: 1 };
                break;
            case 'popular':
                sortQuery = { views: -1 };
                break;
            case 'expiring':
                sortQuery = { validTo: 1 };
                break;
            default: // newest
                sortQuery = { createdAt: -1 };
        }
        
        // Calcola skip per paginazione
        const skip = (page - 1) * limit;
        
        // Query al database reale
        const volantini = await Volantino.find(query)
            .sort(sortQuery)
            .skip(skip)
            .limit(limit);
            
        const totalItems = await Volantino.countDocuments(query);
        const totalPages = Math.ceil(totalItems / limit);

        res.json({
            success: true,
            data: volantini,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalItems: totalItems,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Errore nel recupero dei volantini:', error.message);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile recuperare i volantini'
        });
    }
});



// GET /api/flyers/search - Cerca volantini per CAP o coordinate
router.get('/search', [
    query('cap').optional().matches(/^[0-9]{5}$/).withMessage('CAP deve essere di 5 cifre'),
    query('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitudine non valida'),
    query('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitudine non valida'),
    query('radius').optional().isInt({ min: 1, max: 100 }).withMessage('Raggio deve essere tra 1 e 100 km'),
    query('category').optional().isIn(['Supermercato', 'Discount', 'Elettronica', 'Abbigliamento', 'Casa e Giardino', 'Sport', 'Farmacia', 'Altro']).withMessage('Categoria non valida'),
    query('store').optional().isString().trim().isLength({ max: 100 }).withMessage('Nome supermercato non valido'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Il limite deve essere tra 1 e 50')
], handleValidationErrors, async (req, res) => {
    try {
        const { cap, lat, lng, radius, category, store, limit } = req.query;
        
        console.log('🔍 DEBUG - Parametri ricerca:', { cap, lat, lng, radius, category, store, limit });
        
        // Costruisci query per il database
        let query = {};
        
        if (cap) {
            query['location.cap'] = cap;
        }
        
        if (category) {
            query.category = category;
        }
        
        // Filtro per supermercato (case-insensitive)
        if (store) {
            query.store = { $regex: new RegExp(store, 'i') };
        }
        
        console.log('🔍 DEBUG - Query MongoDB:', JSON.stringify(query, null, 2));
        
        // Cerca nel database reale
        const volantini = await Volantino.find(query)
            .limit(parseInt(limit) || 20)
            .sort({ createdAt: -1 });
        
        console.log('📋 DEBUG - Volantini trovati:', volantini.length);
        if (store) {
            console.log('🏪 DEBUG - Filtro supermercato applicato:', store);
        }
        
        res.json({
            success: true,
            data: volantini,
            total: volantini.length,
            filters: {
                cap,
                category,
                store
            }
        });
    } catch (error) {
        console.error('❌ DEBUG - Errore ricerca volantini:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: error.message
        });
    }
});

// GET /api/flyers/popular - Ottieni volantini popolari
router.get('/popular', [
    query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Il limite deve essere tra 1 e 20')
], handleValidationErrors, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        
        // Query al database per volantini più popolari
        const volantini = await Volantino.find()
            .sort({ views: -1, downloads: -1 })
            .limit(limit);
        
        res.json({
            success: true,
            data: volantini,
            count: volantini.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Errore interno del server'
        });
    }
});

// GET /api/flyers/expiring - Ottieni volantini in scadenza
router.get('/expiring', [
    query('days').optional().isInt({ min: 1, max: 30 }).withMessage('I giorni devono essere tra 1 e 30')
], handleValidationErrors, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 3;
        
        const volantini = await Volantino.findExpiringSoon(days);
        
        res.json({
            success: true,
            data: volantini,
            count: volantini.length,
            expiringInDays: days
        });

    } catch (error) {
        console.error('Errore nel recupero dei volantini in scadenza:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile recuperare i volantini in scadenza'
        });
    }
});

// GET /api/flyers/:id - Ottieni un volantino specifico
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Verifica che l'ID sia un ObjectId valido
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                error: 'ID non valido',
                message: 'L\'ID del volantino non è nel formato corretto'
            });
        }

        const volantino = await Volantino.findById(id).select('-__v');

        if (!volantino) {
            return res.status(404).json({
                success: false,
                error: 'Volantino non trovato',
                message: 'Il volantino richiesto non esiste'
            });
        }

        // Incrementa il contatore delle visualizzazioni
        await volantino.incrementView();

        res.json({
            success: true,
            data: volantino
        });

    } catch (error) {
        console.error('Errore nel recupero del volantino:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile recuperare il volantino'
        });
    }
});

// POST /api/flyers/:id/download - Registra un download
router.post('/:id/download', async (req, res) => {
    try {
        const { id } = req.params;

        // Verifica che l'ID sia un ObjectId valido
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                error: 'ID non valido',
                message: 'L\'ID del volantino non è nel formato corretto'
            });
        }

        const volantino = await Volantino.findById(id);

        if (!volantino) {
            return res.status(404).json({
                success: false,
                error: 'Volantino non trovato',
                message: 'Il volantino richiesto non esiste'
            });
        }

        // Incrementa il contatore dei download
        await volantino.incrementDownload();

        res.json({
            success: true,
            message: 'Download registrato con successo',
            data: {
                id: volantino._id,
                downloadCount: volantino.downloadCount
            }
        });

    } catch (error) {
        console.error('Errore nella registrazione del download:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile registrare il download'
        });
    }
});

// GET /api/flyers/categories/stats - Statistiche per categoria
router.get('/categories/stats', async (req, res) => {
    try {
        const stats = await Volantino.aggregate([
            {
                $match: {
                    isActive: true,
                    validTo: { $gte: new Date() }
                }
            },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    totalDownloads: { $sum: '$downloadCount' },
                    totalViews: { $sum: '$viewCount' },
                    avgPages: { $avg: '$pages' }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Errore nel recupero delle statistiche:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile recuperare le statistiche'
        });
    }
});

// POST /api/flyers - Crea un nuovo volantino (per admin/upload)
router.post('/', [
    body('store').notEmpty().trim().isLength({ max: 100 }).withMessage('Nome negozio obbligatorio (max 100 caratteri)'),
    body('location.address').notEmpty().trim().withMessage('Indirizzo obbligatorio'),
    body('location.city').notEmpty().trim().withMessage('Città obbligatoria'),
    body('location.cap').matches(/^[0-9]{5}$/).withMessage('CAP deve essere di 5 cifre'),
    body('location.coordinates.lat').isFloat({ min: -90, max: 90 }).withMessage('Latitudine non valida'),
    body('location.coordinates.lng').isFloat({ min: -180, max: 180 }).withMessage('Longitudine non valida'),
    body('validFrom').isISO8601().withMessage('Data di inizio non valida'),
    body('validTo').isISO8601().withMessage('Data di fine non valida'),
    body('pages').isInt({ min: 1, max: 50 }).withMessage('Numero pagine deve essere tra 1 e 50'),
    body('category').isIn(['Supermercato', 'Discount', 'Elettronica', 'Abbigliamento', 'Casa e Giardino', 'Sport', 'Farmacia', 'Altro']).withMessage('Categoria non valida'),
    body('pdfUrl').notEmpty().withMessage('URL PDF obbligatorio'),
    body('fileSize').matches(/^[0-9]+(\.[0-9]+)?\s?(KB|MB|GB)$/i).withMessage('Formato file size non valido')
], handleValidationErrors, async (req, res) => {
    try {
        const volantinoData = req.body;
        
        // Verifica che la data di fine sia successiva alla data di inizio
        if (new Date(volantinoData.validFrom) >= new Date(volantinoData.validTo)) {
            return res.status(400).json({
                success: false,
                error: 'Date non valide',
                message: 'La data di fine deve essere successiva alla data di inizio'
            });
        }

        const volantino = new Volantino(volantinoData);
        await volantino.save();

        res.status(201).json({
            success: true,
            message: 'Volantino creato con successo',
            data: volantino
        });

    } catch (error) {
        console.error('Errore nella creazione del volantino:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                error: 'Dati non validi',
                details: Object.values(error.errors).map(err => err.message)
            });
        }

        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile creare il volantino'
        });
    }
});

module.exports = router;