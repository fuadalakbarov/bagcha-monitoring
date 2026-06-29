<!DOCTYPE html>
<html lang="az">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bağçada Qidalanma Monitorinqi</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    font-family:'Segoe UI',sans-serif;
    background:linear-gradient(135deg,#1F3D33 0%,#2d5a45 100%);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    min-height:100vh;padding:20px;
  }
  .site-header{text-align:center;color:#FAF6EF;margin-bottom:28px;width:100%;max-width:580px;}
  .region-badge{
    display:inline-block;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);
    border-radius:50px;padding:6px 20px;font-size:.78rem;letter-spacing:.04em;
    text-transform:uppercase;color:#c8ddd4;margin-bottom:10px;
  }
  .site-header h2{font-size:clamp(1.1rem,4vw,1.55rem);font-weight:700;line-height:1.35;
    color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.3);}
  .divider{width:50px;height:3px;background:#5ec98a;border-radius:4px;margin:12px auto 0;}

  /* Ön giriş bloku */
  .intro-card{
    background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);
    border-radius:16px;padding:22px 28px;max-width:580px;width:100%;
    margin-bottom:20px;color:#d4ead9;line-height:1.7;font-size:.93rem;
  }
  .intro-card p{margin-bottom:10px;}
  .intro-card p:last-child{margin-bottom:0;}
  .intro-card strong{color:#5ec98a;font-weight:700;}
  .intro-card .highlight{
    background:rgba(94,201,138,.12);border-left:3px solid #5ec98a;
    padding:10px 14px;border-radius:0 10px 10px 0;margin-top:14px;
    color:#e4f5e9;font-size:.9rem;
  }

  .card{
    background:#FAF6EF;border-radius:20px;padding:36px 36px;
    box-shadow:0 8px 40px rgba(0,0,0,.25);text-align:center;
    max-width:460px;width:100%;
  }
  .logo{font-size:3rem;margin-bottom:14px;}
  h1{color:#1F3D33;font-size:clamp(1.1rem,4vw,1.5rem);margin-bottom:10px;line-height:1.35;}
  .desc{color:#5c6b62;margin-bottom:28px;font-size:.9rem;line-height:1.6;}

  .btn{
    display:block;padding:14px 28px;border-radius:12px;text-decoration:none;
    font-size:.98rem;font-weight:600;margin-bottom:12px;transition:.2s;
  }
  .btn-register{
    background:#1a5c38;color:#FAF6EF;
    box-shadow:0 4px 18px rgba(26,92,56,.35);
  }
  .btn-register:hover{background:#0f3d26;transform:translateY(-1px);}
  .btn-survey{background:transparent;border:2px solid #1F3D33;color:#1F3D33;}
  .btn-survey:hover{background:#e8f0ec;}
  .btn-admin{background:transparent;border:2px solid #bbb;color:#888;font-size:.85rem;padding:10px;}
  .btn-admin:hover{background:#f0f0f0;}

  .separator{
    display:flex;align-items:center;gap:10px;margin:6px 0;color:#aaa;font-size:.78rem;
  }
  .separator::before,.separator::after{content:'';flex:1;height:1px;background:#ddd;}

  .site-footer{margin-top:24px;text-align:center;color:rgba(255,255,255,.4);font-size:.78rem;line-height:1.7;}
  .site-footer strong{color:rgba(255,255,255,.6);font-weight:500;}

  @media(max-width:480px){
    .card{padding:28px 20px;}
    .intro-card{padding:18px 18px;}
  }
</style>
</head>
<body>

  <header class="site-header">
    <div class="region-badge">Rəsmi Portal</div>
    <h2>Gəncə-Daşkəsən Regional<br>Təhsil İdarəsi</h2>
    <div class="divider"></div>
  </header>

  <!-- Ön giriş mətni -->
  <div class="intro-card">
    <p>
      Hörmətli valideyn, övladınızın <strong>qida təminatı</strong> ilə bağlı
      <strong>yerindəcə nəzarət</strong> sorğusunda iştirak etmək istəyirsinizsə,
      aşağıdakı <em>"Qeydiyyat"</em> düyməsinə klikləyərək qeydiyyatdan keçməyiniz xahiş olunur.
    </p>
    <p>
      Qeydiyyat zamanı seçdiyiniz randevu tarixi və saatına uyğun olaraq sizə
      <strong>şəxsi PIN kod</strong> veriləcək. Bu PIN kod yalnız həmin gün,
      seçdiyiniz saat aralığında aktivdir.
    </p>

  </div>

  <div class="card">
    <div class="logo">🌿</div>
    <h1>Bağçada Qidalanma<br>Monitorinq Sistemi</h1>
    <p class="desc">Qeydiyyatdan keçin, randevu seçin,<br>PIN kodunuzu alın.</p>

    <a href="/register" class="btn btn-register">📝 Qeydiyyat / Randevu</a>

    <div class="separator">artıq PIN kodum var</div>

    <a href="/survey" class="btn btn-survey">🔑 PIN ilə Sorğuya Daxil Ol</a>

    <a href="/admin" class="btn btn-admin">🔐 Admin Paneli</a>
  </div>

  <footer class="site-footer">
    <p>© 2026 Gəncə-Daşkəsən Regional Təhsil İdarəsi</p>
    <p>All rights reserved. by <strong>F.Alakbarov</strong></p>
  </footer>

</body>
</html>
