const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import routes
const volantiniRoutes = require('./routes/flyers');
const pdfRoutes = require('./routes/pdfs');
const adsRoutes = require('./routes/ads');
const decoRoutes = require('./routes/deco');
const ipercoopRoutes = require('./routes/ipercoop');
const eurospinRoutes = require('./routes/eurospin');
const mersiRoutes = require('./routes/mersi');
const jobRoutes = require('./routes/jobs');
const duplicatesRoutes = require('./routes/duplicates');
const importRoutes = require('./routes/import');

// Import middleware (commented out as files don't exist yet)
// const errorHandler = require('./middleware/errorHandler');
// const notFound = require('./middleware/notFound');

// Import database connection
const { connectDB } = require('./config/database');

// Import job scheduler
const jobScheduler = require('./services/jobScheduler');

// Create Express app
const app = express();

// Connect to database (temporarily disabled - MongoDB not installed)
connectDB();

// Initialize job scheduler
setTimeout(() => {
    // Inizializza il job scheduler dopo che il database è connesso
    jobScheduler.init();
}, 2000);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://pagead2.googlesyndication.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.volantinomix.com"],
            objectSrc: ["'self'"],
            frameSrc: ["'self'", "http://localhost:3000", "http://localhost:5000"],
            childSrc: ["'self'"],
            frameAncestors: ["'self'", "http://localhost:3000", "http://localhost:5000"]
        }
    },
    frameguard: false // Disabilita X-Frame-Options per permettere iframe cross-origin
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // TEMPORANEO: aumentato per sviluppo (era 100)
    message: {
        error: 'Troppi tentativi, riprova tra 15 minuti'
    },
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api/', limiter);

// Stricter rate limiting for upload endpoints
const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // limit each IP to 10 uploads per hour
    message: {
        error: 'Limite upload raggiunto, riprova tra un\'ora'
    }
});

app.use('/api/upload', uploadLimiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Compression middleware
app.use(compression());

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5000',
            'https://volantinomix.com',
            'https://www.volantinomix.com',
            'https://volantinomix.vercel.app'
        ];
        
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Non autorizzato da CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0'
    });
});

// Admin interface route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Route per la pagina di amministrazione volantini
app.get('/admin/flyers', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'flyer-admin.html'));
});

app.get('/admin/import', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'import-admin.html'));
});

// Routes
app.use('/api/volantini', volantiniRoutes);
app.use('/api/pdfs', pdfRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/deco', decoRoutes);
app.use('/api/ipercoop', ipercoopRoutes);
app.use('/api/eurospin', eurospinRoutes);
app.use('/api/mersi', mersiRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/duplicates', duplicatesRoutes);
app.use('/api/import', importRoutes);

// API documentation endpoint
app.get('/api', (req, res) => {
    res.json({
        message: 'VolantinoMix API',
        version: '1.0.0',
        endpoints: {
            volantini: {
                'GET /api/volantini': 'Ottieni tutti i volantini',
                'GET /api/volantini/search': 'Cerca volantini per CAP o coordinate',
                'GET /api/volantini/:id': 'Ottieni volantino specifico',
                'POST /api/volantini': 'Crea nuovo volantino (auth richiesta)'
            },
            pdf: {
                'POST /api/pdf/merge': 'Unisci volantini selezionati in PDF',
                'GET /api/pdf/:id': 'Ottieni PDF generato',
                'GET /api/pdf/download/:id': 'Scarica PDF'
            },
            upload: {
                'POST /api/upload/pdf': 'Carica PDF volantino',
                'POST /api/upload/drive': 'Importa da Google Drive'
            },
            ads: {
                'GET /api/ads': 'Ottieni pubblicità disponibili',
                'GET /api/ads/recommended': 'Ottieni pubblicità consigliate'
            },
            geo: {
                'GET /api/geo/reverse': 'Geocoding inverso (coordinate -> indirizzo)',
                'GET /api/geo/forward': 'Geocoding diretto (indirizzo -> coordinate)'
            },
            auth: {
                'POST /api/auth/register': 'Registrazione utente',
                'POST /api/auth/login': 'Login utente',
                'GET /api/auth/profile': 'Profilo utente (auth richiesta)'
            }
        },
        documentation: 'https://docs.volantinomix.com'
    });
});

// Catch 404 and forward to error handler (commented out as files don't exist yet)
// app.use(notFound);

// Error handling middleware (commented out as files don't exist yet)
// app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 API URL: http://localhost:${PORT}/api`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;