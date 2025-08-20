const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { checkForDuplicates, checkDuplicatesWithAction } = require('../utils/duplicateChecker');
const Volantino = require('../models/Volantino');

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

// POST /api/duplicates/check - Controlla se un volantino è duplicato
router.post('/check', [
    body('store').notEmpty().withMessage('Store è obbligatorio'),
    body('category').notEmpty().withMessage('Category è obbligatorio'),
    body('pdfUrl').optional().isURL().withMessage('pdfUrl deve essere un URL valido'),
    body('pdfPath').optional().isString().withMessage('pdfPath deve essere una stringa'),
    body('validFrom').optional().isISO8601().withMessage('validFrom deve essere una data valida'),
    body('validTo').optional().isISO8601().withMessage('validTo deve essere una data valida')
], handleValidationErrors, async (req, res) => {
    try {
        const {
            store,
            category,
            pdfUrl,
            pdfPath,
            validFrom,
            validTo,
            strictMode = false,
            checkFileHash = false,
            checkDateOverlap = true
        } = req.body;

        const flyerData = {
            store,
            category,
            pdfUrl,
            pdfPath,
            validFrom: validFrom ? new Date(validFrom) : undefined,
            validTo: validTo ? new Date(validTo) : undefined
        };

        const options = {
            strictMode,
            checkFileHash,
            checkDateOverlap
        };

        const duplicateCheck = await checkForDuplicates(flyerData, options);

        res.json({
            success: true,
            data: {
                isDuplicate: duplicateCheck.isDuplicate,
                duplicatesFound: duplicateCheck.duplicates.length,
                duplicates: duplicateCheck.duplicates.map(d => ({
                    id: d._id,
                    store: d.store,
                    category: d.category,
                    pdfUrl: d.pdfUrl,
                    pdfPath: d.pdfPath,
                    validFrom: d.validFrom,
                    validTo: d.validTo,
                    source: d.source,
                    createdAt: d.createdAt
                })),
                reasons: duplicateCheck.reasons
            }
        });

    } catch (error) {
        console.error('Errore nel controllo duplicati:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile controllare i duplicati'
        });
    }
});

// POST /api/duplicates/check-with-action - Controlla duplicati e suggerisce azione
router.post('/check-with-action', [
    body('store').notEmpty().withMessage('Store è obbligatorio'),
    body('category').notEmpty().withMessage('Category è obbligatorio'),
    body('pdfUrl').optional().isURL().withMessage('pdfUrl deve essere un URL valido'),
    body('pdfPath').optional().isString().withMessage('pdfPath deve essere una stringa'),
    body('validFrom').optional().isISO8601().withMessage('validFrom deve essere una data valida'),
    body('validTo').optional().isISO8601().withMessage('validTo deve essere una data valida')
], handleValidationErrors, async (req, res) => {
    try {
        const {
            store,
            category,
            pdfUrl,
            pdfPath,
            validFrom,
            validTo,
            autoSkip = false,
            autoReplace = false,
            checkFileHash = false
        } = req.body;

        const flyerData = {
            store,
            category,
            pdfUrl,
            pdfPath,
            validFrom: validFrom ? new Date(validFrom) : undefined,
            validTo: validTo ? new Date(validTo) : undefined
        };

        const options = {
            autoSkip,
            autoReplace,
            checkFileHash
        };

        const actionCheck = await checkDuplicatesWithAction(flyerData, null, options);

        res.json({
            success: true,
            data: {
                isDuplicate: actionCheck.isDuplicate,
                action: actionCheck.action,
                message: actionCheck.message,
                duplicatesFound: actionCheck.duplicates.length,
                duplicates: actionCheck.duplicates.map(d => ({
                    id: d._id,
                    store: d.store,
                    category: d.category,
                    pdfUrl: d.pdfUrl,
                    pdfPath: d.pdfPath,
                    validFrom: d.validFrom,
                    validTo: d.validTo,
                    source: d.source,
                    createdAt: d.createdAt
                })),
                reasons: actionCheck.reasons
            }
        });

    } catch (error) {
        console.error('Errore nel controllo duplicati con azione:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile controllare i duplicati'
        });
    }
});

// GET /api/duplicates/stats - Statistiche sui duplicati nel database
router.get('/stats', async (req, res) => {
    try {
        // Conta volantini per source
        const sourceStats = await Volantino.aggregate([
            {
                $group: {
                    _id: '$source',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            }
        ]);

        // Trova potenziali duplicati basati su store + category
        const potentialDuplicates = await Volantino.aggregate([
            {
                $group: {
                    _id: {
                        store: '$store',
                        category: '$category'
                    },
                    count: { $sum: 1 },
                    volantini: { $push: {
                        id: '$_id',
                        pdfUrl: '$pdfUrl',
                        pdfPath: '$pdfPath',
                        validFrom: '$validFrom',
                        validTo: '$validTo',
                        source: '$source',
                        createdAt: '$createdAt'
                    }}
                }
            },
            {
                $match: { count: { $gt: 1 } }
            },
            {
                $sort: { count: -1 }
            }
        ]);

        // Conta totali
        const totalFlyers = await Volantino.countDocuments();
        const totalPotentialDuplicates = potentialDuplicates.reduce((sum, group) => sum + group.count, 0);

        res.json({
            success: true,
            data: {
                totalFlyers,
                totalPotentialDuplicates,
                sourceDistribution: sourceStats,
                potentialDuplicateGroups: potentialDuplicates.length,
                potentialDuplicates: potentialDuplicates.slice(0, 10) // Primi 10 gruppi
            }
        });

    } catch (error) {
        console.error('Errore nel recupero statistiche duplicati:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile recuperare le statistiche'
        });
    }
});

// DELETE /api/duplicates/remove - Rimuove duplicati automaticamente
router.delete('/remove', [
    body('dryRun').optional().isBoolean().withMessage('dryRun deve essere boolean'),
    body('keepNewest').optional().isBoolean().withMessage('keepNewest deve essere boolean')
], handleValidationErrors, async (req, res) => {
    try {
        const { dryRun = true, keepNewest = false } = req.body;
        
        // Trova gruppi di duplicati
        const duplicateGroups = await Volantino.aggregate([
            {
                $group: {
                    _id: {
                        store: '$store',
                        category: '$category',
                        pdfUrl: '$pdfUrl'
                    },
                    count: { $sum: 1 },
                    volantini: { $push: {
                        id: '$_id',
                        createdAt: '$createdAt',
                        source: '$source'
                    }}
                }
            },
            {
                $match: { count: { $gt: 1 } }
            }
        ]);

        let toDelete = [];
        let kept = [];

        duplicateGroups.forEach(group => {
            const sorted = group.volantini.sort((a, b) => {
                if (keepNewest) {
                    return new Date(b.createdAt) - new Date(a.createdAt);
                } else {
                    return new Date(a.createdAt) - new Date(b.createdAt);
                }
            });

            // Mantieni il primo (più vecchio o più nuovo), elimina gli altri
            kept.push(sorted[0]);
            toDelete.push(...sorted.slice(1));
        });

        let deletedCount = 0;
        if (!dryRun && toDelete.length > 0) {
            const deleteIds = toDelete.map(item => item.id);
            const deleteResult = await Volantino.deleteMany({
                _id: { $in: deleteIds }
            });
            deletedCount = deleteResult.deletedCount;
        }

        res.json({
            success: true,
            data: {
                dryRun,
                duplicateGroupsFound: duplicateGroups.length,
                totalDuplicates: toDelete.length,
                totalKept: kept.length,
                actuallyDeleted: deletedCount,
                toDelete: dryRun ? toDelete.slice(0, 5) : [], // Mostra solo primi 5 se dry run
                kept: kept.slice(0, 5) // Mostra solo primi 5
            }
        });

    } catch (error) {
        console.error('Errore nella rimozione duplicati:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: 'Impossibile rimuovere i duplicati'
        });
    }
});

module.exports = router;