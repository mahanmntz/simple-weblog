const http = require('http');
const dotenv = require('dotenv');
const express = require('express');
const pool = require('./config/db');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const app = express();
const PORT = process.env.PORT;
app.disable('x-powered-by');
app.use(express.json());
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/health/db', async (req, res) => {
    const [rows] = await pool.query('SELECT 1 AS OK');
    res.json(rows[0]);
})
dotenv.config();



app.use(notFound);
app.use(errorHandler);

module.exports = app;