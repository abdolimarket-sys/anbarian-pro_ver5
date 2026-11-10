#!/usr/bin/env node
/**
 * صدور لایسنس آفلاین حرفه‌ای انبارین (فایل .anblic با امضای RSA-SHA256)
 *
 *   node scripts/issue-offline-license.mjs --device DEVICE_ID --org "مشتری" --modules full --days 365
 *
 * خروجی: فایل JSON/anblic که مشتری در تنظیمات → فعال‌سازی لایسنس آفلاین بارگذاری می‌کند.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIVATE_KEY_PATH = path.join(__dirname, 'keys', 'private.pem');
const KEY_ID = 'anbarin-issuer-v1';

function parseArgs(argv) {
  const out = {
    org: 'مشتری',
    modules: 'full',
    days: 365,
    exp: null,
    device: null,
    out: null,
    help: false,
    ref: '',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--org' && n) { out.org = n; i++; }
    else if (a === '--device' && n) { out.device = n; i++; }
    else if (a === '--modules' && n) { out.modules = n; i++; }
    else if (a === '--days' && n) { out.days = Number(n); i++; }
    else if (a === '--exp' && n) { out.exp = n; i++; }
    else if (a === '--out' && n) { out.out = n; i++; }
    else if (a === '--ref' && n) { out.ref = n; i++; }
    else { console.error('آرگومان ناشناخته:', a); out.help = true; }
  }
  return out;
}

function resolveModules(spec) {
  const s = String(spec || 'full').trim().toLowerCase();
  if (s === 'full' || s === 'complete' || s === 'all') return ['count', 'accounting'];
  if (s === 'count' || s === 'inventory' || s === 'stock') return ['count'];
  if (s === 'accounting' || s === 'acc' || s === 'finance') return ['accounting'];
  const parts = s.split(/[,+|]/).map((x) => x.trim()).filter(Boolean);
  const mods = [];
  for (const p of parts) {
    if (p === 'count' && !mods.includes('count')) mods.push('count');
    if ((p === 'accounting' || p === 'acc') && !mods.includes('accounting')) mods.push('accounting');
  }
  if (!mods.length) throw new Error('ماژول: count | accounting | full');
  return mods;
}

function planFromModules(mods) {
  if (mods.includes('count') && mods.includes('accounting')) return 'full';
  if (mods.includes('count')) return 'count';
  return 'accounting';
}

function addDays(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Number(days || 365));
  return d.toISOString().slice(0, 10);
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function help() {
  console.log(`
صدور لایسنس آفلاین RSA انبارین (.anblic)

  node scripts/issue-offline-license.mjs --device DEVICE_ID --org "نام" --modules full --days 365
  node scripts/issue-offline-license.mjs --device DEVICE_ID --modules count --exp 2027-12-31 --out ./client.anblic

گزینه‌ها:
  --device   شناسه دستگاه (الزامی)
  --org      نام مشتری
  --modules  count | accounting | full
  --days     روز اعتبار (پیش‌فرض 365)
  --exp      تاریخ انقضا YYYY-MM-DD
  --out      مسیر فایل خروجی
  --ref      کد ارجاع اختیاری
`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) { help(); process.exit(0); }
  if (!args.device) {
    console.error('خطا: --device الزامی است');
    help();
    process.exit(1);
  }
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error('کلید خصوصی پیدا نشد:', PRIVATE_KEY_PATH);
    process.exit(1);
  }
  const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  const modules = resolveModules(args.modules);
  const validUntil = args.exp || addDays(args.days);
  const licenseId = 'LIC-' + crypto.randomBytes(8).toString('hex').toUpperCase();
  const payload = {
    schemaVersion: 1,
    applicationId: 'com.anbarian.app',
    licenseId,
    customerName: args.org,
    customerReference: args.ref || undefined,
    plan: planFromModules(modules),
    modules,
    issuedAt: new Date().toISOString(),
    validUntil,
    deviceId: args.device,
    maxDevices: 1,
    status: 'active',
    transferRequiresIssuerApproval: true,
  };
  // حذف فیلدهای undefined برای JSON تمیز
  if (!payload.customerReference) delete payload.customerReference;

  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(payloadBytes);
  sign.end();
  const signature = sign.sign(privateKey);

  const envelope = {
    format: 'ANBARIN-LICENSE',
    algorithm: 'RS256',
    keyId: KEY_ID,
    payload: b64url(payloadBytes),
    signature: b64url(signature),
  };

  const outPath =
    args.out ||
    path.join(process.cwd(), `anbarin-license-${modules.join('-')}-${validUntil}.anblic`);
  fs.writeFileSync(outPath, JSON.stringify(envelope, null, 2), 'utf8');

  console.log('— لایسنس آفلاین صادر شد —');
  console.log('شناسه  :', licenseId);
  console.log('مشتری  :', payload.customerName);
  console.log('ماژول  :', modules.join(' + '));
  console.log('انقضا  :', validUntil);
  console.log('دستگاه :', args.device);
  console.log('فایل   :', outPath);
  console.log('');
  console.log('فایل را به مشتری بدهید تا در تنظیمات → فعال‌سازی لایسنس آفلاین بارگذاری کند.');
}

main();
