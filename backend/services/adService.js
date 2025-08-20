const Advertisement = require('../models/Advertisement');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
// const sharp = require('sharp'); // Temporarily commented due to Node.js version compatibility

class AdService {
    constructor() {
        this.adCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minuti
    }

    /**
     * Ottiene le pubblicità da inserire nel PDF basate sui volantini selezionati
     * @param {Array} volantini - Array dei volantini selezionati
     * @param {Object} userLocation - Posizione dell'utente
     * @param {Array} positions - Posizioni dove inserire le pubblicità
     * @returns {Promise<Array>} Array delle pubblicità da inserire
     */
    async getAdsForPDF(volantini, userLocation = {}, positions = ['cover', 'intermediate', 'final']) {
        try {
            const adsToInclude = [];
            const categories = [...new Set(volantini.map(v => v.category))];
            const mainCategory = this.getMostFrequentCategory(categories);

            for (const position of positions) {
                let ads = [];
                
                switch (position) {
                    case 'cover':
                        ads = await this.getCoverAds(mainCategory, userLocation);
                        break;
                    case 'intermediate':
                        ads = await this.getIntermediateAds(categories, userLocation, volantini.length - 1);
                        break;
                    case 'final':
                        ads = await this.getFinalAds(mainCategory, userLocation);
                        break;
                }
                
                adsToInclude.push(...ads.map(ad => ({ ...ad, position })));
            }

            // Registra le impressioni per le pubblicità selezionate
            await this.recordImpressions(adsToInclude);

            return adsToInclude;

        } catch (error) {
            console.error('Errore nel recupero delle pubblicità per PDF:', error);
            return [];
        }
    }

    /**
     * Ottiene pubblicità per la copertina
     */
    async getCoverAds(category, userLocation, limit = 1) {
        const cacheKey = `cover_${category}_${JSON.stringify(userLocation)}`;
        
        if (this.adCache.has(cacheKey)) {
            const cached = this.adCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        const query = {
            position: 'cover',
            isActive: true,
            startDate: { $lte: new Date() },
            $or: [
                { endDate: { $exists: false } },
                { endDate: { $gte: new Date() } }
            ]
        };

        // Priorità: Sponsor > Categoria specifica > Generale
        const priorities = [
            { ...query, category: 'Sponsor' },
            { ...query, category: category },
            { ...query, category: 'Generale' }
        ];

        let ads = [];
        for (const priorityQuery of priorities) {
            ads = await Advertisement.find(priorityQuery)
                .sort({ priority: -1, 'metrics.ctr': -1 })
                .limit(limit)
                .lean();
            
            if (ads.length > 0) break;
        }

        // Applica targeting geografico se disponibile
        if (userLocation.city || userLocation.cap) {
            ads = this.applyGeoTargeting(ads, userLocation);
        }

        // Cache del risultato
        this.adCache.set(cacheKey, {
            data: ads,
            timestamp: Date.now()
        });

        return ads;
    }

    /**
     * Ottiene pubblicità intermedie
     */
    async getIntermediateAds(categories, userLocation, maxAds) {
        const ads = [];
        const usedAdIds = new Set();

        for (let i = 0; i < maxAds && i < categories.length; i++) {
            const category = categories[i % categories.length];
            
            const query = {
                position: 'intermediate',
                isActive: true,
                startDate: { $lte: new Date() },
                $or: [
                    { endDate: { $exists: false } },
                    { endDate: { $gte: new Date() } }
                ],
                _id: { $nin: Array.from(usedAdIds) }
            };

            // Cerca per categoria specifica o generale
            const categoryAds = await Advertisement.find({
                ...query,
                $or: [
                    { category: category },
                    { category: 'Generale' }
                ]
            })
            .sort({ priority: -1, 'metrics.ctr': -1 })
            .limit(1)
            .lean();

            if (categoryAds.length > 0) {
                const selectedAd = categoryAds[0];
                ads.push(selectedAd);
                usedAdIds.add(selectedAd._id);
            }
        }

        // Applica targeting geografico
        if (userLocation.city || userLocation.cap) {
            return this.applyGeoTargeting(ads, userLocation);
        }

        return ads;
    }

    /**
     * Ottiene pubblicità finali
     */
    async getFinalAds(category, userLocation, limit = 1) {
        const query = {
            position: 'final',
            isActive: true,
            startDate: { $lte: new Date() },
            $or: [
                { endDate: { $exists: false } },
                { endDate: { $gte: new Date() } }
            ]
        };

        const ads = await Advertisement.find({
            ...query,
            $or: [
                { category: category },
                { category: 'Generale' }
            ]
        })
        .sort({ priority: -1, 'metrics.ctr': -1 })
        .limit(limit)
        .lean();

        // Applica targeting geografico
        if (userLocation.city || userLocation.cap) {
            return this.applyGeoTargeting(ads, userLocation);
        }

        return ads;
    }

    /**
     * Applica il targeting geografico alle pubblicità
     */
    applyGeoTargeting(ads, userLocation) {
        return ads.filter(ad => {
            // Se l'ad non ha targeting, è valida per tutti
            if (!ad.targeting || 
                (!ad.targeting.cities?.length && !ad.targeting.caps?.length)) {
                return true;
            }

            // Verifica targeting per città
            if (userLocation.city && ad.targeting.cities?.length > 0) {
                return ad.targeting.cities.includes(userLocation.city);
            }

            // Verifica targeting per CAP
            if (userLocation.cap && ad.targeting.caps?.length > 0) {
                return ad.targeting.caps.includes(userLocation.cap);
            }

            return true;
        });
    }

    /**
     * Crea una pagina PDF per una pubblicità
     */
    async createAdPage(pdfDoc, ad, pageSize = [595.28, 841.89]) {
        try {
            const page = pdfDoc.addPage(pageSize);
            const { width, height } = page.getSize();
            
            // Margini
            const margin = 50;
            const contentWidth = width - (margin * 2);
            const contentHeight = height - (margin * 2);

            // Colori
            const primaryColor = { r: 0.2, g: 0.4, b: 0.8 }; // Blu elettrico
            const textColor = { r: 0.1, g: 0.1, b: 0.1 };
            const accentColor = { r: 0.0, g: 0.7, b: 0.3 }; // Verde accento

            // Sfondo con gradiente simulato
            page.drawRectangle({
                x: 0,
                y: 0,
                width: width,
                height: height,
                color: { r: 0.98, g: 0.98, b: 1.0 }
            });

            // Header con logo VolantinoMix
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
                color: { r: 1, g: 1, b: 1 }
            });

            page.drawText('Pubblicità', {
                x: width - 150,
                y: height - 50,
                size: 14,
                color: { r: 0.9, g: 0.9, b: 0.9 }
            });

            // Contenuto principale
            let currentY = height - 150;

            // Titolo dell'annuncio
            page.drawText(ad.title, {
                x: margin,
                y: currentY,
                size: 28,
                color: primaryColor
            });
            currentY -= 60;

            // Descrizione
            const descriptionLines = this.wrapText(ad.description, contentWidth, 16);
            for (const line of descriptionLines) {
                page.drawText(line, {
                    x: margin,
                    y: currentY,
                    size: 16,
                    color: textColor
                });
                currentY -= 25;
            }

            currentY -= 20;

            // Box per l'immagine (placeholder)
            const imageHeight = 200;
            page.drawRectangle({
                x: margin,
                y: currentY - imageHeight,
                width: contentWidth,
                height: imageHeight,
                borderColor: { r: 0.8, g: 0.8, b: 0.8 },
                borderWidth: 2
            });

            page.drawText('Immagine Pubblicitaria', {
                x: margin + (contentWidth / 2) - 80,
                y: currentY - (imageHeight / 2),
                size: 14,
                color: { r: 0.6, g: 0.6, b: 0.6 }
            });

            page.drawText(`[${ad.imageUrl}]`, {
                x: margin + (contentWidth / 2) - 100,
                y: currentY - (imageHeight / 2) - 20,
                size: 10,
                color: { r: 0.5, g: 0.5, b: 0.5 }
            });

            currentY -= imageHeight + 40;

            // Call to action
            const ctaWidth = 300;
            const ctaHeight = 50;
            const ctaX = margin + (contentWidth - ctaWidth) / 2;

            page.drawRectangle({
                x: ctaX,
                y: currentY - ctaHeight,
                width: ctaWidth,
                height: ctaHeight,
                color: accentColor
            });

            page.drawText('CLICCA PER MAGGIORI INFO', {
                x: ctaX + 50,
                y: currentY - 30,
                size: 14,
                color: { r: 1, g: 1, b: 1 }
            });

            currentY -= ctaHeight + 20;

            // URL
            page.drawText(`Visita: ${ad.clickUrl}`, {
                x: margin,
                y: currentY,
                size: 12,
                color: primaryColor
            });

            // Footer
            page.drawText(`Categoria: ${ad.category}`, {
                x: margin,
                y: 50,
                size: 10,
                color: { r: 0.5, g: 0.5, b: 0.5 }
            });

            page.drawText(`Inserzionista: ${ad.advertiser.name}`, {
                x: width - 200,
                y: 50,
                size: 10,
                color: { r: 0.5, g: 0.5, b: 0.5 }
            });

            // Bordo decorativo
            page.drawRectangle({
                x: margin - 10,
                y: margin - 10,
                width: contentWidth + 20,
                height: contentHeight + 20,
                borderColor: accentColor,
                borderWidth: 3
            });

            return page;

        } catch (error) {
            console.error('Errore nella creazione della pagina pubblicitaria:', error);
            throw error;
        }
    }

    /**
     * Registra le impressioni per le pubblicità
     */
    async recordImpressions(ads) {
        const promises = ads.map(async (ad) => {
            try {
                const advertisement = await Advertisement.findById(ad._id);
                if (advertisement) {
                    await advertisement.recordImpression();
                }
            } catch (error) {
                console.error(`Errore nella registrazione impressione per ${ad._id}:`, error);
            }
        });

        await Promise.allSettled(promises);
    }

    /**
     * Ottiene la categoria più frequente
     */
    getMostFrequentCategory(categories) {
        const frequency = {};
        categories.forEach(cat => {
            frequency[cat] = (frequency[cat] || 0) + 1;
        });

        return Object.keys(frequency).reduce((a, b) => 
            frequency[a] > frequency[b] ? a : b
        );
    }

    /**
     * Divide il testo in righe per adattarlo alla larghezza
     */
    wrapText(text, maxWidth, fontSize) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        const avgCharWidth = fontSize * 0.6; // Approssimazione
        const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth);

        for (const word of words) {
            if ((currentLine + word).length <= maxCharsPerLine) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                if (currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    lines.push(word);
                }
            }
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines;
    }

    /**
     * Pulisce la cache delle pubblicità
     */
    clearCache() {
        this.adCache.clear();
    }

    /**
     * Ottiene statistiche sulle pubblicità inserite
     */
    async getAdInsertionStats(timeframe = 24) {
        const since = new Date(Date.now() - timeframe * 60 * 60 * 1000);
        
        const stats = await Advertisement.aggregate([
            {
                $match: {
                    'metrics.lastClick': { $gte: since }
                }
            },
            {
                $group: {
                    _id: '$position',
                    totalImpressions: { $sum: '$metrics.dailyImpressions' },
                    totalClicks: { $sum: '$metrics.dailyClicks' },
                    avgCTR: { $avg: '$metrics.ctr' },
                    count: { $sum: 1 }
                }
            }
        ]);

        return stats;
    }

    /**
     * Ottiene pubblicità consigliate per la sidebar
     */
    async getRecommendedAds(categories, userLocation, limit = 5) {
        const query = {
            position: 'sidebar',
            isActive: true,
            startDate: { $lte: new Date() },
            $or: [
                { endDate: { $exists: false } },
                { endDate: { $gte: new Date() } }
            ]
        };

        if (categories && categories.length > 0) {
            query.$or = [
                { category: { $in: categories } },
                { category: 'Generale' }
            ];
        }

        let ads = await Advertisement.find(query)
            .sort({ 'metrics.ctr': -1, priority: -1 })
            .limit(limit * 2) // Prendi più ads per il filtering
            .lean();

        // Applica targeting geografico
        if (userLocation.city || userLocation.cap) {
            ads = this.applyGeoTargeting(ads, userLocation);
        }

        return ads.slice(0, limit);
    }
}

module.exports = new AdService();