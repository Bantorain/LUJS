/**
 *
 * @type {{ID_INTERNAL_PING: number, ID_PING: number, ID_PING_OPEN_CONNECTIONS: number, ID_CONNECTED_PONG: number, ID_CONNECTION_REQUEST: number, ID_SECURED_CONNECTION_RESPONSE: number, ID_SECURED_CONNECTION_CONFIRMATION: number, ID_RPC_MAPPING: number, ID_DETECT_LOST_CONNECTIONS: number, ID_OPEN_CONNECTION_REQUEST: number, ID_OPEN_CONNECTION_REPLY: number, ID_RPC: number, ID_RPC_REPLY: number, ID_OUT_OF_BAND_INTERNAL: number, ID_CONNECTION_REQUEST_ACCEPTED: number, ID_CONNECTION_ATTEMPT_FAILED: number, ID_ALREADY_CONNECTED: number, ID_NEW_INCOMING_CONNECTION: number, ID_NO_FREE_INCOMING_CONNECTIONS: number, ID_DISCONNECTION_NOTIFICATION: number, ID_CONNECTION_LOST: number, ID_RSA_PUBLIC_KEY_MISMATCH: number, ID_CONNECTION_BANNED: number, ID_INVALID_PASSWORD: number, ID_MODIFIED_PACKET: number, ID_TIMESTAMP: number, ID_PONG: number, ID_ADVERTISE_SYSTEM: number, ID_REMOTE_DISCONNECTION_NOTIFICATION: number, ID_REMOTE_CONNECTION_LOST: number, ID_REMOTE_NEW_INCOMING_CONNECTION: number, ID_DOWNLOAD_PROGRESS: number, ID_FILE_LIST_TRANSFER_HEADER: number, ID_FILE_LIST_TRANSFER_FILE: number, ID_DDT_DOWNLOAD_REQUEST: number, ID_TRANSPORT_STRING: number, ID_REPLICA_MANAGER_CONSTRUCTION: number, ID_REPLICA_MANAGER_DESTRUCTION: number, ID_REPLICA_MANAGER_SCOPE_CHANGE: number, ID_REPLICA_MANAGER_SERIALIZE: number, ID_REPLICA_MANAGER_DOWNLOAD_STARTED: number, ID_REPLICA_MANAGER_DOWNLOAD_COMPLETE: number, ID_CONNECTION_GRAPH_REQUEST: number, ID_CONNECTION_GRAPH_REPLY: number, ID_CONNECTION_GRAPH_UPDATE: number, ID_CONNECTION_GRAPH_NEW_CONNECTION: number, ID_CONNECTION_GRAPH_CONNECTION_LOST: number, ID_CONNECTION_GRAPH_DISCONNECTION_NOTIFICATION: number, ID_ROUTE_AND_MULTICAST: number, ID_RAKVOICE_OPEN_CHANNEL_REQUEST: number, ID_RAKVOICE_OPEN_CHANNEL_REPLY: number, ID_RAKVOICE_CLOSE_CHANNEL: number, ID_RAKVOICE_DATA: number, ID_AUTOPATCHER_GET_CHANGELIST_SINCE_DATE: number, ID_AUTOPATCHER_CREATION_LIST: number, ID_AUTOPATCHER_DELETION_LIST: number, ID_AUTOPATCHER_GET_PATCH: number, ID_AUTOPATCHER_PATCH_LIST: number, ID_AUTOPATCHER_REPOSITORY_FATAL_ERROR: number, ID_AUTOPATCHER_FINISHED_INTERNAL: number, ID_AUTOPATCHER_FINISHED: number, ID_AUTOPATCHER_RESTART_APPLICATION: number, ID_NAT_PUNCHTHROUGH_REQUEST: number, ID_NAT_TARGET_NOT_CONNECTED: number, ID_NAT_TARGET_CONNECTION_LOST: number, ID_NAT_CONNECT_AT_TIME: number, ID_NAT_SEND_OFFLINE_MESSAGE_AT_TIME: number, ID_NAT_IN_PROGRESS: number, ID_DATABASE_QUERY_REQUEST: number, ID_DATABASE_UPDATE_ROW: number, ID_DATABASE_REMOVE_ROW: number, ID_DATABASE_QUERY_REPLY: number, ID_DATABASE_UNKNOWN_TABLE: number, ID_DATABASE_INCORRECT_PASSWORD: number, ID_READY_EVENT_SET: number, ID_READY_EVENT_UNSET: number, ID_READY_EVENT_ALL_SET: number, ID_READY_EVENT_QUERY: number, ID_LOBBY_GENERAL: number, ID_AUTO_RPC_CALL: number, ID_AUTO_RPC_REMOTE_INDEX: number, ID_AUTO_RPC_UNKNOWN_REMOTE_INDEX: number, ID_RPC_REMOTE_ERROR: number, ID_USER_PACKET_ENUM: number}}
 */
const RakMessages = require('./RakMessages.js');
const BitStream = require('./BitStream.js');
const {ReliabilityLayer, Reliability} = require('./ReliabilityLayer.js');
const data = require('dgram');
const MessageHandler = require('./MessageHandler.js');


class RakServer {
    /**
     *
     * @param {Number} port
     * @param {String} password
     */
    constructor(port, password) {
        /**
         *
         * @type {Array<ReliabilityLayer>}
         * @private
         */
        this._connections = [];

        /**
         *
         * @type {string}
         * @private
         */
        this._password = password;

        /**
         * {Socket}
         */
        this._server = data.createSocket('udp4');

        /**
         *
         * @type {Array<MessageHandler>}
         * @private
         */
        this._handles = [];

        var normalizedPath = require("path").join(__dirname, "./MessageHandles");
        var handles = [];

        require("fs").readdirSync(normalizedPath).forEach(function(file) {
            handles.push(require("./MessageHandles/" + file));
        });
        this._handles = handles;

        this._server.on('error', (err) => {
            this.onError(err);
        });

        this._server.on('message', (msg, senderInfo) => {
            let data = new BitStream(msg);
            try {
                this.onMessage(data, senderInfo)
            }
            catch(e) {
                console.warn("Something went wrong while handling packet! " + e.message);
            }
        });

        this._server.on('listening', () => {
            this.onListening();
        });

        this._server.bind(port);
    }

    onMessage(data, senderInfo) {
        if(data.length() === 2) { //meaning there isnt an open connection yet...

            let messageId = data.readByte();
            //console.log(RakMessages[messageId] + ': 0x' + messageId.toString(16) + ' (' + messageId + ')');

            if(messageId === RakMessages.ID_OPEN_CONNECTION_REQUEST) {
                this._connections[senderInfo.address] = (new ReliabilityLayer());
                let ret = Buffer.alloc(1);
                ret.writeInt8(RakMessages.ID_OPEN_CONNECTION_REPLY, 0);
                this._server.send(ret, senderInfo.port, senderInfo.address);
            }

        } else {
            if(this._connections[senderInfo.address] !== undefined) { //we have an existing connection
                const packets = this._connections[senderInfo.address].handle_data(data);
                let finished = false;

                while(!finished) {
                    let next = packets.next();
                    if(next.value !== undefined) {
                        let packet = next.value;
                        this.onPacket(packet, senderInfo);
                    }

                    if(next.done) {
                        finished = true;
                    }
                }
            } else {
                console.warn("Got message from unconnected user!");
            }
        }
    }

    onPacket(packet, senderInfo) {

        let type = packet.readByte();
        let handled = false;

        for(let i = 0; i < this._handles.length; i++) {
            /**
             *
             * @type {MessageHandler}
             */
            let handle = this._handles[i].create();
            if(handle.type === type) {
                handle.handle(this._server, packet, senderInfo);
                handled = true;
            }
        }

        if(!handled) {
            console.log("Unhandled packet. ID: " + RakMessages.key(type));
        }
        // I want to move this to a nice event structure later... just testing now...
        /*switch(packet.readByte()) {
            case RakMessages.ID_CONNECTION_REQUEST:
                let password = "";
                while(!packet.allRead()) {
                    password += String.fromCharCode(packet.readByte());
                }
                if(password === this._password) {
                    let response = new BitStream();
                    response.writeByte(RakMessages.ID_CONNECTION_REQUEST_ACCEPTED);
                    response.writeLong(this.inet_aton(senderInfo.address));
                    response.writeShort(senderInfo.port);
                    response.writeShort(0);
                    response.writeLong(this.inet_aton(this._server.address().address));
                    response.writeShort(this._server.address().port);
                }
                break;
        }*/
    }

    onError(error) {
        console.log(`server error:\n${error.stack}`);
        this._server.close();
    }

    onListening() {
        const address = this._server.address();
        console.log(`server listening ${address.address}:${address.port}`);
    }
}

module.exports = RakServer;