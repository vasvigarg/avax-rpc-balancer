// Basic logger - consider using Winston or Pino for more features in production

const logLevel = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';

const levels: { [key: string]: number } = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

const currentLevel = levels[logLevel] !== undefined ? levels[logLevel] : levels.INFO;

function log(level: number, message: string, ...args: any[]) {
    if (level >= currentLevel) {
        const timestamp = new Date().toISOString();
        const levelName = Object.keys(levels).find(key => levels[key] === level);
        console.log(`[${timestamp}] [${levelName}]`, message, ...args);
    }
}

export const logger = {
    debug: (message: string, ...args: any[]) => log(levels.DEBUG, message, ...args),
    info: (message: string, ...args: any[]) => log(levels.INFO, message, ...args),
    warn: (message: string, ...args: any[]) => log(levels.WARN, message, ...args),
    error: (message: string, ...args: any[]) => log(levels.ERROR, message, ...args),
};