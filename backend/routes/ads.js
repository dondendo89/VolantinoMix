const express = require('express');
const router = express.Router();
const Advertisement = require('../models/Advertisement');
const { body, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

// Rate limiting per le API delle pubblicità
const adsRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minuti
    max: 200, // massimo 200 richieste per IP (più alto perché le ads vengono caricate frequentemente)
    message: {
        error: 'Troppe richieste per le pubblicità, riprova tra 15 minuti',
        code: 'ADS_RATE_LIMIT_EXCEEDED'
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
router.use(adsRateLimit);

// GET /api/ads - Ottieni pubblicità attive
router.get('/', [
    query('position').optional().isIn(['cover', 'intermediate', 'final', 'sidebar']).withMessage('Posizione non valida'),
    query('category').optional().isIn(['Supermercato', 'Discount', 'Elettronica', 'Abbigliamento', 'Casa e Giardino', 'Sport', 'Farmacia', 'Sponsor', 'Generale', 'Altro']).withMessage('Categoria non valida'),
    query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Il limite deve essere tra 1 e 20'),
    query('city').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Nome città non valido'),
    query('cap').optional().matches(/^[0-9]{5}$/).withMessage('CAP deve essere di 5 cifre')
], handleValidationErrors, async (req, res) => {
    try {
        const { position, category, limit = 5, city, cap } = req.query;

        // Costruisci la query base
        const query = {
            isActive: true,
            startDate: { $lte: new Date() },
            $or: [
                { endDate: { $exists: false } },
                { endDate: { $gte: new Date() } }
            ]
        };

        // Aggiungi filtri opzionali
        if (position) {
            query.position = position;
        }

        if (category) {
            query.category = category;
        }

        // Aggiungi targeting geografico se fornito
        if (city || cap) {
            const targetingQuery = { $or: [] };
            
            if (city) {
                targetingQuery.$or.push({ 'targeting.cities': city });
            }
            
            if (cap) {
                targetingQuery.$or.push({ 'targeting.caps': cap });
            }
            
            // Includi anche ads senza targeting specifico
            targetingQuery.$or.push({ 'targeting.cities': { $size: 0 } });
            targetingQuery.$or.push({ 'targeting.caps': { $size: 0 } });
            
            query.$and = [query, targetingQuery];
        }

        const ads = await Advertisement.find(query)
            .sort({ priority: -1, 'metrics.ctr': -1, createdAt: -1 })
            .limit(parseInt(limit))
            .select('-__v -metadata.notes')
            .lean();

        // Registra le impressioni per le ads restituite
        const impressionPromises = ads.map(async (ad) => {
            try {
                const advertisement = await Advertisement.findById(ad._id);
                if (advertisement) {
                    await advertisement.recordImpression();
                }
            } catch (error) {
                console.error(`Errore nella registrazione impressione per ad ${ad._id}:`, error);
            }
        });

        // Esegui le registrazioni in background
        Promise.all(impressionPromises).catch(error => {
            console.error('Errore nelle registrazioni delle impressioni:', error);
        });

        res.json({
            success: true,
            data: ads,
            count: ads.length,
            filters: {
                position,
                category,
                city,
                cap,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Errore nel recupero delle pubblicità:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile recuperare le pubblicità'
        });
    }
});

// GET /api/ads/recommended - Ottieni pubblicità consigliate
router.get('/recommended', [
    query('category').optional().isIn(['Supermercato', 'Discount', 'Elettronica', 'Abbigliamento', 'Casa e Giardino', 'Sport', 'Farmacia', 'Sponsor', 'Generale', 'Altro']).withMessage('Categoria non valida'),
    query('limit').optional().isInt({ min: 1, max: 10 }).withMessage('Il limite deve essere tra 1 e 10'),
    query('excludeIds').optional().isArray().withMessage('excludeIds deve essere un array')
], handleValidationErrors, async (req, res) => {
    try {
        const { category, limit = 5, excludeIds = [] } = req.query;

        const query = {
            isActive: true,
            position: { $in: ['sidebar', 'final'] },
            startDate: { $lte: new Date() },
            $or: [
                { endDate: { $exists: false } },
                { endDate: { $gte: new Date() } }
            ]
        };

        if (category) {
            query.$or = [
                { category: category },
                { category: 'Generale' }
            ];
        }

        if (excludeIds.length > 0) {
            query._id = { $nin: excludeIds };
        }

        const ads = await Advertisement.find(query)
            .sort({ 'metrics.ctr': -1, priority: -1 })
            .limit(parseInt(limit))
            .select('title description imageUrl clickUrl category metrics.ctr')
            .lean();

        res.json({
            success: true,
            data: ads,
            count: ads.length
        });

    } catch (error) {
        console.error('Errore nel recupero delle pubblicità consigliate:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile recuperare le pubblicità consigliate'
        });
    }
});

// GET /api/ads/top-performing - Ottieni le pubblicità con migliori performance
router.get('/top-performing', [
    query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Il limite deve essere tra 1 e 20'),
    query('minImpressions').optional().isInt({ min: 1 }).withMessage('Minimo impressioni deve essere positivo')
], handleValidationErrors, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const minImpressions = parseInt(req.query.minImpressions) || 100;

        const ads = await Advertisement.findTopPerforming(limit);
        
        // Filtra per minimo impressioni
        const filteredAds = ads.filter(ad => ad.metrics.impressions >= minImpressions);

        res.json({
            success: true,
            data: filteredAds,
            count: filteredAds.length,
            criteria: {
                minImpressions,
                limit
            }
        });

    } catch (error) {
        console.error('Errore nel recupero delle pubblicità top performing:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile recuperare le pubblicità top performing'
        });
    }
});

// POST /api/ads/:id/click - Registra un click su una pubblicità
router.post('/:id/click', async (req, res) => {
    try {
        const { id } = req.params;

        // Verifica che l'ID sia un ObjectId valido
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                error: 'ID non valido',
                message: 'L\'ID della pubblicità non è nel formato corretto'
            });
        }

        const ad = await Advertisement.findById(id);

        if (!ad) {
            return res.status(404).json({
                success: false,
                error: 'Pubblicità non trovata',
                message: 'La pubblicità richiesta non esiste'
            });
        }

        if (!ad.isCurrentlyActive) {
            return res.status(400).json({
                success: false,
                error: 'Pubblicità non attiva',
                message: 'La pubblicità non è più attiva'
            });
        }

        // Registra il click
        await ad.recordClick();

        // Verifica se il budget è stato esaurito
        await ad.checkBudgetLimit();

        res.json({
            success: true,
            message: 'Click registrato con successo',
            data: {
                id: ad._id,
                clickUrl: ad.clickUrl,
                totalClicks: ad.metrics.clicks,
                ctr: ad.calculatedCTR
            }
        });

    } catch (error) {
        console.error('Errore nella registrazione del click:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile registrare il click'
        });
    }
});

// GET /api/ads/stats - Statistiche generali delle pubblicità
router.get('/stats', async (req, res) => {
    try {
        const stats = await Advertisement.aggregate([
            {
                $match: {
                    isActive: true
                }
            },
            {
                $group: {
                    _id: null,
                    totalAds: { $sum: 1 },
                    totalImpressions: { $sum: '$metrics.impressions' },
                    totalClicks: { $sum: '$metrics.clicks' },
                    avgCTR: { $avg: '$metrics.ctr' },
                    totalBudgetSpent: { $sum: '$budget.spent' }
                }
            }
        ]);

        const categoryStats = await Advertisement.aggregate([
            {
                $match: {
                    isActive: true
                }
            },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    totalImpressions: { $sum: '$metrics.impressions' },
                    totalClicks: { $sum: '$metrics.clicks' },
                    avgCTR: { $avg: '$metrics.ctr' }
                }
            },
            {
                $sort: { totalImpressions: -1 }
            }
        ]);

        const positionStats = await Advertisement.aggregate([
            {
                $match: {
                    isActive: true
                }
            },
            {
                $group: {
                    _id: '$position',
                    count: { $sum: 1 },
                    totalImpressions: { $sum: '$metrics.impressions' },
                    totalClicks: { $sum: '$metrics.clicks' },
                    avgCTR: { $avg: '$metrics.ctr' }
                }
            },
            {
                $sort: { avgCTR: -1 }
            }
        ]);

        res.json({
            success: true,
            data: {
                overall: stats[0] || {
                    totalAds: 0,
                    totalImpressions: 0,
                    totalClicks: 0,
                    avgCTR: 0,
                    totalBudgetSpent: 0
                },
                byCategory: categoryStats,
                byPosition: positionStats
            }
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

// POST /api/ads - Crea una nuova pubblicità (per admin)
router.post('/', [
    body('title').notEmpty().trim().isLength({ max: 100 }).withMessage('Titolo obbligatorio (max 100 caratteri)'),
    body('description').notEmpty().trim().isLength({ max: 500 }).withMessage('Descrizione obbligatoria (max 500 caratteri)'),
    body('imageUrl').isURL().withMessage('URL immagine non valido'),
    body('clickUrl').isURL().withMessage('URL destinazione non valido'),
    body('category').isIn(['Supermercato', 'Discount', 'Elettronica', 'Abbigliamento', 'Casa e Giardino', 'Sport', 'Farmacia', 'Sponsor', 'Generale', 'Altro']).withMessage('Categoria non valida'),
    body('position').isIn(['cover', 'intermediate', 'final', 'sidebar']).withMessage('Posizione non valida'),
    body('priority').isInt({ min: 1, max: 10 }).withMessage('Priorità deve essere tra 1 e 10'),
    body('advertiser.name').notEmpty().trim().isLength({ max: 100 }).withMessage('Nome inserzionista obbligatorio'),
    body('advertiser.email').optional().isEmail().withMessage('Email non valida'),
    body('advertiser.website').optional().isURL().withMessage('Sito web non valido')
], handleValidationErrors, async (req, res) => {
    try {
        const adData = req.body;
        
        // Verifica che le date siano valide se fornite
        if (adData.endDate && adData.startDate) {
            if (new Date(adData.startDate) >= new Date(adData.endDate)) {
                return res.status(400).json({
                    success: false,
                    error: 'Date non valide',
                    message: 'La data di fine deve essere successiva alla data di inizio'
                });
            }
        }

        const ad = new Advertisement(adData);
        await ad.save();

        res.status(201).json({
            success: true,
            message: 'Pubblicità creata con successo',
            data: ad
        });

    } catch (error) {
        console.error('Errore nella creazione della pubblicità:', error);
        
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
            message: 'Impossibile creare la pubblicità'
        });
    }
});

// PUT /api/ads/:id - Aggiorna una pubblicità (per admin)
router.put('/:id', [
    body('title').optional().trim().isLength({ max: 100 }).withMessage('Titolo troppo lungo (max 100 caratteri)'),
    body('description').optional().trim().isLength({ max: 500 }).withMessage('Descrizione troppo lunga (max 500 caratteri)'),
    body('imageUrl').optional().isURL().withMessage('URL immagine non valido'),
    body('clickUrl').optional().isURL().withMessage('URL destinazione non valido'),
    body('category').optional().isIn(['Supermercato', 'Discount', 'Elettronica', 'Abbigliamento', 'Casa e Giardino', 'Sport', 'Farmacia', 'Sponsor', 'Generale', 'Altro']).withMessage('Categoria non valida'),
    body('position').optional().isIn(['cover', 'intermediate', 'final', 'sidebar']).withMessage('Posizione non valida'),
    body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priorità deve essere tra 1 e 10'),
    body('isActive').optional().isBoolean().withMessage('isActive deve essere un booleano')
], handleValidationErrors, async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Verifica che l'ID sia un ObjectId valido
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                error: 'ID non valido',
                message: 'L\'ID della pubblicità non è nel formato corretto'
            });
        }

        const ad = await Advertisement.findByIdAndUpdate(
            id,
            { ...updateData, 'metadata.lastModified': new Date() },
            { new: true, runValidators: true }
        );

        if (!ad) {
            return res.status(404).json({
                success: false,
                error: 'Pubblicità non trovata',
                message: 'La pubblicità richiesta non esiste'
            });
        }

        res.json({
            success: true,
            message: 'Pubblicità aggiornata con successo',
            data: ad
        });

    } catch (error) {
        console.error('Errore nell\'aggiornamento della pubblicità:', error);
        
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
            message: 'Impossibile aggiornare la pubblicità'
        });
    }
});

// DELETE /api/ads/:id - Elimina una pubblicità (per admin)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Verifica che l'ID sia un ObjectId valido
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                error: 'ID non valido',
                message: 'L\'ID della pubblicità non è nel formato corretto'
            });
        }

        const ad = await Advertisement.findByIdAndDelete(id);

        if (!ad) {
            return res.status(404).json({
                success: false,
                error: 'Pubblicità non trovata',
                message: 'La pubblicità richiesta non esiste'
            });
        }

        res.json({
            success: true,
            message: 'Pubblicità eliminata con successo',
            data: {
                id: ad._id,
                title: ad.title
            }
        });

    } catch (error) {
        console.error('Errore nell\'eliminazione della pubblicità:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile eliminare la pubblicità'
        });
    }
});

module.exports = router;