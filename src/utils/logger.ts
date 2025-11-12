import pino from 'pino';
import { config } from '../config.js';

// Create logger instance with appropriate settings
export const logger = pino({
  level: config.logLevel,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // In development, use pretty printing for better readability
  ...(config.isDevelopment() && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }),
});

// Create child loggers for different components
export const createComponentLogger = (component: string) => {
  return logger.child({ component });
};

// Specific component loggers
export const apiLogger = createComponentLogger('api');
export const workerLogger = createComponentLogger('worker');
export const dbLogger = createComponentLogger('database');
export const queueLogger = createComponentLogger('queue');
export const dashboardLogger = createComponentLogger('dashboard');
