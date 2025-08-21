const mongoose = require('mongoose');

// Schema per la posizione geografica
const locationSchema = new mongoose.Schema({
    address: {
        type: String,
        required: true,
        trim: true
    },
    city: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    cap: {
        type: String,
        required: true,
        match: /^[0-9]{5}$/,
        index: true
    },
    coordinates: {
        lat: {
            type: Number,
            required: true,
            min: -90,
            max: 90
        },
        lng: {
            type: Number,
            required: true,
            min: -180,
            max: 180
        }
    }
}, { _id: false });

// Schema principale per i volantini
const volantinoSchema = new mongoose.Schema({
    store: {
        type: String,
        required: [true, 'Il nome del negozio è obbligatorio'],
        trim: true,
        maxlength: [100, 'Il nome del negozio non può superare i 100 caratteri'],
        index: true
    },
    location: {
        type: locationSchema,
        required: true
    },
    validFrom: {
        type: Date,
        required: [true, 'La data di inizio validità è obbligatoria'],
        index: true
    },
    validTo: {
        type: Date,
        required: [true, 'La data di fine validità è obbligatoria'],
        validate: {
            validator: function(value) {
                return value > this.validFrom;
            },
            message: 'La data di fine deve essere successiva alla data di inizio'
        },
        index: true
    },
    pages: {
        type: Number,
        required: true,
        min: [1, 'Il volantino deve avere almeno 1 pagina'],
        max: [50, 'Il volantino non può avere più di 50 pagine']
    },
    category: {
        type: String,
        required: true,
        enum: {
            values: ['Supermercato', 'Discount', 'Elettronica', 'Abbigliamento', 'Casa e Giardino', 'Sport', 'Farmacia', 'Altro'],
            message: 'Categoria non valida'
        },
        index: true
    },
    pdfUrl: {
        type: String,
        required: [true, 'L\'URL del PDF è obbligatorio'],
        validate: {
            validator: function(value) {
                return /\.(pdf)$/i.test(value) || /^https?:\/\/.+/.test(value);
            },
            message: 'URL del PDF non valido'
        }
    },
    pdfPath: {
        type: String,
        validate: {
            validator: function(value) {
                if (!value) return true; // Campo opzionale
                return /\.(pdf)$/i.test(value);
            },
            message: 'Percorso del PDF non valido'
        }
    },
    thumbnailUrl: {
        type: String,
        validate: {
            validator: function(value) {
                if (!value) return true; // Campo opzionale
                return /\.(jpg|jpeg|png|webp)$/i.test(value) || /^https?:\/\/.+/.test(value);
            },
            message: 'URL della thumbnail non valido'
        }
    },
    fileSize: {
        type: String,
        required: true,
        match: /^[0-9]+(\.[0-9]+)?\s?(KB|MB|GB)$/i
    },
    downloadCount: {
        type: Number,
        default: 0,
        min: 0
    },
    viewCount: {
        type: Number,
        default: 0,
        min: 0
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    tags: [{
        type: String,
        trim: true,
        maxlength: 30
    }],
    uploadedBy: {
        type: String,
        default: 'system'
    },
    metadata: {
        originalFileName: String,
        uploadDate: {
            type: Date,
            default: Date.now
        },
        lastModified: {
            type: Date,
            default: Date.now
        },
        source: {
            type: String,
            enum: ['manual', 'google_drive', 'api', 'system', 'ipercoop', 'deco', 'eurospin', 'mersi'],
            default: 'system'
        }
    },
    source: {
        type: String,
        enum: ['manual', 'google_drive', 'api', 'system', 'ipercoop', 'deco', 'eurospin', 'mersi'],
        default: 'system',
        index: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indici composti per ottimizzare le query
volantinoSchema.index({ 'location.cap': 1, isActive: 1, validTo: 1 });
volantinoSchema.index({ 'location.coordinates': '2dsphere' });
volantinoSchema.index({ category: 1, isActive: 1, validTo: 1 });
volantinoSchema.index({ store: 1, isActive: 1 });
volantinoSchema.index({ validFrom: 1, validTo: 1 });

// Virtual per verificare se il volantino è ancora valido
volantinoSchema.virtual('isValid').get(function() {
    const now = new Date();
    return this.validFrom <= now && this.validTo >= now && this.isActive;
});

// Virtual per calcolare i giorni rimanenti
volantinoSchema.virtual('daysRemaining').get(function() {
    const now = new Date();
    const diffTime = this.validTo - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual per il nome completo della posizione
volantinoSchema.virtual('fullLocation').get(function() {
    return `${this.location.address}, ${this.location.city} (${this.location.cap})`;
});

// Middleware pre-save per aggiornare lastModified
volantinoSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.metadata.lastModified = new Date();
    }
    next();
});

// Middleware pre-save per validare le date
volantinoSchema.pre('save', function(next) {
    if (this.validFrom >= this.validTo) {
        return next(new Error('La data di fine deve essere successiva alla data di inizio'));
    }
    next();
});

// Metodi statici
volantinoSchema.statics.findByCAP = function(cap, options = {}) {
    const query = {
        'location.cap': cap,
        isActive: true,
        validTo: { $gte: new Date() }
    };
    
    if (options.category) {
        query.category = options.category;
    }
    
    return this.find(query)
        .sort({ validTo: 1, downloadCount: -1 })
        .limit(options.limit || 20);
};

volantinoSchema.statics.findByCoordinates = function(lat, lng, radiusKm = 10, options = {}) {
    const query = {
        'location.coordinates': {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: [lng, lat]
                },
                $maxDistance: radiusKm * 1000 // Converti km in metri
            }
        },
        isActive: true,
        validTo: { $gte: new Date() }
    };
    
    if (options.category) {
        query.category = options.category;
    }
    
    return this.find(query)
        .sort({ validTo: 1, downloadCount: -1 })
        .limit(options.limit || 20);
};

volantinoSchema.statics.findExpiringSoon = function(days = 3) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    return this.find({
        isActive: true,
        validTo: {
            $gte: new Date(),
            $lte: futureDate
        }
    }).sort({ validTo: 1 });
};

volantinoSchema.statics.getPopular = function(limit = 10) {
    return this.find({
        isActive: true,
        validTo: { $gte: new Date() }
    })
    .sort({ downloadCount: -1, viewCount: -1 })
    .limit(limit);
};

// Metodi di istanza
volantinoSchema.methods.incrementView = function() {
    this.viewCount += 1;
    return this.save();
};

volantinoSchema.methods.incrementDownload = function() {
    this.downloadCount += 1;
    return this.save();
};

volantinoSchema.methods.deactivate = function() {
    this.isActive = false;
    this.metadata.lastModified = new Date();
    return this.save();
};

volantinoSchema.methods.updateLocation = function(newLocation) {
    this.location = newLocation;
    this.metadata.lastModified = new Date();
    return this.save();
};

// Middleware per la rimozione
volantinoSchema.pre('remove', function(next) {
    // Qui potresti aggiungere logica per rimuovere i file PDF associati
    console.log(`Rimozione volantino: ${this.store} - ${this.location.city}`);
    next();
});

// Plugin per il soft delete (opzionale)
volantinoSchema.methods.softDelete = function() {
    this.isActive = false;
    this.metadata.lastModified = new Date();
    return this.save();
};

// Esporta il modello
const Volantino = mongoose.model('Volantino', volantinoSchema);

module.exports = Volantino;