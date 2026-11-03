require('dotenv').config();
const app = require('./app');
const pool = require('./config/db');
const PORT = process.env.PORT || 3000;


for (const name of ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET']) {
    if (!process.env[name]) throw new Error(`${name} is not set`);
}

pool.query('SELECT 1')
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Error connecting to the database:', err.message);
        process.exit(1);
    });