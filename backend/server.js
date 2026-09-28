require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const apiRoutes = require('./src/routes/api');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);

// Serve the frontend from the same server, so the whole app is one
// deployable service (no separate static host, no CORS to configure
// in production). The frontend's app.js calls the API at the relative
// path /api, which resolves to this same origin either way.
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Themis running on http://localhost:${PORT}`);
});
