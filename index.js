require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// data/ qovluğu
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, max: 20, message: { error: 'Çox cəhd. 15 dəqiqə gözləyin.' } }));
app.use('/api/survey/submit', rateLimit({ windowMs: 60*1000, max: 5, message: { error: 'Çox sorğu.' } }));

app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth',     require('./src/routes/auth'));
app.use('/api/survey',  require('./src/routes/survey'));
app.use('/api/register',require('./src/routes/survey')); // register + slots
app.use('/api/admin',   require('./src/routes/admin'));

// HTML Pages
app.get('/',          (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/survey',    (req, res) => res.sendFile(path.join(__dirname, 'public/survey.html')));
app.get('/register',  (req, res) => res.sendFile(path.join(__dirname, 'public/register.html')));
app.get('/admin',     (req, res) => res.sendFile(path.join(__dirname, 'public/admin-login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public/admin-dashboard.html')));

// 404
app.use((req, res) => res.status(404).json({ error: 'Tapılmadı' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Server xətası' });
});

app.listen(PORT, () => console.log(`✅ Server işləyir: http://localhost:${PORT}`));
