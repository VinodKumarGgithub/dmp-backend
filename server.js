require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compress = require('compression');
// const xss = require('xss-clean');
const { logger } = require('./config/logger');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { testMasterDbConnection } = require('./config/startup');
const { health } = require('./controllers/healthController');

const app = express();
// app.use(xss());
app.use(helmet());
app.use(cors(
  {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
  }
));
app.use(morgan('dev'));

// Following code is used to hide the technologies being used
app.disable('x-powered-by');
app.disable('server');

// Parse JSON body with size limit
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static('public'));

app.get('/health', health);

// compress
app.use(compress({
    threshold: 512
}));

app.use('/api', routes);


app.use(errorHandler);

const PORT = process.env.PORT || 4000;

(async () => {
  await testMasterDbConnection(); // test master DB connection before starting API

  app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
  });
})();


