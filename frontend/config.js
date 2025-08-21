// Configuration for VolantinoMix Frontend
const CONFIG = {
    // Backend API URL - automatically detects environment
    API_BASE_URL: (() => {
        // Check if we're in development (localhost)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:5000';
        }
        
        // Check for environment variable (Vercel)
        if (typeof process !== 'undefined' && process.env && process.env.BACKEND_URL) {
            return process.env.BACKEND_URL;
        }
        
        // Production fallback - replace with your actual backend URL
        return 'https://volantinomix-production.up.railway.app';
    })(),
    
    // API endpoints
    API_ENDPOINTS: {
        VOLANTINI: '/api/volantini',
        PDFS: '/api/pdfs',
        ADS: '/api/ads',
        DECO: '/api/deco',
        IPERCOOP: '/api/ipercoop',
        EUROSPIN: '/api/eurospin',
        MERSI: '/api/mersi',
        FLYERS: '/api/flyers'
    },
    
    // Helper function to get full API URL
    getApiUrl: function(endpoint) {
        return this.API_BASE_URL + endpoint;
    },
    
    // Helper function to get full file URL
    getFileUrl: function(path) {
        if (path.startsWith('http')) {
            return path;
        }
        return this.API_BASE_URL + path;
    }
};

// Make CONFIG available globally
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}