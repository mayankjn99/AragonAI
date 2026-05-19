const express = require('express');
const cors = require('cors');
const uploadRouter = require('./routes/upload');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/upload', uploadRouter);

// Multer error handling middleware
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
  }
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
