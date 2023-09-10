import pino from 'pino';
import { IEnvironment } from '../interface/config';

export default (environment: IEnvironment) => {
    return pino({
        level: environment.logs.level,
    });
};
