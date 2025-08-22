// Vercel API entry point
const path = require('path');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Import routes
const adsRoutes = require('../backend/routes/ads');
const decoRoutes = require('../backend/routes/deco');
const duplicatesRoutes = require('../backend/routes/duplicates');
const eurospinRoutes = require('../backend/routes/eurospin');
const flyersRoutes = require('../backend/routes/flyers');
const importRoutes = require('../backend/routes/import');
const ipercoopRoutes = require('../backend/routes/ipercoop');
const jobsRoutes = require('../backend/routes/jobs');
const mersiRoutes = require('../backend/routes/mersi');
const pdfsRoutes = require('../backend/routes/pdfs');

// Import database connection
require('../backend/config/database');

const app = express();

// Trust proxy for Vercel
app.set('trust proxy', 1);

// Middleware
app.use(compression());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://volantino-mix.vercel.app', 'https://www.volantino-mix.vercel.app', 'https://volantinomix-production-d308.up.railway.app']
    : ['http://localhost:3000', 'http://localhost:5000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.1'
  });
});

// Admin routes - specific routes first
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../backend/public/admin.html'));
});

app.get('/admin/', (req, res) => {
  res.sendFile(path.join(__dirname, '../backend/public/admin.html'));
});

app.get('/admin/import', (req, res) => {
  res.sendFile(path.join(__dirname, '../backend/public/import-admin.html'));
});

app.get('/admin/flyer', (req, res) => {
  res.sendFile(path.join(__dirname, '../backend/public/flyer-admin.html'));
});

// Serve static files for admin assets (CSS, JS, etc.)
app.use('/admin', express.static(path.join(__dirname, '../backend/public')));

// Serve frontend static files from backend/public
app.use(express.static(path.join(__dirname, '../backend/public')));

// Handle frontend routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../backend/public/index.html'));
});

app.get('/flipbook-viewer', (req, res) => {
  res.sendFile(path.join(__dirname, '../backend/public/flipbook-viewer.html'));
});

app.get('/pdf-viewer', (req, res) => {
  res.sendFile(path.join(__dirname, '../backend/public/pdf-viewer.html'));
});

app.get('/test-merge', (req, res) => {
  res.sendFile(path.join(__dirname, '../backend/public/test-merge.html'));
});

app.get('/unified', (req, res) => {
  res.sendFile(path.join(__dirname, '../backend/public/unified.html'));
});

// API Routes
app.use('/api/ads', adsRoutes);
app.use('/api/deco', decoRoutes);
app.use('/api/duplicates', duplicatesRoutes);
app.use('/api/eurospin', eurospinRoutes);
app.use('/api/flyers', flyersRoutes);
app.use('/api/import', importRoutes);
app.use('/api/ipercoop', ipercoopRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/mersi', mersiRoutes);
app.use('/api/pdfs', pdfsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server for Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Export for compatibility
module.exports = app;