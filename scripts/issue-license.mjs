#!/usr/bin/env node
/**
 * صادرکننده کلید لایسنس ANB3 برای انبارین پرو
 *
 * استفاده:
 *   node scripts/issue-license.mjs --device DEVICE_ID --org "نام مشتری" --modules full
 *   node scripts/issue-license.mjs --device DEVICE_ID --modules count --days 365
 *   node scripts/issue-license.mjs --device DEVICE_ID --modules accounting --exp 2027-12-31
 *   node scripts/issue-license.mjs --demo --org "تست" --modules full --days 30
 *
 * ماژول‌ها: count | accounting | full
 */

const LICENSE_SECRET = 'anbar-azar-lic-v3-7f3a9c2e8b1d';
const LICENSE_FORMAT_V = 3;

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function licenseSign(material) {
  const a = djb2(material + '|' + LICENSE_SECRET);
  const b = fnv1a(LICENSE_SECRET + '|' + material + '|' + a);
  const c = djb2(b + material + fnv1a(LICENSE_SECRET));
  return (a + b + c).slice(0, 20);
}

function parseArgs(argv) {
  const out = {
    org: 'مشتری',
    modules: 'full',
    days: 365,
    exp: null,
    device: null,
    demo: false,
    plan: null,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--demo') out.demo = true;
    else if (a === '--org' && next) {
      out.org = next;
      i++;
    } else if (a === '--device' && next) {
      out.device = next;
      i++;
    } else if (a === '--modules' && next) {
      out.modules = next;
      i++;
    } else if (a === '--plan' && next) {
      out.plan = next;
      i++;
    } else if (a === '--days' && next) {
      out.days = Number(next);
      i++;
    } else if (a === '--exp' && next) {
      out.exp = next;
      i++;
    } else {
      console.error('آرگومان ناشناخته:', a);
      out.help = true;
    }
  }
  return out;
}

function resolveModules(spec) {
  const s = String(spec || 'full')
    .trim()
    .toLowerCase();
  if (s === 'full' || s === 'complete' || s === 'all') return ['count', 'accounting'];
  if (s === 'count' || s === 'inventory' || s === 'stock') return ['count'];
  if (s === 'accounting' || s === 'acc' || s === 'finance') return ['accounting'];
  // count,accounting یا count+accounting
  const parts = s.split(/[,+|]/).map((x) => x.trim()).filter(Boolean);
  const mods = [];
  for (const p of parts) {
    if (p === 'count' && !mods.includes('count')) mods.push('count');
    if ((p === 'accounting' || p === 'acc') && !mods.includes('accounting')) mods.push('accounting');
  }
  if (!mods.length) throw new Error('ماژول نامعتبر است. از count | accounting | full استفاده کنید.');
  return mods;
}

function planFromModules(mods) {
  if (mods.includes('count') && mods.includes('accounting')) return 'full';
  if (mods.includes('count')) return 'count';
  if (mods.includes('accounting')) return 'accounting';
  return 'full';
}

function addDays(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeLicenseKey(opts) {
  const modules = opts.modules;
  const plan = opts.plan || planFromModules(modules);
  const device = opts.demo ? null : opts.device || null;
  if (!opts.demo && !device) {
    throw new Error('برای لایسنس واقعی --device الزامی است (شناسه دستگاه از تنظیمات برنامه).');
  }
  const body = {
    org: opts.org || 'مشتری',
    exp: opts.exp || addDays(opts.days || 365),
    plan,
    modules,
    device,
    demo: !!opts.demo,
    v: LICENSE_FORMAT_V,
    iat: new Date().toISOString().slice(0, 10),
  };
  const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64');
  // سازگار با btoa در مرورگر برای کاراکترهای فارسی: encodeURIComponent path
  const payloadBrowserCompat = Buffer.from(
    unescape(encodeURIComponent(JSON.stringify(body))),
    'binary'
  ).toString('base64');
  // برنامه با decodeURIComponent(escape(atob(payload))) می‌خواند → همان مسیر مرورگر
  const finalPayload = payloadBrowserCompat;
  const sig = licenseSign(finalPayload);
  return {
    key: 'ANB3.' + finalPayload + '.' + sig,
    body,
  };
}

function printHelp() {
  console.log(`
صادرکننده لایسنس انبارین پرو (ANB3)

مثال‌ها:
  node scripts/issue-license.mjs --device Dxxxx --org "فروشگاه الف" --modules full --days 365
  node scripts/issue-license.mjs --device Dxxxx --modules count --exp 2027-06-30
  node scripts/issue-license.mjs --device Dxxxx --modules accounting --days 180
  node scripts/issue-license.mjs --demo --org "تست داخلی" --modules full --days 30

گزینه‌ها:
  --device   شناسه دستگاه (الزامی مگر --demo)
  --org      نام مشتری
  --modules  count | accounting | full
  --days     تعداد روز اعتبار از امروز (پیش‌فرض 365)
  --exp      تاریخ انقضا YYYY-MM-DD (اگر باشد بر days اولویت دارد)
  --plan     اختیاری؛ اگر نباشد از modules ساخته می‌شود
  --demo     کلید آزمایشی بدون قفل دستگاه
  --help     راهنما
`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  try {
    const modules = resolveModules(args.modules);
    const { key, body } = makeLicenseKey({
      org: args.org,
      device: args.device,
      modules,
      plan: args.plan || planFromModules(modules),
      days: args.days,
      exp: args.exp,
      demo: args.demo,
    });
    console.log('— لایسنس صادر شد —');
    console.log('مشتری :', body.org);
    console.log('ماژول‌ها:', body.modules.join(' + '));
    console.log('طرح   :', body.plan);
    console.log('انقضا :', body.exp);
    console.log('دستگاه:', body.device || '(demo — بدون قفل)');
    console.log('');
    console.log(key);
    console.log('');
    console.log('این کلید را در برنامه: تنظیمات → لایسنس وارد کنید.');
  } catch (e) {
    console.error('خطا:', e.message || e);
    printHelp();
    process.exit(1);
  }
}

main();
