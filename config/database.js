const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/adi-fix-merah';
    
    const conn = await mongoose.connect(mongoURI, {
      retryWrites: true,
      w: 'majority'
    });
    
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    logger.error(`MongoDB Connection Error: ${err.message}`);
    logger.warn('Running without MongoDB. Some features may be limited.');
    return null;
  }
};

module.exports = connectDB;
