const http = require('http');
const dotenv = require('dotenv');
const express = require('express');
const sequelize = require('./config/db');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const authRouter = require('./routes/auth');
const app = express();
const PORT = process.env.PORT;
const postsRouter = require('./routes/posts.js');

app.disable('x-powered-by');
app.use(express.json());
app.use('/auth', authRouter);
app.use('/posts', postsRouter);
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/health/db', async (req, res) => {
    await sequelize.authenticate();
    res.json({ OK: 1 });
})
dotenv.config();



app.use(notFound);
app.use(errorHandler);

module.exports = app;
