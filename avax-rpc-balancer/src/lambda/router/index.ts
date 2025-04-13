const express = require('express');
const morgan = require('morgan'); // for logging
const config = require('./config');
const app = express();
const PORT = process.env.PORT || 3000;

const setupProxy = require('./proxy');
setupProxy(app);

const setupLogging = require('./logger');
setupLogging(app);

const setupErrorHandling = require('./errorHandler');
setupErrorHandling(app);

// Middleware for parsing JSON bodies
app.use(express.json());

// Basic server setup
app.listen(PORT, () => {
  console.log(`Blockchain proxy server running on port ${PORT}`);
});

module.exports = app;