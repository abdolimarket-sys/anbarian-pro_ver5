# -*- coding: utf-8 -*-
"""Anbarin Pro offline license issuer. Private key never belongs in the Android app."""
import base64, csv, json, os, uuid
from datetime import date, datetime, timezone
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

APP_ID = "com.anbarian.app"
SCHEMA = 1

def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def canonical(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

class Issuer(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Anbarin Pro | Offline License Issuer")
        self.geometry("760x650")
        self.minsize(680, 600)
        self.key_dir = tk.StringVar(value=str(Path.home() / "AnbarinLicenseKeys"))
        self.customer = tk.StringVar()
        self.customer_ref = tk.StringVar()
        self.device = tk.StringVar()
        self.expiry = tk.StringVar(value="2099-12-31")
        self.plan = tk.StringVar(value="standard")
        self.note = tk.StringVar()
        self._build()

    def _build(self):
        root = ttk.Frame(self, padding=18); root.pack(fill="both", expand=True)
        ttk.Label(root, text="صدور آفلاین لایسنس اختصاصی انبارین پرو", font=("Segoe UI", 16, "bold")).pack(anchor="e", pady=(0, 12))
        ttk.Label(root, text="کلید خصوصی فقط روی کامپیوتر شما نگهداری می‌شود؛ آن را برای مشتری ارسال نکنید.", foreground="#9b2c2c").pack(anchor="e", pady=(0, 14))
        grid = ttk.Frame(root); grid.pack(fill="x")
        fields = [
            ("نام مشتری", self.customer), ("شناسه مشتری / قرارداد", self.customer_ref),
            ("شناسه نصب دستگاه (Device ID)", self.device), ("تاریخ انقضا (YYYY-MM-DD)", self.expiry),
            ("پلن", self.plan), ("یادداشت داخلی", self.note),
        ]
        for i,(label,var) in enumerate(fields):
            ttk.Label(grid, text=label).grid(row=i, column=1, sticky="e", padx=8, pady=7)
            ttk.Entry(grid, textvariable=var, width=58).grid(row=i, column=0, sticky="ew", padx=8, pady=7)
        grid.columnconfigure(0, weight=1)
        ttk.Separator(root).pack(fill="x", pady=14)
        ttk.Label(root, text="محل نگهداری کلیدها").pack(anchor="e")
        row=ttk.Frame(root); row.pack(fill="x", pady=6)
        ttk.Entry(row, textvariable=self.key_dir).pack(side="left", fill="x", expand=True)
        ttk.Button(row, text="انتخاب پوشه", command=self.pick_dir).pack(side="left", padx=6)
        actions=ttk.Frame(root); actions.pack(fill="x", pady=12)
        ttk.Button(actions, text="۱) ایجاد کلیدهای امضای من", command=self.create_keys).pack(side="right", padx=5)
        ttk.Button(actions, text="۲) صدور فایل لایسنس", command=self.issue).pack(side="right", padx=5)
        ttk.Button(actions, text="خروجی کلید عمومی", command=self.export_public).pack(side="right", padx=5)
        self.status=tk.Text(root, height=10, wrap="word")
        self.status.pack(fill="both", expand=True)
        self.log("ابتدا یک‌بار کلیدها را ایجاد کنید. سپس شناسه دستگاه مشتری را از داخل برنامه دریافت و اینجا وارد کنید.\nکلید خصوصی را در محل امن و دارای نسخه پشتیبان نگهداری کنید.")

    def log(self, msg):
        self.status.insert("end", msg + "\n"); self.status.see("end")

    def pick_dir(self):
        d=filedialog.askdirectory()
        if d: self.key_dir.set(d)

    def key_paths(self):
        d=Path(self.key_dir.get()).expanduser()
        d.mkdir(parents=True, exist_ok=True)
        return d, d/"anbarin-license-private.pem", d/"anbarin-license-public.pem"

    def create_keys(self):
        try:
            from cryptography.hazmat.primitives.asymmetric import rsa
            from cryptography.hazmat.primitives import serialization
            from cryptography.hazmat.backends import default_backend
            d, priv, pub=self.key_paths()
            if priv.exists() or pub.exists():
                if not messagebox.askyesno("کلید موجود است", "کلید فعلی بازنویسی شود؟ این کار لایسنس‌های قبلی را غیرقابل‌تأیید می‌کند."):
                    return
            password=tk.simpledialog.askstring("رمز کلید خصوصی", "یک رمز قوی برای محافظت از کلید خصوصی وارد کنید:", show="*")
            if not password or len(password)<12:
                messagebox.showerror("رمز نامعتبر", "رمز باید حداقل ۱۲ نویسه باشد."); return
            key=rsa.generate_private_key(public_exponent=65537, key_size=3072)
            priv.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.BestAvailableEncryption(password.encode())))
            pub.write_bytes(key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
            try: os.chmod(priv, 0o600)
            except OSError: pass
            self.log(f"کلیدها ایجاد شدند:\n{priv}\n{pub}\nاز کلید خصوصی نسخه پشتیبان امن بگیرید. آن را در APK یا برای مشتری قرار ندهید.")
            messagebox.showinfo("انجام شد", "کلیدهای امضا ساخته شدند.")
        except Exception as e: messagebox.showerror("خطا", str(e))

    def export_public(self):
        try:
            _,_,pub=self.key_paths()
            if not pub.exists(): raise FileNotFoundError("ابتدا کلیدها را ایجاد کنید.")
            dest=filedialog.asksaveasfilename(defaultextension=".pem", initialfile="anbarin-license-public.pem")
            if dest:
                Path(dest).write_bytes(pub.read_bytes())
                self.log("کلید عمومی صادر شد: "+dest)
        except Exception as e: messagebox.showerror("خطا", str(e))

    def issue(self):
        try:
            from cryptography.hazmat.primitives import serialization, hashes
            from cryptography.hazmat.primitives.asymmetric import padding
            from cryptography.exceptions import InvalidSignature
            customer=self.customer.get().strip()
            device=self.device.get().strip()
            exp=self.expiry.get().strip()
            if not customer or not device: raise ValueError("نام مشتری و شناسه دستگاه الزامی است.")
            date.fromisoformat(exp)
            d, priv, pub=self.key_paths()
            if not priv.exists(): raise FileNotFoundError("ابتدا کلید خصوصی را ایجاد کنید.")
            password=tk.simpledialog.askstring("رمز کلید خصوصی", "رمز کلید خصوصی را وارد کنید:", show="*")
            if not password: return
            key=serialization.load_pem_private_key(priv.read_bytes(), password=password.encode())
            payload={
                "schemaVersion": SCHEMA, "applicationId": APP_ID,
                "licenseId": str(uuid.uuid4()), "customerName": customer,
                "customerReference": self.customer_ref.get().strip(),
                "plan": self.plan.get().strip() or "standard",
                "issuedAt": utc_now(), "validUntil": exp,
                "deviceId": device, "maxDevices": 1,
                "status": "active", "transferRequiresIssuerApproval": True,
                "internalNote": self.note.get().strip()
            }
            signature=key.sign(canonical(payload), padding.PKCS1v15(), hashes.SHA256())
            envelope={"format":"ANBARIN-LICENSE","algorithm":"RS256","keyId":"anbarin-offline-2026-01",
                      "payload":base64.urlsafe_b64encode(canonical(payload)).decode().rstrip("="),
                      "signature":base64.urlsafe_b64encode(signature).decode().rstrip("=")}
            dest=filedialog.asksaveasfilename(defaultextension=".anblic", initialfile="Anbarin-"+payload["licenseId"][:8]+".anblic",
                    filetypes=[("Anbarin License","*.anblic"),("JSON","*.json")])
            if not dest: return
            Path(dest).write_text(json.dumps(envelope,ensure_ascii=False,indent=2),encoding="utf-8")
            self.log(f"لایسنس صادر شد: {dest}\nشناسه لایسنس: {payload['licenseId']}\nدستگاه: {device}\nانقضا: {exp}")
            messagebox.showinfo("صدور موفق", "فایل لایسنس صادر شد. فقط همین فایل را برای مشتری ارسال کنید؛ نه کلید خصوصی را.")
        except Exception as e: messagebox.showerror("صدور ناموفق", str(e))

if __name__ == "__main__":
    # tkinter.simpledialog is loaded explicitly for password prompts
    import tkinter.simpledialog
    Issuer().mainloop()
