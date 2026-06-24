# Bağçada Qidalanma Monitorinq Sistemi

## Quraşdırma (Lokal)
```bash
npm install
cp .env.example .env
# .env faylında şifrəni dəyişin
node index.js
```
Açın: http://localhost:3000

## Render.com Deploy
1. GitHub-a yükləyin
2. Render.com → New Web Service → GitHub repo seçin
3. Environment Variables əlavə edin:
   - `ADMIN_PASSWORD` = güclü şifrə
   - `BASE_URL` = https://sizin-app.onrender.com
   - `DATA_DIR` = /data
4. Node version: 22+
5. Start command: `node index.js`

> **Qeyd:** Render.com-da persistent disk üçün Disk əlavə edin, mount path: `/data`

## Default Admin Şifrəsi
`Admin2024!` — deploy etmədən önce mütləq dəyişin!
