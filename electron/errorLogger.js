const path = require('path');
const fs = require('fs');

const LOG_FILE = path.join(__dirname, 'startup_error.log');

function logToFile(msg) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}\n`;
    try {
        fs.appendFileSync(LOG_FILE, logMsg);
    } catch (e) {}
}

function initErrorHandlers() {
    process.on('uncaughtException', (error) => {
        const msg = `UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}`;
        console.error(msg);
        logToFile(msg);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        const msg = `UNHANDLED REJECTION: ${reason}`;
        console.error(msg);
        logToFile(msg);
    });

    logToFile("App starting...");
}

module.exports = { initErrorHandlers, logToFile };
