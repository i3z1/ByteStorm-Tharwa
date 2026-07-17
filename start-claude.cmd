@echo off
setlocal
cd /d "%~dp0"
set "NODE_ROOT=C:\Users\Xxsau\tools\node-v24.18.0-win-x64"
set "PATH=%NODE_ROOT%;%PATH%"
set "CLAUDE_CMD=%NODE_ROOT%\claude.cmd"

if not exist "%CLAUDE_CMD%" (
  echo Claude Code is not installed or is not on PATH.
  echo Install it using Anthropic's official instructions, then run this file again.
  echo https://docs.anthropic.com/en/docs/claude-code/getting-started
  pause
  exit /b 1
)

call "%CLAUDE_CMD%" "Read CLAUDE.md completely before acting. Work on this Tharwa project using normal permission prompts only. Never bypass permissions, authentication, sandboxing, or secret protections. Preserve existing work, validate changes, and follow the documented production deployment and live-verification workflow when the user requests a website change."
endlocal
