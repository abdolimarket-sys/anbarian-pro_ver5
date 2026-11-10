# صدور لایسنس آفلاین انبارین (روش اصلی)

روش رسمی آفلاین: **فایل امضاشده RSA** با پسوند `.anblic`

## پیش‌نیاز
- Node.js
- شناسه دستگاه مشتری (از تنظیمات برنامه)
- کلید خصوصی در `scripts/keys/private.pem` (همراه این پروژه برای شما به‌عنوان صادرکننده)

## صدور

```bash
cd anbarin_app

# کامل
node scripts/issue-offline-license.mjs --device DEVICE_ID --org "نام مشتری" --modules full --days 365

# فقط شمارش
node scripts/issue-offline-license.mjs --device DEVICE_ID --modules count --days 365

# فقط حسابداری
node scripts/issue-offline-license.mjs --device DEVICE_ID --modules accounting --exp 2027-12-31 --out ./client.anblic
```

## فعال‌سازی توسط مشتری
تنظیمات → لایسنس → انتخاب فایل `.anblic` → **فعال‌سازی لایسنس آفلاین**

## امنیت
- کلید **عمومی** داخل برنامه است (`src/license/issuer-public-key.ts`)
- کلید **خصوصی** فقط نزد شما در `scripts/keys/private.pem` بماند و در APK نباشد
- اگر جفت‌کلید را عوض کردید، public را در برنامه و private را در scripts/keys هم‌زمان عوض کنید

## سازگاری
کلید متنی `ANB3` هنوز کار می‌کند ولی روش توصیه‌شده همان فایل `.anblic` است.
