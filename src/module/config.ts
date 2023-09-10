import * as dotenv from 'dotenv';
import * as path from 'path';
import { IConfig, IEnvironment } from '../interface/config';

/**
 * Load environment var from .env file.
 */
const parse = dotenv.config({
    path: path.join(__dirname, '..', '..', '.env'),
});

/**
 * Load or replace define env.
 */
if (!parse.error) {
    process.env = { ...process.env, ...parse.parsed } as any;
}

/**
 * Setup app config env file.
 */
const configuration: IConfig = {
    dev: {
        app: {
            name: process.env.APP_NAME || Math.random().toString(),
            port: 9090,
            backendSecret: process.env.APP_SECRET || '<Your-Backend-Secret-Key>',
            backendUrl:
                process.env.BACKEND_URL || 'http://backend-dev',
            socketKey:
                process.env.APP_SOCKET_PASS_KEY || '<Your-Socket-Key>',
        },

        auth: {
            key:
                process.env.APP_ACCESS_KEY ||
                '402a190a-cb18-4a4d-bca7-77ac97459f87',
            secret:
                process.env.APP_ACCESS_SECRET ||
                '<Generated-Jwt-Token>',
        },

        logs: {
            level: process.env.PINO_LOG_LEVEL || 'debug',
        },

        redis: {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: parseInt(String(process.env.REDIS_PORT || 6379)),
        },
    },
};

/**
 * Default environment to load is dev.
 */
const loadEnv: string = process.env.APP_ENV || 'dev';

/**
 * Return configuration on-demand.
 */
export default (): IEnvironment => configuration[loadEnv];
