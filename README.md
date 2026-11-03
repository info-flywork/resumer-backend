# Resumer API

Node.js (JavaScript) + Express 5 + MySQL + Firebase Auth. f2f Studio tarafından üretildi.

## Mimari

```
src/
  server.js      HTTP (PM2 "api", tek kopya)
  worker.js      push kuyruğu, hesap silme, zamanlanmış işler (PM2 "worker")
  app.js         Express uygulaması (testler de bunu kullanır)
  container.js   tüm bağımlılıklar tek yerde
  config/        env.js (açılışta doğrulanır), db.js, firebase.js
  core/          route (bildirimsel uç tanımı), auth, errors, logger, openapi
  modules/<ad>/  routes.js · service.js · repository.js · schemas.js
  jobs/          worker işleri
  db/migrations/ NNN_ad.sql (uygulanmış dosya değiştirilmez)
openapi.json     uçların belgesi (npm run openapi) — Flutter tarafı bunu okur
```

- **Bir uç = bir nesne** (`src/modules/*/routes.js`): yöntem, yol, kimlik (`none | optional | required`),
  istek ve yanıt şeması (zod), istenirse `premium` ve `rateLimit`. Doğrulama, yanıt kontrolü ve OpenAPI
  buradan üretilir.
- **Yanıt zarfı** (Flutter `BaseResponse`): `{ "status": "success", "message": "ok", "data": {…} }`,
  hata: `{ "status": "error", "message", "code", "data": null, "errors"? }`. `data` her zaman nesnedir
  (liste: `{ "items": [...] }`). Alan adları snake_case.
- **Kimlik**: Flutter Firebase ID token'ı `Authorization: Bearer` ile gönderir; ilk istekte kullanıcı
  oluşur. Token geçersiz → 401, Firebase / DB erişilemiyor → 503 (uygulama oturumu kapatmaz).
- **Premium**: RevenueCat webhook'u + `/billing/sync` (RevenueCat'ten doğrulanır). İstemcinin "satın
  aldım" demesine güvenilmez.
- **Push**: `deps.notifications.notify(userId, 'şablon', params)` → kuyruk → worker OneSignal'a gönderir
  (kullanıcının dilinde, yeniden deneyerek).
- **Hesap silme**: `DELETE /me` → worker Firebase, RevenueCat, OneSignal ve tüm verileri siler.

## Geliştirme

```bash
cp .env.example .env      # DB_* ve FIREBASE_SERVICE_ACCOUNT
npm install
npm run migrate
npm run dev               # ayrı terminalde: npm run worker
npm run check             # tip denetimi (JSDoc, derleme yok)
npm test                  # TEST_DB_HOST/USER/PASSWORD/NAME ile ayrı test veritabanı
```

## Canlıya alma (PM2)

İlk kez: Node 22+, PM2 (`npm i -g pm2 && pm2 install pm2-logrotate`), nginx.

```bash
git clone <repo> /var/www/resumer-api && cd /var/www/resumer-api
# panelden indirdiğin .env dosyasını buraya koy
bash deploy/deploy.sh       # npm ci → migrate → pm2 startOrReload → pm2 save
pm2 startup                 # (bir kez) sunucu açılınca PM2 kendiliğinden başlasın
```

Güncelleme: `bash deploy/deploy.sh` (kesintisiz reload). nginx örneği: `deploy/nginx.conf.example`.
