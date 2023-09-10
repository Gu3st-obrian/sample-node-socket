import { IConnection, IoDataEvent, UserTypeEnum } from '../interface/socket';
import { SocketManager } from '../server/SocketManager';
import { Socket as SocketIO } from 'socket.io';

/**
 * Extract tokens from response and save them into user connection.
 * @param ctx Instance of SocketManager
 * @param values Http response values
 * @param socket_id ID of the socket connection
 */
export const SubscribeToLoginEvent = (
    ctx: SocketManager,
    values: any,
    socket_id: string,
) => {
    // Remove user from other room.
    ctx.removeUserFromRoomById(socket_id);

    // Update user connection with new content.
    ctx.updateConnection(socket_id, {
        // Reset user room.
        _room_channel: null,
        // Setup new user session.
        access_token: values.access_token,
        refresh_token: values.refresh_token,
        // Identify user as client or driver.
        user_type: values.user_type,
        // Not receive courses list.
        courses_sent: false,
    });
};

/**
 * Setup current user type as client or driver.
 * @param ctx Instance of SocketManager
 * @param values Http response values
 * @param socket_id ID of the socket connection
 */
export const SubscribeToUserMeEvent = (
    ctx: SocketManager,
    values: { user_type: UserTypeEnum; zone_id: string },
    socket_id: string,
) => {
    // Set user type into it connection.
    if (values && values.user_type) {
        ctx.updateConnection(socket_id, {
            user_type: values.user_type,
        });
    }
};

/**
 * Return all available course in the current user zone.
 * @param ctx Instance of SocketManager
 * @param values Http response values
 * @param socket Instance of socket.io
 */
export const SendDefaultCourseListOnFirstConnection = async (
    ctx: SocketManager,
    values: { user_type: string; zone_id: string },
    socket: SocketIO,
) => {
    ctx.$logger.debug(
        `SendDefaultCourseListOnFirstConnection.values => ${JSON.stringify(
            values,
        )}`,
    );

    if (
        values &&
        values.user_type &&
        String(values.user_type).toLowerCase().includes('driver')
    ) {
        // Get current user session.
        const connection = ctx.getConnection(socket.id);

        // Not yet ??
        if (connection && !connection.courses_sent) {
            // Courses event type.
            const eventType = 'course-alerts-in-zone';

            // Fetch available courses in the concerned zone.
            const httpResponse = await ctx.$http.getAvailableCourses(
                eventType,
                values.zone_id,
            );

            if (httpResponse.statusCode == 200) {
                // Sent response.
                socket.emit('message', {
                    type: eventType,
                    user: connection?.user_type || null,
                    data: httpResponse,
                } as IoDataEvent);

                // Mark new available courses as emitted.
                ctx.updateConnection(socket.id, { courses_sent: true });
            }
        }
    }
};

/**
 * Forward user position in the private room course.
 * @param ctx Instance of SocketManager
 * @param response Event http response
 * @param socket_id ID of the socket connection
 */
export const ForwardInfoInPrivateRoom = async (
    ctx: SocketManager,
    response: IoDataEvent,
    socket_id: string,
    use_room_in_response: boolean,
): Promise<boolean> => {
    /**
     * Warning : Keep in mind that,
     * if a user is in a private room, never override it connection room name.
     * In this case, room name will be differents from zone Id.
     * *******************************************************
     * Private room chanel is an ObjectId().
     * Publics zones chanels are UUIDv4.
     */

    const connection: IConnection = ctx.getConnection(socket_id);
    ctx.$logger.debug(
        `[IO] (ForwardInfoInPrivateRoom) => ${JSON.stringify(connection)}`,
    );

    // Emit message to specified private room.
    console.log('response.data.values.id =>', response?.data?.values?.id);
    if (
        use_room_in_response &&
        response?.data?.values?.id &&
        !response.data.values.id.includes('-')
    ) {
        // Send new position in private room chanel.
        ctx.$server.to(response.data.values.id).emit('message', {
            type: `private-${response.type}`,
            user: connection?.user_type || null,
            data: response.data,
        } as IoDataEvent);

        return true;
    } else if (!use_room_in_response) {
        //
        if (
            connection &&
            connection._room_channel &&
            !connection._room_channel.includes('-')
        ) {
            // Send new position in private room chanel.
            ctx.$server.to(connection._room_channel).emit('message', {
                type: `private-${response.type}`,
                user: connection?.user_type || null,
                data: response.data,
            } as IoDataEvent);

            return true;
        }
    }

    return false;
};

/**
 * Forward new available course in the user public room.
 * @param ctx Instance of SocketManager
 * @param response Event http response
 * @param socket_id ID of the socket connection
 */
export const ForwardCoursesInPublicRoom = async (
    ctx: SocketManager,
    values: { zone_id: string },
    socket_id: string,
): Promise<boolean> => {
    /**
     * Warning : Keep in mind that
     * ********************************************************
     * Private room chanel is an ObjectId().
     * Publics zones chanels are UUIDv4.
     */

    const connection: IConnection = ctx.getConnection(socket_id);
    ctx.$logger.debug(
        `[IO] (ForwardCoursesInPublicRoom) => ${JSON.stringify(connection)}`,
    );

    // Courses event type.
    const eventType = 'course-alerts-in-zone';

    // Fetch available courses in the concerned zone.
    const httpResponse = await ctx.$http.getAvailableCourses(
        eventType,
        values.zone_id,
    );

    /**
     * Send new position in public room chanel.
     * Even if the http status is not 200.
     */
    ctx.$server.to(values.zone_id).emit('message', {
        type: eventType,
        user: connection?.user_type || null,
        data: httpResponse,
    } as IoDataEvent);

    return httpResponse.statusCode == 200;
};
