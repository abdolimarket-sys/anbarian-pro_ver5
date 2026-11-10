@echo off
setlocal
py -3 -m venv .venv
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
pyinstaller --noconfirm --clean --onefile --windowed --name AnbarinLicenseIssuer license_issuer.py
echo.
echo Build complete: dist\AnbarinLicenseIssuer.exe
pause
