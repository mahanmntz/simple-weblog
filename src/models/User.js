const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define('users', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    phone: { type: DataTypes.STRING(11), allowNull: false, unique: true },
    role: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'author' },
});

module.exports = User;
