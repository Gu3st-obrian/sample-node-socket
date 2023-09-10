export interface IConfig {
    dev?: IEnvironment;
    stage?: IEnvironment;
    prod?: IEnvironment;
}

export interface IEnvironment {
    app: {
        name: string;
        port: number;
        backendSecret: string;
        backendUrl: string;
        socketKey: string;
    };
    auth: {
        key: string;
        secret: string;
    };
    logs: {
        level: string;
    };
    redis: {
        host: string;
        port: number;
    };
}
