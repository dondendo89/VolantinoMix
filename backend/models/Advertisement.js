const mongoose = require('mongoose');

// Schema per le metriche delle pubblicità
const metricsSchema = new mongoose.Schema({
    impressions: {
        type: Number,
        default: 0,
        min: 0
    },
    clicks: {
        type: Number,
        default: 0,
        min: 0
    },
    ctr: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    lastClick: {
        type: Date
    },
    dailyImpressions: {
        type: Number,
        default: 0,
        min: 0
    },
    dailyClicks: {
        type: Number,
        default: 0,
        min: 0
    }
}, { _id: false });

// Schema per il targeting geografico
const targetingSchema = new mongoose.Schema({
    cities: [{
        type: String,
        trim: true
    }],
    caps: [{
        type: String,
        match: /^[0-9]{5}$/
    }],
    radius: {
        type: Number,
        min: 1,
        max: 100,
        default: 10
    },
    coordinates: {
        lat: {
            type: Number,
            min: -90,
            max: 90
        },
        lng: {
            type: Number,
            min: -180,
            max: 180
        }
    }
}, { _id: false });

// Schema principale per le pubblicità
const advertisementSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Il titolo della pubblicità è obbligatorio'],
        trim: true,
        maxlength: [100, 'Il titolo non può superare i 100 caratteri'],
        index: true
    },
    description: {
        type: String,
        required: [true, 'La descrizione è obbligatoria'],
        trim: true,
        maxlength: [500, 'La descrizione non può superare i 500 caratteri']
    },
    imageUrl: {
        type: String,
        required: [true, 'L\'URL dell\'immagine è obbligatorio'],
        validate: {
            validator: function(value) {
                return /\.(jpg|jpeg|png|webp|gif)$/i.test(value) || /^https?:\/\/.+/.test(value);
            },
            message: 'URL dell\'immagine non valido'
        }
    },
    clickUrl: {
        type: String,
        required: [true, 'L\'URL di destinazione è obbligatorio'],
        validate: {
            validator: function(value) {
                return /^https?:\/\/.+/.test(value);
            },
            message: 'URL di destinazione non valido'
        }
    },
    category: {
        type: String,
        required: true,
        enum: {
            values: ['Supermercato', 'Discount', 'Elettronica', 'Abbigliamento', 'Casa e Giardino', 'Sport', 'Farmacia', 'Sponsor', 'Generale', 'Altro'],
            message: 'Categoria non valida'
        },
        index: true
    },
    position: {
        type: String,
        required: true,
        enum: {
            values: ['cover', 'intermediate', 'final', 'sidebar'],
            message: 'Posizione non valida'
        },
        index: true
    },
    priority: {
        type: Number,
        required: true,
        min: [1, 'La priorità deve essere almeno 1'],
        max: [10, 'La priorità non può superare 10'],
        default: 5,
        index: true
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    startDate: {
        type: Date,
        default: Date.now,
        index: true
    },
    endDate: {
        type: Date,
        validate: {
            validator: function(value) {
                if (!value) return true; // Campo opzionale
                return value > this.startDate;
            },
            message: 'La data di fine deve essere successiva alla data di inizio'
        },
        index: true
    },
    targeting: {
        type: targetingSchema,
        default: {}
    },
    metrics: {
        type: metricsSchema,
        default: {}
    },
    budget: {
        daily: {
            type: Number,
            min: 0,
            default: 0
        },
        total: {
            type: Number,
            min: 0,
            default: 0
        },
        spent: {
            type: Number,
            min: 0,
            default: 0
        },
        costPerClick: {
            type: Number,
            min: 0,
            default: 0
        }
    },
    advertiser: {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },
        email: {
            type: String,
            validate: {
                validator: function(value) {
                    if (!value) return true; // Campo opzionale
                    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
                },
                message: 'Email non valida'
            }
        },
        website: {
            type: String,
            validate: {
                validator: function(value) {
                    if (!value) return true; // Campo opzionale
                    return /^https?:\/\/.+/.test(value);
                },
                message: 'URL del sito web non valido'
            }
        }
    },
    tags: [{
        type: String,
        trim: true,
        maxlength: 30
    }],
    metadata: {
        createdBy: {
            type: String,
            default: 'system'
        },
        lastModified: {
            type: Date,
            default: Date.now
        },
        approvalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'approved'
        },
        notes: {
            type: String,
            maxlength: 1000
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indici composti per ottimizzare le query
advertisementSchema.index({ category: 1, position: 1, isActive: 1, priority: -1 });
advertisementSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
advertisementSchema.index({ 'targeting.cities': 1, isActive: 1 });
advertisementSchema.index({ 'targeting.caps': 1, isActive: 1 });
advertisementSchema.index({ priority: -1, 'metrics.ctr': -1 });

// Virtual per verificare se la pubblicità è attiva
advertisementSchema.virtual('isCurrentlyActive').get(function() {
    const now = new Date();
    const startValid = this.startDate <= now;
    const endValid = !this.endDate || this.endDate >= now;
    return this.isActive && startValid && endValid;
});

// Virtual per calcolare il CTR
advertisementSchema.virtual('calculatedCTR').get(function() {
    if (this.metrics.impressions === 0) return 0;
    return (this.metrics.clicks / this.metrics.impressions * 100).toFixed(2);
});

// Virtual per verificare se il budget è esaurito
advertisementSchema.virtual('budgetExhausted').get(function() {
    if (this.budget.total === 0) return false;
    return this.budget.spent >= this.budget.total;
});

// Middleware pre-save per aggiornare CTR e lastModified
advertisementSchema.pre('save', function(next) {
    // Aggiorna CTR
    if (this.metrics.impressions > 0) {
        this.metrics.ctr = (this.metrics.clicks / this.metrics.impressions * 100);
    }
    
    // Aggiorna lastModified se modificato
    if (this.isModified() && !this.isNew) {
        this.metadata.lastModified = new Date();
    }
    
    next();
});

// Middleware pre-save per validare le date
advertisementSchema.pre('save', function(next) {
    if (this.endDate && this.startDate >= this.endDate) {
        return next(new Error('La data di fine deve essere successiva alla data di inizio'));
    }
    next();
});

// Metodi statici
advertisementSchema.statics.findActiveByPosition = function(position, options = {}) {
    const query = {
        position: position,
        isActive: true,
        startDate: { $lte: new Date() },
        $or: [
            { endDate: { $exists: false } },
            { endDate: { $gte: new Date() } }
        ]
    };
    
    if (options.category) {
        query.category = options.category;
    }
    
    if (options.targeting) {
        if (options.targeting.city) {
            query['targeting.cities'] = options.targeting.city;
        }
        if (options.targeting.cap) {
            query['targeting.caps'] = options.targeting.cap;
        }
    }
    
    return this.find(query)
        .sort({ priority: -1, 'metrics.ctr': -1 })
        .limit(options.limit || 5);
};

advertisementSchema.statics.findByCategory = function(category, options = {}) {
    const query = {
        category: category,
        isActive: true,
        startDate: { $lte: new Date() },
        $or: [
            { endDate: { $exists: false } },
            { endDate: { $gte: new Date() } }
        ]
    };
    
    return this.find(query)
        .sort({ priority: -1, 'metrics.ctr': -1 })
        .limit(options.limit || 10);
};

advertisementSchema.statics.findTopPerforming = function(limit = 10) {
    return this.find({
        isActive: true,
        'metrics.impressions': { $gte: 100 } // Minimo 100 impressioni
    })
    .sort({ 'metrics.ctr': -1, 'metrics.clicks': -1 })
    .limit(limit);
};

advertisementSchema.statics.findExpiring = function(days = 7) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    return this.find({
        isActive: true,
        endDate: {
            $gte: new Date(),
            $lte: futureDate
        }
    }).sort({ endDate: 1 });
};

// Metodi di istanza
advertisementSchema.methods.recordImpression = function() {
    this.metrics.impressions += 1;
    this.metrics.dailyImpressions += 1;
    return this.save();
};

advertisementSchema.methods.recordClick = function() {
    this.metrics.clicks += 1;
    this.metrics.dailyClicks += 1;
    this.metrics.lastClick = new Date();
    
    // Aggiorna budget speso
    if (this.budget.costPerClick > 0) {
        this.budget.spent += this.budget.costPerClick;
    }
    
    return this.save();
};

advertisementSchema.methods.resetDailyMetrics = function() {
    this.metrics.dailyImpressions = 0;
    this.metrics.dailyClicks = 0;
    return this.save();
};

advertisementSchema.methods.deactivate = function() {
    this.isActive = false;
    this.metadata.lastModified = new Date();
    return this.save();
};

advertisementSchema.methods.updateTargeting = function(newTargeting) {
    this.targeting = { ...this.targeting.toObject(), ...newTargeting };
    this.metadata.lastModified = new Date();
    return this.save();
};

advertisementSchema.methods.checkBudgetLimit = function() {
    if (this.budget.total > 0 && this.budget.spent >= this.budget.total) {
        this.isActive = false;
        this.metadata.notes = 'Budget esaurito';
        return this.save();
    }
    return Promise.resolve(this);
};

// Middleware per la rimozione
advertisementSchema.pre('remove', function(next) {
    console.log(`Rimozione pubblicità: ${this.title} - ${this.advertiser.name}`);
    next();
});

// Esporta il modello
const Advertisement = mongoose.model('Advertisement', advertisementSchema);

module.exports = Advertisement;