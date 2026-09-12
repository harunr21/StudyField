# StudyField (YouTube Workspace)

YouTube playlist'lerini takip et, tek tek video linklerinden kendi listelerini oluştur, videoları izlendi olarak işaretle, zaman damgalı not al, tldraw tahtasında çiz ve arkadaşlarınla ilerlemeni paylaş. Tamamen Cloudflare üzerinde çalışır.

## Özellikler

- **YouTube playlist içe aktarma:** URL ile veya YouTube'da arayarak. "Yenile" ile YouTube'daki değişiklikler çekilir, izleme durumu korunur.
- **Kendi listeni oluştur:** Bir veya birden fazla video linki yapıştırarak (watch, youtu.be, shorts, live). Sonradan video eklenebilir, sıralanabilir, adı değiştirilebilir. Alt playlist ve kopyalar da aynı şekilde yönetilir.
- **İzleme takibi:** İzlendi işaretleme, ilerleme yüzdesi, toplam ve kalan süre.
- **Zaman damgalı notlar:** Video izlerken ana bağlı not alma, nota tıklayınca o saniyeye gitme.
- **Arkadaşlar ve Study Rooms:** Kullanıcı adıyla arkadaş ekleme, paylaşılan listeleri görme ve kopyalama, aynı anda izleyen arkadaşları canlı görme.
- **Çizim tahtası:** tldraw, tarayıcıda yerel kayıt.

## Mimari

| Katman | Teknoloji |
| --- | --- |
| Uygulama | Next.js 16 (App Router, webpack), OpenNext adaptörüyle **Cloudflare Workers** üzerinde |
| Veritabanı | **Cloudflare D1** (SQLite), Drizzle ORM |
| Kimlik doğrulama | Kendi oturum sistemi: e-posta + şifre, PBKDF2 hash, D1'de `sessions` tablosu, `sf_session` HttpOnly çerezi |
| Canlı varlık (Study Rooms) | **Durable Object** `StudyRoom` + WebSocket (`/ws/study-room`) |
| YouTube verisi | Sunucu tarafı `/api/youtube` rotası, anahtar Worker secret'ı olarak saklanır |
| Tahta | tldraw v2, tarayıcıda yerel kayıt |
| UI | Tailwind v4, shadcn/ui, Lucide |

Tüm veri erişimi sunucu tarafında Server Action'larda yapılır (`src/actions/*`). Her action oturumu doğrular ve sorguları kullanıcı id'sine göre filtreler; Supabase'deki satır güvenliği (RLS) kurallarının karşılığı `src/lib/data/access.ts` içindedir.

## Dizin yapısı

```
worker.ts                  Worker girişi: /ws/study-room -> DO, kalan her şey -> Next.js
wrangler.jsonc             Cloudflare yapılandırması (D1, DO, assets)
open-next.config.ts        OpenNext ayarı
migrations/                D1 migration'ları (wrangler d1 migrations apply)
scripts/                   Supabase -> D1 veri taşıma scriptleri
src/db/                    Drizzle şeması ve D1 istemcisi
src/lib/auth/              Şifre hashleme ve oturum yönetimi
src/actions/               Server Action'lar (auth, profile, friends, playlists, videos)
src/durable-objects/       StudyRoom Durable Object
src/app/                   Sayfalar
```

## Kurulum

```bash
npm install
cp .dev.vars.example .dev.vars        # YOUTUBE_API_KEY değerini doldurun
npm run db:migrate:local              # yerel D1'e şemayı uygular
npm run dev                           # Next dev sunucusu (D1 yerel simülasyon)
```

`npm run dev` altında Durable Object çalışmaz, Study Rooms özelliğini denemek için Worker önizlemesini kullanın:

```bash
npm run preview                       # OpenNext build + wrangler dev
```

## Cloudflare'e dağıtım

Hesap: **hrmertoglu@gmail.com**. Önce bu hesapla giriş yapın ve doğrulayın:

```bash
npx wrangler login
npx wrangler whoami
```

1. D1 veritabanını oluşturun ve çıkan `database_id` değerini `wrangler.jsonc` içine yazın:

   ```bash
   npx wrangler d1 create studyfield-db
   ```

2. Şemayı uzak veritabanına uygulayın:

   ```bash
   npm run db:migrate:remote
   ```

3. YouTube API anahtarını secret olarak ekleyin:

   ```bash
   npx wrangler secret put YOUTUBE_API_KEY
   ```

4. Dağıtın:

   ```bash
   npm run deploy
   ```

İlk dağıtım `StudyRoom` Durable Object namespace'ini otomatik oluşturur (`wrangler.jsonc` içindeki `migrations` alanı).

## Supabase'den veri taşıma

Veriler 6 Eylül 2026'da `db_cluster-24-08-2026` yedeğinden üretim D1'ine aktarıldı. Tekrar gerekirse iki yol var.

**A) Dashboard yedeğinden (Postgres bağlantısı gerekmez):**

```bash
node scripts/parse-supabase-backup.mjs "C:\...\db_cluster-....backup.gz"
npm run migrate:build-import
npx wrangler d1 execute studyfield-db --remote --file=scripts/out/d1-import.sql
```

**B) Canlı Supabase veritabanından:**

1. Supabase Dashboard > Project Settings > Database bölümünden **direct connection** adresini alın.
2. Verileri dışa aktarın:

   ```bash
   SUPABASE_DB_URL="postgresql://postgres:<sifre>@db.<ref>.supabase.co:5432/postgres" npm run migrate:export-supabase
   ```

3. D1 import SQL'ini üretin ve uygulayın:

   ```bash
   npm run migrate:build-import
   npx wrangler d1 execute studyfield-db --remote --file=scripts/out/d1-import.sql
   ```

Kullanıcı id'leri ve tüm ilişkiler birebir korunur. Şifreler Supabase'in bcrypt hash'i ile taşınır; kullanıcı aynı şifreyle giriş yapar, hash ilk girişte PBKDF2'ye dönüştürülür. Sadece OAuth ile kaydolmuş (şifresiz) kullanıcılar için kullanılamaz bir hash yazılır.

## Notlar

- E-posta doğrulaması yoktur; kayıt sonrası oturum hemen açılır.
- Workers ücretsiz planında istek başına CPU süresi sınırı 10 ms'dir. Şifre hashleme WebCrypto ile yapıldığı için bu sınıra takılmaz, ancak çok büyük playlist senkronizasyonlarında sınır aşılırsa Workers Paid plana geçmek gerekebilir.
- `next dev` ile çalışırken D1 yerel dosyası `.wrangler/state/v3/d1` altındadır.
