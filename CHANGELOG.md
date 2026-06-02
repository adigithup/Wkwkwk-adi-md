# CHANGELOG - ADI FIX MERAH V12

## v12.0.0 - Full Web Dashboard Edition

### Fixed
- **Critical Error**: Upgraded `pino` from v8.16.2 to v9.6.0 to fix Baileys v6.7.23 compatibility
  - `pino` v8 tidak memiliki `logger.child()`, menyebabkan crash seluruh aplikasi saat inisialisasi WhatsApp socket
  - `pino` v9 sepenuhnya kompatibel dengan Baileys v6.7.23
- Removed unused dependencies: `axios`, `mongoose` (replaced with proper setup)
- Fixed all import/require paths across all files
- Fixed Express server configuration (host binding, port, static files)
- Fixed Socket.IO CORS configuration
- Fixed QR Code generation (base64 image via qrcode library)
- Fixed pairing code request flow

### Added
- **Complete Web Dashboard** (`views/dashboard.html` + `public/style.css` + `public/script.js`)
  - Login page with JWT authentication
  - Responsive mobile-first design
  - Real-time WhatsApp connection via QR & pairing code
  - Cek Bio Massal, Cek Nomor, Cek Repe, Fix Nomor tools
  - Admin panel with settings & email templates
  - Toast notifications system
  - Progress bars for batch operations
- **Database Support** (`config/database.js`)
  - MongoDB connection with fallback
  - Mongoose models: User, Session, MTTemplate
- **Middleware** (`middleware/`)
  - `auth.js` - JWT authentication & token generation
  - `validation.js` - Express-validator for login, register, number checks
  - `errorHandler.js` - Global error handler + 404 handler
- **Security**
  - `helmet` - HTTP security headers
  - `cors` - Cross-origin requests
  - `compression` - Response compression
  - `morgan` - HTTP request logging
  - `express-session` + `connect-mongo` - Session management
  - `bcryptjs` - Password hashing
  - `jsonwebtoken` - JWT tokens
- **File Upload** (`multer`)
  - Support .txt and .xlsx file uploads for batch number checking
- **Telegram Bot** (`node-telegram-bot-api`)
  - Auto-initialize if TELEGRAM_BOT_TOKEN is set
  - /connect and /status commands
- **WhatsApp Improvements**
  - Auto-reconnect with exponential backoff (max 5 attempts)
  - Session recovery with multi-file auth state
  - Safe credential storage per session
  - Graceful disconnection cleanup
- **Logger** (`utils/logger.js`)
  - Pino-based logging with pretty-print in dev mode
- **Environment Configuration** (`.env.example`)
  - All configurable variables documented
- **Package.json**
  - Updated scripts: `start`, `dev` (nodemon), `test`
  - Added engines requirement: Node >= 18
  - Added devDependencies: nodemon

### Structure
```
adi-fix-merah-webset/
├── package.json
├── index.js              (main entry)
├── server.js             (backward compat)
├── .env.example
├── CHANGELOG.md
├── config/
│   └── database.js
├── middleware/
│   ├── auth.js
│   ├── validation.js
│   └── errorHandler.js
├── controllers/
│   ├── authController.js
│   ├── whatsappController.js
│   └── dashboardController.js
├── routes/
│   ├── auth.js
│   ├── dashboard.js
│   └── whatsapp.js
├── models/
│   ├── User.js
│   ├── Session.js
│   └── MTTemplate.js
├── utils/
│   └── logger.js
├── public/
│   ├── style.css
│   └── script.js
└── views/
    ├── login.html
    └── dashboard.html
```

### Compatibility
- **Replit Ready**: Port 5000, host 0.0.0.0, webview workflow
- **Bolt Ready**: Standard Node.js + npm start
- **Node.js Ready**: Express + Socket.IO + Baileys
- **VPS Ready**: PM2 compatible, env-based config
- **Termux Ready**: Pure Node.js, no native build deps

### Environment Variables
Copy `.env.example` to `.env` and fill in your values:
- `MONGODB_URI` - MongoDB connection string (optional)
- `JWT_SECRET` - JWT signing secret
- `SESSION_SECRET` - Session encryption secret
- `SMTP_EMAIL` / `SMTP_PASSWORD` - Email credentials for fix feature
- `TELEGRAM_BOT_TOKEN` - Telegram bot token (optional)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` - Default admin credentials

### Default Login
- Username: `admin`
- Password: `admin123`
