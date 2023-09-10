export interface ICommon {
    statusCode: number;
    i18n: string;
    reason?: string;
    values?: any;
}

export interface IAppRoutes {
    event: string;
    path: string;
    method: string;
    regexp: string;
}

export interface IAppConfiguration {
    name: string;
    tag: string;
    routes: Array<IAppRoutes>;
}
