const RangeList = require('./RangeList.js');
const BitStream = require('./BitStream.js');
const assert = require('assert');

/**
 * An enum for determining what type of reliability a packet was sent with.
 * @type {{UNRELIABLE: number, UNRELIABLE_SEQUENCED: number, RELIABLE: number, RELIABLE_ORDERED: number, RELIABLE_SEQUENCED: number}}
 */
const Reliability = {
    'UNRELIABLE': 0,
    'UNRELIABLE_SEQUENCED': 1,
    'RELIABLE': 2,
    'RELIABLE_ORDERED': 3,
    'RELIABLE_SEQUENCED': 4,
};

/**
 * The ReliabilityLayer class used for sending and receiving data to a single client.
 */
class ReliabilityLayer {
    /**
     * Constructs a new instance of ReliabilityLayer and set default values for the object
     * @param server
     * @param address
     */
    constructor(server, address) {
        this._server = server;
        this._address = address;

        this.srrt = undefined;
        this.rttVar = undefined;
        this.rto = 1;
        this.last = Date.now();
        this.remoteSystemTime = 0;
        this.resends = []; //i assume to keep track of what messages needed to be resent?
        this.acks = [];
        this.queue = [];
        this.sequencedReadIndex = 0;
        this.orderedReadIndex = 0;
        this.outOfOrderPackets = [];
    }

    /**
     * Handles a new packet when we receive one
     * @param {BitStream} data The packet
     */
    *handle_data(data) {
        if(this.handle_data_header(data)) yield undefined;
        yield* this.parse_packets(data);
    }

    /**
     * Handles the acks packets and other header parts of the packet
     * @param {BitStream} data The packet
     * @returns {Boolean}
     */
    handle_data_header(data) {
        if(data.readBit()) { //if there are acks...
            let yeOldenTime = data.readLong();
            let rtt = (Date.now() - this.last) / 1000 - yeOldenTime/1000;
            this.last = Date.now();
            if(this.srrt === undefined) {
                this.srrt = rtt;
                this.rttVar = rtt/2;
            } else {
                let alpha = 0.125;
                let beta = 0.25;
                this.rttVar = (1 - beta) * this.rttVar + beta * Math.abs(this.srrt - rtt);
                this.srrt = (1 - alpha) * this.srrt + alpha * rtt;1
            }
            this.rto = Math.max(1, this.srrt + 4 * this.rttVar);

            let acks = new RangeList(data);
            for(let i = 0; i < acks.toArray().length; i ++) {

            }

            //skipping a bunch of stuffs...
        }
        if(data.allRead()) {
            return true;
        }
        if(data.readBit()) {
            this.remoteSystemTime = data.readLong();
        }
        return false;
    }

    /**
     * Parses the rest of the packet out so we can handle it later
     * @param {BitStream} data The packet
     */
    *parse_packets(data) {
        while(!data.allRead()) {

            let messageNumber = data.readLong();
            console.log("Message Number: " + messageNumber);
            let reliability = data.readBits(3);
            console.log("Reliability: " + reliability);
            let orderingChannel;
            let orderingIndex;

            if(reliability === Reliability.UNRELIABLE_SEQUENCED || reliability === Reliability.RELIABLE_ORDERED) {
                orderingChannel = data.readBits(5);
                console.log("Ordering Channel: " + orderingChannel);
                assert(orderingChannel === 0, "Ordering channel not 0! Error in reading packet!");
                orderingIndex = data.readLong();
                console.log("Ordering index: " + orderingIndex);
            }
            let isSplit = data.readBit();
            let splitPacketId;
            let splitPacketIndex;
            let splitPacketCount;
            if(isSplit) { //if the packet is split
                splitPacketId = data.readShort();
                splitPacketIndex = data.readCompressed(32);
                splitPacketCount = data.readCompressed(32);

                if(this.queue[splitPacketId] === undefined) {
                    this.queue[splitPacketId] = [splitPacketCount];
                }
            }
            let length = data.readCompressed(16).readShort();
            console.log("Packet is " + length + " bits long");
            data.alignRead();
            let packet = data.readBytes(Math.ceil(length/8));

            if(reliability === Reliability.RELIABLE || reliability === Reliability.RELIABLE_ORDERED) {
                this.acks.push(messageNumber);
            }

            if(isSplit) {
                if(splitPacketId !== undefined && splitPacketIndex !== undefined) {
                    this.queue[splitPacketId][splitPacketIndex] = packet;
                    let ready = true;
                    for(let i = 0; i < this.queue[splitPacketId].length; i ++) {
                        if(this.queue[splitPacketId][i] === undefined) {
                            ready = false;
                            break;
                        }
                    }
                    if(ready) {
                        //concatenate all the split packets together
                        packet = new BitStream();
                        packet.concat(this.queue[splitPacketId]);
                    } else {
                        continue;
                    }
                }
            }
            if(reliability === Reliability.UNRELIABLE_SEQUENCED) {
                if(orderingIndex !== undefined) {
                    if(orderingIndex >= this.sequencedReadIndex) {
                        this.sequencedReadIndex = orderingIndex + 1;
                    }
                    else {
                        continue;
                    }
                }
            } else if(reliability === Reliability.RELIABLE_ORDERED) {
                if(orderingIndex !== undefined && orderingChannel !== undefined) {

                    if(orderingIndex === this.orderedReadIndex) {
                        console.log("we got one");
                        this.orderedReadIndex ++;
                        let ord = orderingIndex + 1;
                        console.log("Releasing ordered packet at " + ord);
                        for(let i = ord; i < this.orderedReadIndex; i ++) {

                        }
                    } else if (orderingIndex < this.orderedReadIndex) {
                        console.warn('Packet was duplicate!');
                        continue;
                    } else {
                        // We can't release this packet because we are waiting for an earlier one?
                        this.outOfOrderPackets[orderingIndex] = packet;
                        console.info('Found packet at ' + orderingIndex);
                    }
                }
            }
            yield packet;
        }
    }
}

module.exports = ReliabilityLayer;