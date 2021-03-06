/**
 * The BitStream class used for reading data from a Buffer.
 */
class BitStream {
    /**
     * Creates a new instance of the BitStream class and sets up the default values for some variables
     * @param {Buffer} data
     */
    constructor(data = undefined) {
        if(data !== undefined) {
            this._data = data;
        }
        else {
            this._data = Buffer.alloc(0);
        }
        this._byteCount = this._data.toString().length;
        //for reading data
        this._rBytePos = 0;
        this._rBitPos = 7;
        //for writing data
        this._wBytePos = 0;
        this._wBitPos = 7;
        this._mask = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80];

        this._byte = this._byteCount ? this._data.readUInt8(0) : undefined;
    }

    /**
     * Returns the length of this BitStream
     * @returns {Number}
     */
    length() {
        return this._byteCount;
    }

    /**
     * Returns true if we are at the end of the stream
     * @returns {Boolean}
     */
    allRead() {
        return this._rBytePos * 8 + this._rBitPos >= this._byteCount * 8 - 1;
    }

    /**
     * Reads a single bit from the Buffer
     * @returns {Number}
     */
    readBit() {
        if (this._rBytePos >= this._byteCount) throw new Error("Reached end of stream!");

        let byte = this._data.readUInt8(this._rBytePos);
        let bit = (byte & this._mask[this._rBitPos]) >> this._rBitPos;
        if (--this._rBitPos === -1) {
            this._rBitPos = 7;
            this._rBytePos++;
        }
        return bit;
    }

    /**
     * Writes a single bit to the buffer
     * @param {boolean} b The bit to write
     */
    writeBit(b) {
        if(typeof(b) !== "boolean") {
            throw new Error("BitStream writeBit was not passed a boolean");
        }
        //if the wBitPos is in the first bit position, we have rolled over
        if(this._wBitPos === 7) {

            //increase the buffer size...
            let old = this._data;
            this._data = Buffer.alloc(this._wBytePos + 1);
            this._byteCount = this._wBytePos + 1;

            for(let i = 0; i < this._wBytePos; i ++) {
                this._data.writeUInt8(old.readUInt8(i), i); //copy over into new Buffer
            }

            this._data.writeUInt8(0, this._wBytePos);

        }
        //now we need to get the current byte...
        let byte = this._data.readUInt8(this._wBytePos);

        //set the bit
        byte |= b << this._wBitPos;

        //write the byte
        this._data.writeUInt8(byte, this._wBytePos);

        //move to next bit
        this._wBitPos --;

        //if we are done writing this byte, move to the next one
        if(this._wBitPos < 0) {
            this._wBitPos = 7;
            this._wBytePos ++;
        }
    }

    /**
     * Reads multiple bits from the buffer
     * @param {Number} n The number of bits to read
     * @returns {Number}
     */
    readBits(n) {
        let val = 0;
        if(this._rBytePos < this._byteCount) this._byte = this._data.readUInt8(this._rBytePos);

        while (n--) {
            let bit = this.readBit();
            val = (val << 1) | bit;
        }
        return val;
    }

    /**
     * Reads bits in reverse
     * @param {Number} n The number of bits to read
     * @returns {Number}
     */
    readBitsReversed(n) {
        let val = 0;

        // Don't know why I need this here, but I do
        for (let i = 0; i < n; i ++) {
            let bit = this.readBit();
            val |= (bit << i);
        }
        return val;
    }

    /**
     * Don't ask...
     * @param ret
     * @param n
     * @param b
     * @returns {*}
     */
    readBitsStream(ret, n, b = true) {
        if(n <= 0) return undefined;
        if(this._rBytePos + Math.floor(n/8) > this._byteCount) return undefined;

        let c = 0;
        while(n > 0) {
            if(n >= 8) {
                ret.writeByteOffset(this.readByte(), c);
                n -= 8;
                c++;
            } else {
                let neg = n - 8;
                if(neg < 0) {
                    if(b) {
                        ret.writeByteOffset(ret.readByteOffset(c) >> -neg, c);
                        this._rBytePos += 8 + neg;
                    } else {
                        this._rBytePos += 8;
                    }
                }
                n = 0;
            }
        }
        return ret;
    }

    /**
     * Reads a byte from the buffer
     * @returns {Number}
     */
    readByte() {
        return this.readBits(8);
    }

    /**
     * Read a byte at a given offset
     * @param {Number} o Offset byte
     * @returns {Number}
     */
    readByteOffset(o) {
        return this._data.readUInt8(o);
    }

    /**
     * Read number of bytes to a new stream
     * @param {Number} n Number of bytes
     * @returns {BitStream}
     */
    readBytes(n) {
        let val = new BitStream();
        while(n--) {
            val.writeByte(this.readByte());
        }
        return val;
    }

    /**
     * Writes a byte to the stream
     * @param {Number} n The byte to write to the stream
     */
    writeByte(n) {
        //we have to build an array of true and false... or we can just left shift it and do it that way
        for(let i = 0; i < 8; i++) {
            let t = (n & 0x80) >>> 7; //get the leftmost bit and put it on the right

            if(t === 1) // we have a true...
                this.writeBit(true);
            else
                this.writeBit(false);
            n <<= 1; //move to next bit...
            n &= 0xFF; //ensure we are only looking at a byte...
        }
    }

    /**
     * Writes a byte a offset
     * @param {Number} n Byte to write
     * @param {Number} o Offset to write at
     */
    writeByteOffset(n, o) {
        if(o + 1> this.length()) { //we are trying to write outside the current size... resizing to fix...
            this._data = Buffer.alloc(o + 1, 0);
            this._byteCount = this._wBytePos + 1;

            for(let i = 0; i < this._wBytePos; i ++) {
                this._data.writeUInt8(old.readUInt8(i), i); //copy over into new Buffer
            }
            this._byteCount = o + 1;
        }
        this._data.writeUInt8(n, o);
    }

    /**
     * Reads a character from the stream
     * @returns {Number}
     */
    readChar() {
        return this.readBits(8);
    }

    /**
     * Writes a character to the stream
     * @param {Number} n Character to write
     */
    writeChar(n) {
        this.writeByte(n);
    }

    /**
     * Reads a signed character from the stream
     * @returns {Number}
     */
    readSignedChar() {
        if(this.readBit()) {
            return -this.readBits(7)
        }
        return this.readBits(7);
    }

    /**
     * Reads an unsigned short from the stream
     * @returns {Number}
     */
    readShort() {
        return this.readByte() +
            (this.readByte() << 8);
    }

    /**
     * Writes an unsigned short to the stream
     * @param {Number} n The number to write
     */
    writeShort(n) {
        this.writeByte(n & 0xff); //write the bottom byte
        this.writeByte((n & 0xff00) >>> 8); //write the top byte
    }

    /**
     * Reads a signed short from the stream
     * @returns {Number}
     */
    readSignedShort() {
        let firstByte = this.readByte();
        if(this.readBit()) {
            return -(firstByte & (this.readBits(7) << 7));
        }
        return firstByte & (this.readBits(7) << 7);
    }

    /**
     * Reads an unsigned long from the stream
     * @returns {Number}
     */
    readLong() {
        return this.readByte() +
            (this.readByte() << 8) +
            (this.readByte() << 16) +
            (this.readByte() * 16777216); // Had to do this because shifting it over 24 places causes it to return a signed value because JavsScript treats numbers in bitshift as 32bit
    }

    /**
     * Writes an unsigned long to the stream
     * @param {Number} n The number to write
     */
    writeLong(n) {
        this.writeShort(n & 0xffff); //write the lower two bytes...
        this.writeShort((n & 0xffff0000) >>> 16); //write the top two bytes
    }

    /**
     * Currently not implemented
     */
    readSignedLong() {
        //lol no
    }

    /**
     * Reads an unsigned long long from the stream
     * @returns {Number}
     */
    readLongLong() {
        return this.readByte() +
            (this.readByte() << 8) +
            (this.readByte() << 16) +
            (this.readByte() * 16777216) +
            (this.readByte() * 4294967296) +
            (this.readByte() * 1099511627776) +
            (this.readByte() * 281474976710656) +
            (this.readByte() * 72057594037927936);
    }

    /**
     * Writes an unsigned long long to the stream
     * @param {Number} n The number to write
     */
    writeLongLong(n) {
        this.writeLong(n & 0xffffffff);
        this.writeLong((n & 0xffffffff00000000) >>> 32);
    }

    /**
     * Reads compressed data from the stream
     * @param {Number} size The size of the data to read
     * @returns {BitStream}
     */
    readCompressed(size) {
        let currentByte = size - 1;

        while(currentByte > 0) {
            let b = this.readBit();
            if(b === undefined) return undefined;

            if(b) {
                currentByte --;
            } else {
                let ret = new BitStream();
                for(let i = 0; i < size - currentByte - 1; i++) {
                    ret.writeByte(0);
                }
                for(let i = 0; i < currentByte + 1; i ++) {
                    ret.writeByte(this.readByte());
                }
                return ret;
            }
        }

        let b = this.readBit();
        if(b === undefined) return undefined;

        let ret = new BitStream();
        if(b) {
            ret.writeByte(this.readBits(4) << 4 && 0xF0);
        } else {
            ret.writeByte(this.readByte());
        }
        for(let i = 0; i < size - 1; i++) {
            ret.writeByte(0);
        }
        return ret;
    }

    /**
     * Aligns the current reading bit to a byte
     */
    alignRead() {
        if(this._rBitPos !== 7) {
            this._rBitPos = 7;
            this._rBytePos ++;
        }
    }

    /**
     * Adds a BitStream to the end of this BitStream
     * @param {BitStream} bs The BitStream to add on
     */
    concat(bs) {
        for(let i = 0; i < bs.length; i ++) {
            for(let j = 0; j < bs[i].length(); j ++) {
                this.writeByte(bs[i].readByte());
            }
        }
    }

    /**
     * Gets the binary string representation of this BitStream
     * @returns {String}
     */
    toBinaryString() {
        let output = "";
        let temp = [
            '0000',
            '0001',
            '0010',
            '0011',
            '0100',
            '0101',
            '0110',
            '0111',
            '1000',
            '1001',
            '1010',
            '1011',
            '1100',
            '1101',
            '1110',
            '1111'
        ];

        for(let i = 0; i < this._byteCount; i ++) {
            let byte = this._data.readUInt8(i);
            let partone = (byte & 0xF0) >> 4;
            let parttwo = byte & 0x0F;

            if(i === this._rBytePos) {
                for(let j = 7; j >= 0; j--) {
                    let bit = (byte & this._mask[j]) >> j;
                    if(j === this._rBitPos) {
                        output += " -> "
                    }
                    output += bit;
                }
                output += ' ';
            } else {
                output += temp[partone] + temp[parttwo] + ' ';
            }


        }
        return output;
    }
}

/**
 * Turns Unicode into a number
 * @param {String} string
 * @returns {Number}
 */
function ord (string) {
    //  discuss at: http://locutus.io/php/ord/
    // original by: Kevin van Zonneveld (http://kvz.io)
    // bugfixed by: Onno Marsman (https://twitter.com/onnomarsman)
    // improved by: Brett Zamir (http://brett-zamir.me)
    //    input by: incidence
    //   example 1: ord('K')
    //   returns 1: 75
    //   example 2: ord('\uD800\uDC00'); // surrogate pair to create a single Unicode character
    //   returns 2: 65536
    var str = string + ''
    var code = str.charCodeAt(0)
    if (code >= 0xD800 && code <= 0xDBFF) {
        // High surrogate (could change last hex to 0xDB7F to treat
        // high private surrogates as single characters)
        var hi = code
        if (str.length === 1) {
            // This is just a high surrogate with no following low surrogate,
            // so we return its value;
            return code
            // we could also throw an error as it is not a complete character,
            // but someone may want to know
        }
        var low = str.charCodeAt(1)
        return ((hi - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000
    }
    if (code >= 0xDC00 && code <= 0xDFFF) {
        // Low surrogate
        // This is just a low surrogate with no preceding high surrogate,
        // so we return its value;
        return code
        // we could also throw an error as it is not a complete character,
        // but someone may want to know
    }
    return code
}

module.exports = BitStream;