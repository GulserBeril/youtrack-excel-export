# YouTrack Issue Export

YouTrack issue'larını görsel filtrelerle süzüp **Excel (.xlsx) veya CSV** olarak dışa aktaran YouTrack App.
YouTrack ana menüsünde **Issue Export** adlı ayrı bir sayfa olarak görünür (`MAIN_MENU_ITEM`). Geliştirici: Codeo.

> Manifest'teki teknik kimlik (`"name": "excel-export"`) bilerek değiştirilmedi: YouTrack yeni sürümleri bu kimlikle
> tanıyıp mevcut kurulumun üzerine günceller. Değiştirilirse ayrı bir uygulama olarak kurulur.

## Özellikler (v0.8)

Arayüz, YouTrack kullanıcısının diline göre Türkçe veya İngilizce açılır.
Geliştirme kuralları (tema, Ring UI, manifest) için üst klasördeki `CLAUDE.md` dosyasına bakın:

- **Tema:** Sayfa YouTrack'te seçili temayı izler (işletim sistemi temasını değil). Tema kararını app vermez;
  YouTrack'in iframe'e sağladığı Ring UI değişkenleri kullanılır.
- **Yerel görünüm:** Tüm kontroller Ring UI bileşenleridir (Button, ButtonGroup, Select, Input, Checkbox, Tag,
  Banner, Island, Heading, ProgressBar); renkler yalnızca `--ring-*` değişkenlerinden gelir, ikonlar `@jetbrains/icons`.

1. **Dışa aktarılacak issue'ları seçin**
   - Hızlı filtreler: Açık olanlar, Bana atananlar, Bu ay oluşturulanlar, Son 7 günde güncellenenler
   - Proje, Durum (Tümü / Açık / Çözülmüş), State, Assignee, Oluşturulma ve Güncellenme tarihleri
   - Gelişmiş filtreler: etiketler, metin, kayıtlı arama, diğer custom field'lar ve "YouTrack sorgusu olarak düzenle"
   - Aktif filtreler tek tek kaldırılabilen etiketler olarak listelenir
2. **Kolonları seçin**: solda aranabilir alan listesi, sağda numaralı ve sürüklenebilir seçili kolonlar
   (klavye: satıra odaklanıp Alt+↑/↓), "Sırayı sıfırla"
3. **Önizleme**: seçili kolonlarla ilk 5 satır
4. **Dışa aktarım özeti**: issue/kolon sayısı, dosya formatı seçimi ve indirme butonu

### Dosya formatları

| Format | İçerik |
|---|---|
| Excel (.xlsx) | Kalın ve sabit başlık satırı, otomatik filtre, gerçek tarih hücreleri, "Dışa aktarım bilgisi" sayfası |
| CSV | UTF-8 (BOM'lu, Excel Türkçe karakterleri doğru gösterir). Ayraç seçilebilir: Türkçe'de varsayılan `;`, İngilizce'de `,`. `=`, `+`, `-`, `@` ile başlayan değerlerin önüne `'` eklenir (CSV injection koruması) |

Son seçilen format ve ayraç tarayıcıda hatırlanır. Dosya adı `Proje Adı YYYY-AA-GG.<uzantı>` biçimindedir.
Dosyalar tamamen tarayıcıda üretilir, veri YouTrack dışına çıkmaz.

## Yerel önizleme (YouTrack'e yüklemeden)

```bash
npm run dev
```

Tarayıcıda `http://localhost:5173/dev/preview.html` adresini açın (İngilizce için `?lang=en`, YouTrack koyu temasını taklit etmek için `?theme=dark`).
Sahte YouTrack verisi `src/dev/mockHost.ts` dosyasında. Bu dosyalar build'e ve zip'e girmez.

Yüklemeden önce görünümü **production build** ile kontrol edin (dev sunucusu CSS sırasını farklı uygular):

```bash
npm run preview:prod
```

`http://localhost:5174/dev/preview.html` — koyu tema için `?theme=dark&themeOn=body`.

## Proje yapısı

```
manifest.json                  App tanımı (widget, extension point, izinler)
src/widgets/export-page/       Sayfa (app.tsx), giriş noktası, CSS, ikon
src/components/                FilterPanel, FieldFilterControl, DateRangeFilter, ColumnPicker, PreviewTable, Segmented
src/lib/query.ts               Filtre modeli → YouTrack sorgu dili
src/lib/youtrack.ts            REST API çağrıları (sayfalama, sayım, metadata)
src/lib/columns.ts             Kolon tanımları ve değer dönüşümü
src/lib/exporters.ts           CSV üretimi, indirme, format seçimi
src/lib/excel.ts               ExcelJS ile .xlsx üretimi (yalnızca Excel seçilince yüklenir)
src/lib/fileName.ts            Proje adına göre dosya adı
src/lib/i18n.ts                Türkçe / İngilizce metinler
src/dev/                       Yerel önizleme (sahte YouTrack)
@types/globals.d.ts            YTApp host API tipleri (resmi şablondan)
```

## Geliştirme

```bash
npm install
npm run build        # tip kontrolü + vite build + manifest doğrulaması → dist/
```

## YouTrack'e yükleme

1. YouTrack'te **Profile → Account Security → New token** ile *YouTrack* scope'lu bir token oluşturun.
2. `.env.example` dosyasını `.env` olarak kopyalayıp `YOUTRACK_HOST` ve `YOUTRACK_TOKEN` değerlerini doldurun, sonra:
   ```bash
   npm run deploy      # build + upload
   ```
3. **Administration → Apps → Issue Export** ekranında uygulamayı etkinleştirin (Active).
4. Ana menüde **Issue Export** sayfası görünür.

Elle yükleme / Marketplace için paket: `npm run pack` → `youtrack-issue-export.zip`
(build alır, `dist` içeriğini zip'in köküne koyar). YouTrack'te **Administration → Apps → Add app → Upload ZIP file** ile yüklenir.

## Gerçek YouTrack'te kontrol edilecekler

- [ ] CSV indirmesinin iframe içinde de çalıştığı (Excel indirmesi çalışıyor)
- [ ] `issuesGetter/count` ve açık uçlu tarih aralığının (`created: 2026-01-01 .. *`) sürümünüzde çalıştığı
- [ ] `admin/projects/{id}/customFields` çağrısının admin olmayan kullanıcılarda da çalıştığı
- [ ] YouTrack temasını izleme: YouTrack koyu, işletim sistemi açık (ve tersi) iken sayfanın YouTrack ile aynı olduğu
- [ ] Çok sayıda proje varken alan metadatası yalnızca ilk 30 projeden yüklenir (`MAX_PROJECTS_FOR_FIELDS`)

## Sonraki adımlar

- Export profilleri (filtre + kolon + format) — `backend.js` + extension properties ile kalıcı saklama
- Özet (pivot) ve work item sayfaları
- Marketplace: ekran görüntüleri, privacy policy, EULA
