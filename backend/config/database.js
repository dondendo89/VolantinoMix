const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/volantinomix';
        
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10, // Maintain up to 10 socket connections
            serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
            socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
            bufferCommands: false, // Disable mongoose buffering
        };

        const conn = await mongoose.connect(mongoURI, options);

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📊 Database: ${conn.connection.name}`);
        
        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('⚠️  MongoDB disconnected');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            try {
                await mongoose.connection.close();
                console.log('🔒 MongoDB connection closed through app termination');
                process.exit(0);
            } catch (error) {
                console.error('❌ Error closing MongoDB connection:', error);
                process.exit(1);
            }
        });

    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        
        // Exit process with failure
        process.exit(1);
    }
};

// Function to check database health
const checkDBHealth = async () => {
    try {
        const state = mongoose.connection.readyState;
        const states = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };
        
        return {
            status: states[state],
            host: mongoose.connection.host,
            name: mongoose.connection.name,
            collections: Object.keys(mongoose.connection.collections).length
        };
    } catch (error) {
        return {
            status: 'error',
            error: error.message
        };
    }
};

// Function to initialize database with sample data
const initializeDatabase = async () => {
    try {
        console.log('📊 Database ready - no sample data initialization');
    } catch (error) {
        console.error('❌ Error initializing database:', error);
    }
};

module.exports = {
    connectDB,
    checkDBHealth,
    initializeDatabase
};