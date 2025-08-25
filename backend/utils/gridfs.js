const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

let cachedBucket = null;

function getGridFSBucket() {
    if (cachedBucket) return cachedBucket;
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database non connesso per GridFS');
    }
    cachedBucket = new GridFSBucket(db, { bucketName: 'pdfs' });
    return cachedBucket;
}

module.exports = { getGridFSBucket };


