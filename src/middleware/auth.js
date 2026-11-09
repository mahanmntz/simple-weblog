const jwt = require('jsonwebtoken');

function authenticate(req, res, next){
    const authHeader = req.headers['authorization'];
    // 1. check for bearer token structure
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    
    // 2. verify token 
    try { 
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256']
        });
    //3. attach standards identity object to request
    req.user = {
        id: decoded.sub,
        role: decoded.role
    }

    next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin'){
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
}

module.exports = {authenticate, requireAdmin};
