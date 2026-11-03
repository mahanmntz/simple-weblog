function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    const field = /for key '(?:\w+\.)?(\w+)'/.exec(err.sqlMessage)?.[1];
    return res.status(409).json({ error: 'Duplicate value', field });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'Referenced record does not exist' });
  }

  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;