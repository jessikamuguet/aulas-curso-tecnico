@echo off
cd /d "%~dp0.."
venv\Scripts\python servidor.py
if errorlevel 1 pause
