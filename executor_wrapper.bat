@echo off
REM executor_wrapper.bat - Safe wrapper for FacebookPro Blaster Telegram bot calls (Windows)
REM This ensures proper environment and working directory
REM Supports both development and production (encrypted) modes

setlocal enabledelayedexpansion

REM Set timezone
set TZ=Asia/Jakarta

REM Set NODE_ENV (default to production for encrypted mode)
if not defined NODE_ENV set NODE_ENV=production

REM Get script directory
set "SCRIPT_DIR=%~dp0"
set "BOT_DIR=%SCRIPT_DIR%"
set "BASE_DIR=%SCRIPT_DIR%.."

REM Change to bot directory
cd /d "%BOT_DIR%" || (
    echo ❌ Failed to change to bot directory: %BOT_DIR%
    exit /b 1
)

REM Determine which executor to use
REM Development: executor.js exists (with extension)
REM Production: executor exists (without extension, obfuscated by build.js)

if exist "executor.js" (
    set "EXECUTOR_CMD=node executor.js"
    echo ℹ️  Using Node.js executor (development): executor.js
) else if exist "executor" (
    set "EXECUTOR_CMD=node executor"
    echo ℹ️  Using Node.js executor (production): executor
) else (
    echo ❌ No executor found in %BOT_DIR%
    echo    Looking for: executor.js (dev) or executor (prod)
    exit /b 1
)

REM Parse arguments
set "COMMAND=%~1"
set "BOT_NAME=%~2"
set "ACCOUNT_ID=%~3"

REM Validate minimum arguments
if "%COMMAND%"=="" (
    echo ❌ Usage: %~nx0 ^<command^> [bot_name] [account_id]
    echo    Examples:
    echo    %~nx0 status
    echo    %~nx0 list
    echo    %~nx0 run updatestatus account1
    echo    %~nx0 validate-cookies
    exit /b 1
)

REM Create log directory
set "LOG_DIR=%BASE_DIR%\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM Set log file
if not "%BOT_NAME%"=="" if not "%ACCOUNT_ID%"=="" (
    set "LOG_FILE=%LOG_DIR%\telegram_executor_%ACCOUNT_ID%_%BOT_NAME%_%date:~-4,4%%date:~-7,2%%date:~-10,2%_%time:~0,2%%time:~3,2%%time:~6,2%.log"
) else (
    set "LOG_FILE=%LOG_DIR%\telegram_executor_%COMMAND%_%date:~-4,4%%date:~-7,2%%date:~-10,2%_%time:~0,2%%time:~3,2%%time:~6,2%.log"
)

REM Remove spaces from log filename
set "LOG_FILE=%LOG_FILE: =0%"

REM Log execution info
echo === FacebookPro Blaster Executor Call === > "%LOG_FILE%"
echo Time: %date% %time% >> "%LOG_FILE%"
echo Mode: %NODE_ENV% >> "%LOG_FILE%"
echo Executor: %EXECUTOR_CMD% >> "%LOG_FILE%"
echo Command: %COMMAND% >> "%LOG_FILE%"
if not "%BOT_NAME%"=="" echo Bot: %BOT_NAME% >> "%LOG_FILE%"
if not "%ACCOUNT_ID%"=="" echo Account: %ACCOUNT_ID% >> "%LOG_FILE%"
echo Working Dir: %CD% >> "%LOG_FILE%"
echo Node Version: >> "%LOG_FILE%"
node --version >> "%LOG_FILE%" 2>&1
echo ========================================== >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

REM Execute with proper error handling
if not "%ACCOUNT_ID%"=="" (
    REM Full command with bot and account
    %EXECUTOR_CMD% "%COMMAND%" "%BOT_NAME%" "%ACCOUNT_ID%" 2>&1 | tee -a "%LOG_FILE%"
    set EXIT_CODE=!ERRORLEVEL!
) else if not "%BOT_NAME%"=="" (
    REM Command with bot only
    %EXECUTOR_CMD% "%COMMAND%" "%BOT_NAME%" 2>&1 | tee -a "%LOG_FILE%"
    set EXIT_CODE=!ERRORLEVEL!
) else (
    REM Command only
    %EXECUTOR_CMD% "%COMMAND%" 2>&1 | tee -a "%LOG_FILE%"
    set EXIT_CODE=!ERRORLEVEL!
)

REM Log exit status
echo. >> "%LOG_FILE%"
echo ========================================== >> "%LOG_FILE%"
echo Exit Code: !EXIT_CODE! >> "%LOG_FILE%"
echo Completed: %date% %time% >> "%LOG_FILE%"

REM Return the exit code
exit /b !EXIT_CODE!
