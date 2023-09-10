import Log from './module/logger';
import config from './module/config';
import { SocketManager } from './server/SocketManager';

/**
 * Ce module est un protocole de communication axé sur les websockets.
 * Il est chargé d'écouter les requêtes socket des applications mobiles
 * et de construire des requêtes API pour obtenir des réponses aux demandes.
 */
const bootstrap = async () => {
    // App instance Id.
    const $uniqid = Math.floor(Math.random() * 1000000);

    // Load environment.
    const $env = config();

    // Load Logger with proper output level.
    const $logger = Log($env);

    // Start Modem Server manager.
    const $server = new SocketManager($logger, $env);

    process.on('SIGINT', async () => {
        $logger.debug('[APP] (SIGINT) : Killing app event received');

        // Block all new request.
        $server.blockNewRequest();

        // Wait 4s before killing app.
        setTimeout(() => {
            // Stop server first.
            $server.closeServer();
            $logger.debug('[APP] (SIGINT) : Application killed !');
            // Stop app.
            process.exit(0);
        }, 4000);
    });
};

bootstrap();
