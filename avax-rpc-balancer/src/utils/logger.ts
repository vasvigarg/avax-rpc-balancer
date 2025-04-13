import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { v4 as uuidv4 } from 'uuid';

// Environment configurations
const LOG_LEVEL = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
const LOG_TO_FILE = process.env.LOG_TO_FILE === 'true';
const LOG_DIR = process.env.LOG_DIR || './logs';
const MAX_LOG_SIZE = parseInt(process.env.MAX_LOG_SIZE || '10485760', 10); // 10MB default

// Create logs directory if it doesn't exist
if (LOG_TO_FILE) {
    try {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
    } catch (error) {
        console.error('Failed to create log directory:', error);
    }
}

// Log level definitions
const levels: { [key: string]: number } = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

const levelColors: { [key: string]: string } = {
    DEBUG: '\x1b[34m', // Blue
    INFO: '\x1b[32m',  // Green
    WARN: '\x1b[33m',  // Yellow
    ERROR: '\x1b[31m', // Red
};

const RESET_COLOR = '\x1b[0m';

// Set current log level
const currentLevel = levels[LOG_LEVEL] !== undefined ? levels[LOG_LEVEL] : levels.INFO;

// Store request context for each request ID
const requestContext = new Map<string, any>();

/**
 * Main logging function
 */
function log(level: number, message: string, ...args: any[]) {
    if (level >= currentLevel) {
        const timestamp = new Date().toISOString();
        const levelName = Object.keys(levels).find(key => levels[key] === level) || 'UNKNOWN';
        
        // Format args for better readability
        const formattedArgs = args.map(arg => {
            if (typeof arg === 'object') {
                return util.inspect(arg, { depth: 5, colors: !LOG_TO_FILE });
            }
            return arg;
        });
        
        // Create log entry
        const colorStart = levelColors[levelName] || '';
        const logEntry = `[${timestamp}] ${colorStart}[${levelName}]${RESET_COLOR} ${message}`;
        
        // Log to console
        console.log(logEntry, ...formattedArgs);
        
        // Log to file if enabled
        if (LOG_TO_FILE) {
            try {
                const logFile = path.join(LOG_DIR, `${levelName.toLowerCase()}.log`);
                const fileEntry = `[${timestamp}] [${levelName}] ${message} ${formattedArgs.join(' ')}\n`;
                
                // Rotate log if it's too big
                checkAndRotateLogFile(logFile);
                
                // Append to log file
                fs.appendFileSync(logFile, fileEntry);
            } catch (error) {
                console.error('Failed to write to log file:', error);
            }
        }
    }
}

/**
 * Rotate log file if it exceeds maximum size
 */
function checkAndRotateLogFile(logFile: string): void {
    try {
        if (fs.existsSync(logFile)) {
            const stats = fs.statSync(logFile);
            if (stats.size >= MAX_LOG_SIZE) {
                const timestamp = new Date().toISOString().replace(/:/g, '-');
                const rotatedFile = `${logFile}.${timestamp}`;
                fs.renameSync(logFile, rotatedFile);
            }
        }
    } catch (error) {
        console.error('Error rotating log file:', error);
    }
}

/**
 * Main logger object
 */
export const logger = {
    debug: (message: string, ...args: any[]) => log(levels.DEBUG, message, ...args),
    info: (message: string, ...args: any[]) => log(levels.INFO, message, ...args),
    warn: (message: string, ...args: any[]) => log(levels.WARN, message, ...args),
    error: (message: string, ...args: any[]) => log(levels.ERROR, message, ...args),
    
    // Add context to the log message
    withContext: (context: object) => {
        return {
            debug: (message: string, ...args: any[]) => log(levels.DEBUG, message, { ...context, ...args }),
            info: (message: string, ...args: any[]) => log(levels.INFO, message, { ...context, ...args }),
            warn: (message: string, ...args: any[]) => log(levels.WARN, message, { ...context, ...args }),
            error: (message: string, ...args: any[]) => log(levels.ERROR, message, { ...context, ...args }),
        };
    },
    
    // Get context for a request
    getRequestContext: (requestId: string) => {
        return requestContext.get(requestId) || {};
    },
    
    // Set context for a request
    setRequestContext: (requestId: string, context: any) => {
        requestContext.set(requestId, { ...requestContext.get(requestId), ...context });
    },
    
    // Clean up context when done
    clearRequestContext: (requestId: string) => {
        requestContext.delete(requestId);
    }
};

/**
 * Request logging middleware for Express
 * Logs incoming requests and their responses
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
    // Generate a unique ID for this request
    const requestId = uuidv4();
    req.headers['x-request-id'] = requestId;
    
    // Store the request start time
    const startTime = Date.now();
    
    // Initial request context
    const reqContext = {
        requestId,
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.socket.remoteAddress,
    };
    
    // Store context
    logger.setRequestContext(requestId, reqContext);
    
    // Create a request-specific logger
    const reqLogger = logger.withContext(reqContext);
    
    // Log request details
    reqLogger.info(`Incoming ${req.method} request`);
    
    if (currentLevel <= levels.DEBUG) {
        // Only log full request details in debug mode
        reqLogger.debug('Request headers', req.headers);
        
        if (req.body && Object.keys(req.body).length > 0) {
            reqLogger.debug('Request body', req.body);
        }
    }
    
    // Capture the original end method
    const originalEnd = res.end;
    
    // Override end method using a type assertion
    // @ts-ignore - Suppressing TypeScript error since we're handling the typing manually
    res.end = function(chunk?: any, encoding?: BufferEncoding | (() => void), callback?: () => void) {
        // Calculate request duration
        const duration = Date.now() - startTime;
        
        // Update request context
        logger.setRequestContext(requestId, {
            ...logger.getRequestContext(requestId),
            statusCode: res.statusCode,
            duration,
        });
        
        // Create an updated request logger
        const responseLogger = logger.withContext(logger.getRequestContext(requestId));
        
        // Determine log level based on status code
        const logFn = res.statusCode >= 500
            ? responseLogger.error
            : res.statusCode >= 400
                ? responseLogger.warn
                : responseLogger.info;
        
        // Log response details
        logFn(`Response sent in ${duration}ms with status ${res.statusCode}`);
        
        // Cleanup
        logger.clearRequestContext(requestId);
        
        // Handle different overloads
        if (typeof encoding === 'function') {
            // This is the case where encoding is actually the callback
            return originalEnd.call(this, chunk, 'utf8', encoding);
        } else {
            // Normal case
            return originalEnd.call(this, chunk, encoding || 'utf8', callback);
        }
    };
    
    next();
}

/**
 * Error logging middleware for Express
 * Logs errors that occur during request processing
 */
export function errorLoggerMiddleware(err: Error, req: Request, res: Response, next: NextFunction) {
    const requestId = req.headers['x-request-id'] as string || 'unknown';
    
    // Get or create request context
    let reqContext = logger.getRequestContext(requestId);
    if (!reqContext || Object.keys(reqContext).length === 0) {
        reqContext = {
            requestId,
            method: req.method,
            url: req.originalUrl || req.url,
        };
        logger.setRequestContext(requestId, reqContext);
    }
    
    // Create error context
    const errorContext = {
        ...reqContext,
        error: {
            name: err.name,
            message: err.message,
            stack: err.stack,
        },
    };
    
    // Log the error with context
    logger.withContext(errorContext).error(`Error processing request: ${err.message}`);
    
    // Pass to next error handler
    next(err);
}

/**
 * JSON-RPC method logger middleware
 * Specifically for logging RPC method calls
 */
export function rpcMethodLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
    if (req.body && (req.body.method || Array.isArray(req.body))) {
        const requestId = req.headers['x-request-id'] as string;
        
        // Extract RPC methods being called
        let methods: string[] = [];
        
        if (Array.isArray(req.body)) {
            // Batch request
            methods = req.body.map((item: any) => item.method || 'unknown').filter(Boolean);
            logger.setRequestContext(requestId, {
                ...logger.getRequestContext(requestId),
                rpcBatch: true,
                rpcMethods: methods,
                rpcCount: methods.length,
            });
            
            logger.withContext(logger.getRequestContext(requestId))
                .info(`Processing RPC batch with ${methods.length} methods: ${methods.join(', ')}`);
        } else {
            // Single request
            methods = [req.body.method];
            logger.setRequestContext(requestId, {
                ...logger.getRequestContext(requestId),
                rpcBatch: false,
                rpcMethod: req.body.method,
                rpcParams: req.body.params,
                rpcId: req.body.id,
            });
            
            logger.withContext(logger.getRequestContext(requestId))
                .info(`Processing RPC method: ${req.body.method}`);
        }
    }
    
    next();
}