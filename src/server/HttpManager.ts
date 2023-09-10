import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { Logger } from 'pino';
import { createHmac } from 'crypto';
import { IEnvironment } from '../interface/config';
import { IAppConfiguration, ICommon } from '../interface/http';
import { IWsDataEvent } from '../interface/socket';

export class HttpManager {
    public readonly $logger: Logger;
    public readonly $environment: IEnvironment;

    private $configuration: IAppConfiguration = null;

    constructor($logger: Logger, $env: IEnvironment) {
        // Set logger instance.
        this.$logger = $logger;

        // Set environnement.
        this.$environment = $env;
    }

    public async loadConfiguration() {
        const response: ICommon = await this.curl(
            {
                url: '/app/configuration',
                method: 'GET',
            },
            false,
        );

        this.$logger.debug(
            `[HTTP] (Configuration) : Load events configuration ${response.statusCode}`,
        );

        if (response.statusCode != 200) {
            // Replay sequence every 2 secs.
            setTimeout(this.loadConfiguration.bind(this), 2000);
            return false;
        }

        // Health check every 3mins.
        setTimeout(this.loadConfiguration.bind(this), 180000);

        // Save backend API configuration.
        this.$configuration = response.values as IAppConfiguration;
        return true;
    }

    public async getResponse(
        event: IWsDataEvent,
        token: string,
    ): Promise<ICommon> {
        const route = this.getHttpPathUrl(
            event.type,
            !!(event.data && Object.keys(event.data).length > 0),
        );

        if (!route) {
            // Build unknown response;
            return {
                statusCode: 404,
                i18n: 'unknown-request',
                reason: 'Requête inconnue',
            } as ICommon;
        }

        // Construct request config.
        const request: AxiosRequestConfig = {
            url: route.path,
            method: route.method,
        };

        // Set authorization if defined.
        if (token) {
            request.headers = {
                Authorization: `Bearer ${token}`,
            };
        }

        // Set request data if defined.
        if (route.method != 'GET') {
            request.data = event.data;
        }

        //
        return await this.curl(request);
    }

    public async getAvailableCourses(
        event: string,
        channel: string,
    ): Promise<ICommon> {
        //
        const route = this.getHttpPathUrl(event, true);

        if (!route) {
            // Build unknown response;
            return {
                statusCode: 404,
                i18n: 'unknown-request',
                reason: 'Requête inconnue',
            } as ICommon;
        }

        // Construct request config.
        const request: AxiosRequestConfig = {
            url: route.path,
            method: route.method,
        };

        // Build Socket authentication.
        const secret = this.$environment.app.backendSecret;
        const socketPassKey = this.$environment.app.socketKey;
        const secretKey = createHmac('sha256', secret)
            .update(socketPassKey)
            .digest('hex');

        // Set authorization if defined.
        request.headers = {
            Authorization: `Token ${secretKey}`,
        };

        // Set request data if defined.
        if (route.method != 'GET') request.data = { channel };

        //
        return await this.curl(request);
    }

    private getHttpPathUrl(event: string, withBody: boolean) {
        /**
         * Search equivalent http path url with known event type.
         */
        for (const route of this.$configuration.routes) {
            //
            if (
                route.event == event &&
                (withBody ||
                    (!withBody &&
                        route.method == 'GET')) /* || route.method == 'DELETE'*/
            ) {
                return route;
            }
        }

        return null;
    }

    private async curl(
        payload: AxiosRequestConfig,
        _show_data = false,
    ): Promise<ICommon> {
        let response: ICommon = {
            statusCode: 200,
            i18n: 'unknow-response',
        };

        const requests: AxiosRequestConfig = {
            ...payload,
            baseURL: `${this.$environment.app.backendUrl}`,
        };

        this.$logger.debug(`http.requests => ${JSON.stringify(requests)}`);

        await axios
            .request(requests)
            .then((r: AxiosResponse) => {
                if (r.data) {
                    if (_show_data)
                        this.$logger.info(
                            `http.data => ${JSON.stringify(r.data)}`,
                        );
                    response = r.data;
                }
            })
            .catch((e: any) => {
                this.$logger.error(`http.error => ${e.message}`);
                //
                response.statusCode =
                    e.response && e.response.status ? e.response.status : 422;
                response.reason = e.response
                    ? e.response.data
                    : e.message || 'Réponse inconnue';
            });

        return response;
    }
}
