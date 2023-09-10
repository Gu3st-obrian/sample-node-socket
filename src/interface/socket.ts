import WebSocket from 'ws';
import { ICommon } from './http';

export interface IModemServerClient {
    appName: string;
    connectionId: string;
}

export interface IWsDataEvent {
    type: string;
    data: any;
}

export interface IoDataEvent {
    type: string;
    user: UserTypeEnum;
    data: ICommon;
}

export interface IUserSession {
    websocket?: WebSocket;
    connected?: boolean;
    access_token?: string;
    refresh_token?: string;
}

export interface IConnection {
    _socket_id?: string;
    _connected?: boolean;
    _application?: string;
    _room_channel?: string;
    //
    access_token?: string;
    refresh_token?: string;
    courses_sent?: boolean;
    user_type?: UserTypeEnum;
}

export interface ITokens {
    access_token?: string;
    refresh_token?: string;
}

export enum UserTypeEnum {
    CLIENT = 'UserClient',
    DRIVER = 'UserDriver',
}
