function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors?.[0]?.path;
    return res.status(409).json({ error: 'Duplicate value', field });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({ error: 'Referenced record does not exist' });
  }

  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({ error: 'Validation failed' });
  }

  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
