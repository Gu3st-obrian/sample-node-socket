import { Server, createServer } from 'http';
import { CacheManager } from './CacheManager';
import { Server as ServerIO, Socket as SocketIO } from 'socket.io';
import { Logger } from 'pino';
import { IEnvironment } from '../interface/config';
import { HttpManager } from './HttpManager';
import { ICommon } from '../interface/http';
import {
    IConnection,
    ITokens,
    IoDataEvent,
    UserTypeEnum,
} from '../interface/socket';
import {
    ForwardInfoInPrivateRoom,
    ForwardCoursesInPublicRoom,
    SendDefaultCourseListOnFirstConnection,
    SubscribeToLoginEvent,
    SubscribeToUserMeEvent,
} from '../tools/function';

export class SocketManager {
    private pingpong: number = 30000; // Milliseconds.

    public $redis: CacheManager;
    public $http: HttpManager;
    public $server: ServerIO;

    private _idleMode: boolean = false;

    private _httpServer: Server;

    public readonly $logger: Logger;
    public readonly $env: IEnvironment;

    private connections: Map<string, IConnection> = new Map();
    private rooms: Map<string, Array<string>> = new Map();

    constructor($logger: Logger, $env: IEnvironment) {
        // Setup logger and environment vars.
        this.$env = $env;
        this.$logger = $logger;

        // Init Http Manager.
        this.$http = new HttpManager($logger, $env);

        // List of API events.
        this.$http.loadConfiguration();

        // Create simple http server to authenticate and transform connection into socket.
        this._httpServer = createServer((request: any, response: any) => {
            this.$logger.error(`[WSS] Received request for ${request.url}`);

            // Reject all http request methods.
            response.writeHead(404);
            response.end();
        });

        // Create Socket.io server instance.
        this.$server = new ServerIO(this._httpServer);

        // Authenticate connection before allowing access.
        this.$server.use(this.authenticator.bind(this));

        // Setup IO events.
        this.bindIoServerEvent();

        // Port to listen on new connection.
        this._httpServer.listen(this.$env.app.port, () => {
            this.$logger.info(
                `[WSS] Listening connection on port ${this.$env.app.port}`,
            );
        });
    }

    public closeServer() {
        this.$logger.debug('[IO] (SHUTDOWN) : Close server');
        this._httpServer.close();
    }

    public blockNewRequest() {
        this._idleMode = true;
        this.$logger.debug('[IO] (IDLE) : Block new request during shutdown');
    }

    private authenticator(socket: SocketIO, next: Function) {
        // Extract headers credentials.
        const appName = <any>socket.request.headers['x-mobile-app'];
        const receivedKey = <string>socket.request.headers['x-mobile-key'];
        const receivedSecret = <string>(
            socket.request.headers['x-mobile-secret']
        );

        // Get credentials from env.
        const authKey = this.$env.auth.key;
        const authSecret = this.$env.auth.secret;

        // Verify credentials.
        if (authKey != receivedKey || authSecret != receivedSecret) {
            // Bad credentials provided.
            this.$logger.error(`[WSS] Connection from ${socket.id} rejected`);

            // Reject connection.
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');

            // Unauthorized connection.
            next(new Error('UNAUTHORIZED_CONNECTION'));
        }

        // Setup access to the new connection.
        this.updateConnection(socket.id, {
            _socket_id: socket.id,
            _connected: true,
            _application: appName,
            courses_sent: false,
        } as IConnection);

        next();
    }

    private bindIoServerEvent(): void {
        //
        this.$server.on('connection', (socket: SocketIO) => {
            // Process to access a room.
            socket.on('join-room', (roomName: string) => {
                // Check resource availability.
                if (this._idleMode) {
                    socket.emit('message', {
                        type: 'join-room',
                        user: null,
                        data: {
                            statusCode: 503,
                            i18n: 'service.unavailable',
                            reason: 'SERVICE_UNAVAILABLE',
                        },
                    } as IoDataEvent);
                    return false;
                }

                const connection: IConnection = this.getConnection(socket.id);

                /**
                 * User must identified himself type before joining a room.
                 */
                if (
                    !Object.values(UserTypeEnum).includes(connection?.user_type)
                ) {
                    socket.emit('message', {
                        type: 'join-room',
                        user: null,
                        data: {
                            statusCode: 422,
                            i18n: 'error.user.unknow-type',
                            reason: 'UNKNOW_USER_TYPE',
                        },
                    } as IoDataEvent);
                    return false;
                }

                /**
                 * Client are not allowed to join public.
                 * Public room include '-' in their name.
                 * Private not.
                 */
                if (
                    connection.user_type == UserTypeEnum.CLIENT &&
                    roomName.includes('-')
                ) {
                    socket.emit('message', {
                        type: 'join-room',
                        user: connection.user_type || null,
                        data: {
                            statusCode: 403,
                            i18n: 'error.user.not-allowed',
                            reason: 'PUBLIC_ROOM_FORBIDDEN_TO_CLIENT',
                        },
                    } as IoDataEvent);
                    return false;
                }

                // Add user into the zone chanel.
                socket.join(roomName);

                // Remove user from other room.
                this.removeUserFromRoomById(socket.id);

                // Preserve trace of the room in the user model.
                this.updateConnection(socket.id, { _room_channel: roomName });

                // Add new user into the rooms space.
                this.addUserToRoom(roomName, socket.id);

                //
                socket.emit('message', {
                    type: 'join-room',
                    user: connection.user_type || null,
                    data: {
                        statusCode: 200,
                        i18n: 'room.joined',
                        reason: 'OK',
                        values: { zone_id: roomName },
                    },
                } as IoDataEvent);

                // Send available courses of the new zone.
                SendDefaultCourseListOnFirstConnection(
                    this,
                    {
                        user_type: connection.user_type,
                        zone_id: roomName,
                    },
                    socket,
                );

                return true;
            });

            // Process to leave a room.
            socket.on('leave-room', () => {
                // Check resource availability.
                if (this._idleMode) {
                    socket.emit('message', {
                        type: 'leave-room',
                        user: null,
                        data: {
                            statusCode: 503,
                            i18n: 'service.unavailable',
                            reason: 'SERVICE_UNAVAILABLE',
                        },
                    } as IoDataEvent);
                    //
                    return false;
                }

                // Remove user from other room.
                const foundedRoom = this.removeUserFromRoomById(socket.id);

                // Remove user from the zone chanel.
                if (foundedRoom) socket.leave(foundedRoom);

                const connection: IConnection = this.getConnection(socket.id);

                //
                socket.emit('message', {
                    type: 'leave-room',
                    user: connection?.user_type || null,
                    data: {
                        statusCode: 200,
                        i18n: 'room.left',
                        reason: 'OK',
                        values: { zone_id: foundedRoom },
                    },
                } as IoDataEvent);

                return true;
            });

            /**
             * Allow user to change the tokens.
             * Functionality required but it's a real security issue.
             */
            socket.on('change-token', (tokens: ITokens) => {
                // Check resource availability.
                if (this._idleMode) {
                    socket.emit('message', {
                        type: 'change-token',
                        user: null,
                        data: {
                            statusCode: 503,
                            i18n: 'service.unavailable',
                            reason: 'SERVICE_UNAVAILABLE',
                        },
                    } as IoDataEvent);
                    //
                    return false;
                }

                // Get current user session.
                const connection: IConnection = this.getConnection(socket.id);

                // No content.
                if (Object.keys(tokens).length != 2) {
                    socket.emit('message', {
                        type: 'change-token',
                        user: connection?.user_type || null,
                        data: {
                            statusCode: 400,
                            i18n: 'error.tokens.missing',
                            reason: 'MISSING_TOKENS',
                        },
                    } as IoDataEvent);
                    //
                    return false;
                }

                // Remove current user from other room.
                this.removeUserFromRoomById(socket.id);

                // Update user connection with new content.
                this.updateConnection(socket.id, {
                    // Reset user room.
                    _room_channel: null,
                    // Setup new user session.
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    // Reset user type due to token injection.
                    user_type: null,
                    // Not receive courses list.
                    courses_sent: false,
                });

                //
                socket.emit('message', {
                    type: 'change-token',
                    user: connection?.user_type || null,
                    data: {
                        statusCode: 200,
                        i18n: 'tokens.added',
                        reason: 'OK',
                        values: { user_type: null },
                    },
                } as IoDataEvent);
                //
                return true;
            });

            // Gestion de la déconnexion.
            socket.on('disconnect', () => {
                // Get current user session.
                const connection: IConnection = this.getConnection(socket.id);

                try {
                    // Remove user from room.
                    this.removeUserFromRoomById(socket.id);

                    // Remove user from connection instance.
                    this.removeConnection(socket.id);
                } catch (error) {
                    this.$logger.error(
                        `[IO] (${
                            connection._application
                        }) : Received an invalid message from ModemServer => ${
                            error.message || error
                        }`,
                    );
                }
            });

            // Process any other request from mobile apps.
            socket.on('message', async (event: IoDataEvent) => {
                // Check resource availability.
                if (this._idleMode) {
                    socket.emit('message', {
                        type: event.type,
                        user: null,
                        data: {
                            statusCode: 503,
                            i18n: 'service.unavailable',
                            reason: 'SERVICE_UNAVAILABLE',
                        },
                    } as IoDataEvent);
                    return false;
                }

                // Get current user session.
                let connection: IConnection = this.getConnection(socket.id);

                this.$logger.info(
                    `[IO] (${
                        connection?._application
                    }) : New message received => ${JSON.stringify(event)}`,
                );

                try {
                    // Make http response call.
                    const httpResponse: ICommon = await this.$http.getResponse(
                        event,
                        connection?.access_token,
                    );

                    // Build IO Response.
                    let ioResponse: IoDataEvent = {
                        type: event.type,
                        user: null,
                        data: httpResponse,
                    };

                    // Pass request to listener for additional processing.
                    if (httpResponse.statusCode == 200) {
                        await this.subscribeHttpListener(socket, ioResponse);
                    }

                    // Get current user type from session updated.
                    connection = this.getConnection(socket.id);
                    (ioResponse.user = connection?.user_type || null),
                        // Send response to relevant third party.
                        socket.emit('message', ioResponse);
                    return true;
                } catch (error: any) {
                    this.$logger.error(
                        `[IO] (${
                            connection?._application
                        }) : Received an invalid message from ModemServer => ${
                            error.message || error
                        }`,
                    );
                }
            });
        });
    }

    public getConnection(socket_id: string): IConnection {
        return this.connections.get(socket_id);
    }

    public removeConnection(socket_id: string): boolean {
        return this.connections.delete(socket_id);
    }

    public updateConnection(socket_id: string, data: IConnection) {
        /**
         * Never directly use new Map().set function to update user session.
         * Or you'll face multiples errors related to app architecture.
         */

        // Get current user session.
        const connection: IConnection = this.getConnection(socket_id);

        // Update or insert user session.
        this.connections.set(
            socket_id,
            connection ? { ...connection, ...data } : data,
        );
    }

    private addUserToRoom(roomName: string, socket_id: string) {
        // Get current user session.
        const roomUser: Array<string> = this.rooms.get(roomName);

        // Update or insert user session.
        this.rooms.set(
            roomName,
            roomUser ? [...roomUser, socket_id] : [socket_id],
        );
    }

    private removeUserFromRoom(roomName: string, socket_id: string) {
        // Get current user session.
        const roomUsers: Array<string> = this.rooms.get(roomName);

        if (roomUsers && roomUsers.length > 0) {
            //
            const foundIndex = roomUsers.indexOf(socket_id);
            if (foundIndex !== -1) {
                // Remove user from room.
                roomUsers.splice(foundIndex, 1);

                // Update rooms instance.
                this.rooms.set(roomName, roomUsers);
            }
        }
    }

    public removeUserFromRoomById(socket_id: string) {
        let foundedRoom = null;
        // Remove user from room.
        this.rooms.forEach((users: [string], roomName: string) => {
            if (users.includes(socket_id)) {
                // Remove user from all room.
                this.removeUserFromRoom(roomName, socket_id);
                this.updateConnection(socket_id, { _room_channel: null });
                foundedRoom = roomName;
            }
        });
        return foundedRoom;
    }

    private async subscribeHttpListener(
        socket: SocketIO,
        response: IoDataEvent,
    ): Promise<IoDataEvent> {
        this.$logger.debug(
            `[Http] (subscribeHttpListener) => ${JSON.stringify(response)}`,
        );

        // Setup listener on http event type.
        switch (response.type) {
            case 'client-login':
            case 'driver-login':
                // Add token into user connection.
                SubscribeToLoginEvent(this, response.data.values, socket.id);
                break;

            case 'client-me':
            case 'driver-me':
                // Identify user type.
                SubscribeToUserMeEvent(this, response.data.values, socket.id);
                break;

            case 'coordinate-save':
                /**
                 * Send new position to other user in the private room.
                 */
                ForwardInfoInPrivateRoom(this, response, socket.id, false);
                break;

            case 'course-computed-driver-accept':
                /**
                 * When driver accept the course,
                 * The client must be notified in the private room.
                 */
                ForwardInfoInPrivateRoom(this, response, socket.id, true);
                // Sent new available courses in the user zone.
                ForwardCoursesInPublicRoom(
                    this,
                    response.data.values,
                    socket.id,
                );
                break;

            case 'course-client-cancel':
            case 'course-driver-cancel':
            case 'course-driver-start':
            case 'course-driver-close':
                /**
                 * for each of these events, each party must be notified.
                 */
                ForwardInfoInPrivateRoom(this, response, socket.id, true);
                break;

            case 'course-computed-save':
            case 'course-computed-client-accept-price':
            case 'course-client-cancel':
            case 'course-normal-save':
            case 'course-normal-client-propose-price':
            case 'course-normal-driver-propose-price':
            case 'course-normal-client-accept-contract':
                // Sent new available courses in the user zone.
                ForwardCoursesInPublicRoom(
                    this,
                    response.data.values,
                    socket.id,
                );
                break;
        }

        return response;
    }
}
