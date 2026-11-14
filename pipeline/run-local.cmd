@echo off
rem Fonts que nomes es poden llegir des del PC de casa (config.runner = "local"): l'Agenda de Barcelona
rem (Open Data BCN) respon 403 als servidors de GitHub. L'executa cada dia la tasca programada de Windows
rem "Event Selector - Agenda BCN" (si el PC estava apagat, en engegar-lo). Registre: pipeline\logs\local-run.log
cd /d "%~dp0"
if not exist logs mkdir logs
set PYTHONIOENCODING=utf-8
echo ==== %date% %time% >> logs\local-run.log
".venv\Scripts\python.exe" -m event_pipeline.run --source bcn --no-summaries >> logs\local-run.log 2>&1
echo exit %errorlevel% >> logs\local-run.log
