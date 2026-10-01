@echo off
rem Starts the game on this PC and on the local network, for testing on a phone.
rem Open the "Network" address it prints on a phone that is on the same Wi-Fi.
set "PATH=D:\LocalAI\Apps\node;%PATH%"
cd /d "%~dp0"
call npm run dev -- --host --port 5184
pause
