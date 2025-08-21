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
    ? ['https://volantino-mix.vercel.app', 'https://www.volantino-mix.vercel.app']
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

// Specific route for /admin/import
app.get('/admin/import', (req, res) => {
  const fs = require('fs');
  const filePath = path.resolve(__dirname, '../backend/public/import-admin.html');
  
  try {
    const htmlContent = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlContent);
  } catch (err) {
    console.error('Error reading import-admin.html:', err);
    res.status(500).json({ error: 'File not found', path: filePath, message: err.message });
  }
});

// Serve static files from public for admin routes
app.use('/admin', express.static(path.join(__dirname, '../public')));
// Fallback to backend/public for other admin files
app.use('/admin', express.static(path.join(__dirname, '../backend/public')));

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

module.exports = app;