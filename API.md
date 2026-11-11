# Resumer API

Adres: https://resumer.fly-work.com · PM2 portu: 3080

## Modüller

- **content** — Herkese ortak sabit içerik: CV şablonları ve SSS (tohum verisi).
- **plan** — abonelik planı özeti ve AI erişimi: Resumer Pro sınırsız, ücretsiz kullanıcı tüm AI özellikleri için toplam 1 deneme (bittiğinde 403 `PREMIUM_REQUIRED`).
- **cvs** — Kullanıcının CV'leri: liste, detay (önizleme), kopyalama, silme, taslağı Listeme kaydetme, düzenleme için CV taslağı. Diğer modüllere CV okuma/yazma ve önizleme üretimi servisi verir.
- **ai** — OpenAI istemcisi (diğer modüller deps.ai ile kullanır), güvenli URL metni okuma, AI portre, özet ve profil açıklaması uçları.
- **cv_builder** — CV oluşturma sihirbazı: taslak puanı ve taslağı CV olarak kaydetme.
- **analyses** — CV analizi (genel puan, bölüm puanları, öneriler, ATS) ve öneriyi CV'ye uygulama.
- **tailor** — CV'yi iş ilanına uyarlama: ilan analizi → seçili önerileri uygulama (önizleme) → uyarlanmış CV'yi kaydetme. Uygulama apply/save'e kimlik göndermediği için sunucu kullanıcının son oturumunu tutar.
- **translations** — CV çevirisi: kaynak CV'nin içeriğini hedef dile çevirip draft CV oluşturur (Listeme kaydetme POST /cvs ile).
- **profile** — Uygulamanın profil uçları (/me) ve CV istatistikleri; hesap silme şablonun deps.account'una devredilir.

## Gerekli ek değişkenler

- `OPENAI_API_KEY` — ortak ayarlardan (ai, analyses, tailor, translations)

## İstemcide (backend yok)

- Bildirim tercihleri (push / analiz sonuçları / uyarlanmış CV / CV hatırlatıcıları) ve dil seçimi SharedPreferences'ta kalır — backend'de tablo/uç yok.
- spec.push = local: OneSignal yok, backend push göndermez (notifications.js yok). Analiz / uyarlama / çeviri istek-yanıt içinde senkron bittiği için 'sonuç hazır' bildirimi gerekmez.
- 'CV reminders' → flutter_local_notifications ile istemcide periyodik hatırlatma (örn. 30 günde bir, tercih açıksa).
- Dosya seçme / PDF indirme / paylaşma istemcide; backend PDF üretmez.
- Paywall ve abonelik satın alımı (aylık / yıllık) RevenueCat SDK ile istemcide; satın alım sonrası şablonun POST /billing/sync'i çağrılır, sonra /me ve /me/plan yenilenir.

## Uçlar

| Yöntem | Yol | Giriş | Açıklama |
|---|---|---|---|
| GET | `/health` | — | Uygulama ve veritabanı ayakta mı (izleme / PM2 kontrolü) |
| POST | `/auth/sync` | — | Firebase girişinden sonra çağrılır: kullanıcıyı oluşturur / günceller (silme bekleme süresindeyse geri getirir) |
| GET | `/account` | 🔒 | Giriş yapmış kullanıcı |
| PATCH | `/account` | 🔒 | Kullanıcı bilgilerini güncelle |
| DELETE | `/account` | 🔒 | Hesabı sil (geri alınamaz; bekleme süresi ayarlıysa o süre içinde tekrar girişle iptal edilir) |
| GET | `/me/entitlements` | 🔒 | Aktif abonelikler (premium durumu sunucudan) |
| POST | `/billing/sync` | 🔒 | Satın almadan hemen sonra çağrılır: durum RevenueCat'ten doğrulanıp yazılır (istemcinin söylediğine güvenilmez) |
| POST | `/billing/revenuecat/webhook` | — | RevenueCat webhook (Authorization: REVENUECAT_WEBHOOK_AUTH) |
| POST | `/ai/portrait` | 🔒 | AI portre üretir (Pro ya da ücretsiz deneme) |
| POST | `/ai/summary` | 🔒 | AI profesyonel özet yazar |
| POST | `/ai/description` | 🔒 | AI profil açıklamasını iyileştirir |
| POST | `/ai/experience` | 🔒 | CV deneyim açıklamasını AI ile iyileştirir (`{ position, company, description }` → `{ description }`) |
| GET | `/ai/portraits/{id}.png` | — | Portre görselini sunar (herkese açık, id tahmin edilemez) |
| POST | `/analyses` | 🔒 | CV, PDF/DOCX dosya veya LinkedIn analizi (Pro ya da ücretsiz deneme) |
| POST | `/analyses/fix` | 🔒 | Analiz önerisini CV’ye uygula |
| GET | `/templates` | 🔒 | CV şablonları (aktif olanlar, sıraya göre) |
| GET | `/faq` | 🔒 | Sık sorulan sorular (herkese açık; dil: kullanıcı ya da Accept-Language) |
| GET | `/me/plan` | 🔒 | Abonelik planı özeti ve ücretsiz AI denemesi durumu |
| POST | `/cvs/score` | 🔒 | Taslak tamlık puanı (0..100, yapay zekâsız, kayıt yazmaz) |
| POST | `/cv-builder/photo` | 🔒 | CV fotoğrafını yükler (`{ photo: data URL ≤700 KB }`), CV'ye yazılacak herkese açık adresi döner (`{ url }`) |
| POST | `/cv-builder/submit` | 🔒 | Taslağı CV olarak kaydet (cv_id verilirse o CV'yi güncelle) |
| GET | `/cvs` | 🔒 | Kullanıcının kayıtlı CV listesi (son güncellenen önce) |
| DELETE | `/cvs` | 🔒 | CV sil (kalıcı) |
| POST | `/cvs` | 🔒 | Taslak CV'yi Listeme kaydet / başlığı güncelle |
| GET | `/cvs/detail` | 🔒 | CV detayı ve önizleme verisi |
| POST | `/cvs/duplicate` | 🔒 | CV kopyala (ücretsiz planda sınırlı) |
| GET | `/cv-builder/draft` | 🔒 | Düzenleme için CV taslağı (CvDraft) |
| GET | `/me` | 🔒 | Profil (premium ve sayaçlarla) |
| PATCH | `/me` | 🔒 | Profili güncelle (gövdede olan alanlar; boş / null temizler) |
| DELETE | `/me` | 🔒 | Hesabı sil (bekleme süresi sonunda kalıcı; tekrar çağrı da 200) |
| GET | `/cvs/stats` | 🔒 | CV sayaçları (toplam, uyarlanan, analiz) |
| POST | `/tailor/analyze` | 🔒 | CV'yi iş ilanına göre analiz eder, 3 öneri üretir (Pro ya da ücretsiz deneme) |
| POST | `/tailor/apply` | 🔒 | Seçilen önerileri uygular, önizleme döner |
| POST | `/tailor/save` | 🔒 | Uyarlanmış CV'yi yeni CV olarak kaydeder (idempotent) |
| POST | `/translations` | 🔒 | CV'yi hedef dile çevirip draft CV oluşturur (Pro ya da ücretsiz deneme) |

> CV taslağı (`/cv-builder/submit`, `/cv-builder/draft`) ayrıca `languages[{name, level}]`, `references[{name, position, company, email, phone}]` ve görünüm alanlarını taşır: `accent_color` (#rrggbb), `font` (modern | classic | minimal), `spacing` (compact | normal | relaxed). Önizleme (`preview`) aynı görünüm alanlarını ve Languages / References bölümlerini döner.


Ayrıntılı şema: `openapi.json` · kurulum: `README.md`
