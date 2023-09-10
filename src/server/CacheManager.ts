import { Logger } from 'pino';
import { IEnvironment } from '../interface/config';

export class CacheManager {
    public readonly $logger: Logger;
    public readonly $environment: IEnvironment;

    constructor($logger: Logger, $env: IEnvironment) {
        // Set logger instance.
        this.$logger = $logger;

        // Set environnement.
        this.$environment = $env;
    }
}
