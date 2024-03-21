import {createServer} from 'http';
import crypto from 'crypto';

const PORT = 1337

const WEBSOCKET_MAGIC_STRING_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const SEVEN_BITS_INTEGER_MARKER = 125
const SIXTEEN_BITS_INTEGER_MARKER = 126
const SIXTYFOUR_BITS_INTEGER_MARKER = 127

const MAXIMUM_SIXTEEN_BITS_INTEGER = 2 ** 16 // 0 to 65536
const MAXIMUM_SIXTYFOUR_BITS_INTEGER = Number.MAX_SAFE_INTEGER;

const MASK_KEY_BYTES_LENGTH = 4
const OPCODE_TEXT = 0x01 // 1 bit in binary 1

// parseInt('10000000', 2)
const FIRST_BIT = 128

const server = createServer((request, response) => {
    response.writeHead(200)
    response.end('hey there')
})
    .listen(1337, () => console.log('server listening to', PORT))

server.on('upgrade', onSocketUpgrade)


async function onSocketUpgrade(req, socket, head) {
    try {
        const {
            'sec-websocket-key': webClientSocketKey
        } = req.headers;

        console.log(`${webClientSocketKey} connected!`);
        const headers = prepareHandShakeHeaders(webClientSocketKey);

        socket.write(headers);
        socket.on('readable', () => onSocketReadable(socket));
    } catch (err) {
        console.error('Error occurred during socket upgrade:', err);
    }
}

function sendMessage(msg, socket) {
    const data = prepareMessage(msg)
    socket.write(data)
}

function prepareMessage(message) {
    const msg = Buffer.from(message)
    const messageSize = msg.length

    let dataFrameBuffer;


    // 0x80 === 128 in binary
    // '0x' +  Math.abs(128).toString(16) == 0x80
    const firstByte = 0x80 | OPCODE_TEXT // single frame + text
    if(messageSize <= SEVEN_BITS_INTEGER_MARKER) {
        const bytes = [firstByte]
        dataFrameBuffer = Buffer.from(bytes.concat(messageSize))
    }
    else if (messageSize <= MAXIMUM_SIXTEEN_BITS_INTEGER ) {
        const offsetFourBytes = 4
        const target = Buffer.allocUnsafe(offsetFourBytes)
        target[0] = firstByte
        target[1] = SIXTEEN_BITS_INTEGER_MARKER | 0x0 // just to know the mask

        target.writeUint16BE(messageSize, 2) // content lenght is 2 bytes
        dataFrameBuffer = target

        // alloc 4 bytes
        // [0] - 128 + 1 - 10000001  fin + opcode
        // [1] - 126 + 0 - payload length marker + mask indicator
        // [2] 0 - content length
        // [3] 113 - content length
        // [ 4 - ..] - the message itself
    }
    else if (messageSize <= MAXIMUM_SIXTYFOUR_BITS_INTEGER) {
        const offsetEightBytes = 8;
        const target = Buffer.allocUnsafe(offsetEightBytes);
        target[0] = firstByte;
        target[1] = SIXTYFOUR_BITS_INTEGER_MARKER | 0x0; // just to know the mask

        target.writeBigUInt64BE(BigInt(messageSize), 2); // content length is 8 bytes
        dataFrameBuffer = target;
    }

    const totalLength = dataFrameBuffer.byteLength + messageSize
    return concat([dataFrameBuffer, msg], totalLength)

}

function concat(bufferList, totalLength) {
    const target = Buffer.allocUnsafe(totalLength)
    let offset = 0;
    for(const buffer of bufferList) {
        target.set(buffer, offset)
        offset += buffer.length
    }

    return target
}

function onSocketReadable(socket) {
    // consume optcode (first byte)
    // 1 - 1 byte - 8bits
    socket.read(1)

    const [markerAndPayloadLengh] = socket.read(1)
    // Because the first bit is always 1 for client-to-server messages
    // you can subtract one bit (128 or '10000000')
    // from this byte to get rid of the MASK bit
    const lengthIndicatorInBits = markerAndPayloadLengh - FIRST_BIT

    let messageLength = 0
    if (lengthIndicatorInBits <= SEVEN_BITS_INTEGER_MARKER) {
        messageLength = lengthIndicatorInBits
    }
    else if(lengthIndicatorInBits === SIXTEEN_BITS_INTEGER_MARKER) {
        // unsigned, big-endian 16-bit integer [0 - 65K] - 2 ** 16
        messageLength = socket.read(2).readUint16BE(0)
    }
    else if (lengthIndicatorInBits === SIXTYFOUR_BITS_INTEGER_MARKER) {
        // Read 64-bit unsigned integer (8 bytes)
        messageLength = socket.read(8).readBigUInt64BE(0);
    }


    const maskKey = socket.read(MASK_KEY_BYTES_LENGTH);
    if (!maskKey) {
        console.error("Socket read failed: ", maskKey);
        return;
    }
    const encoded = socket.read(messageLength)
    const decoded = unmask(encoded, maskKey)
    const received = decoded.toString('utf8')

    const data = JSON.parse(received)
    console.log('message received!', data)

    const msg = JSON.stringify({
        message: data,
        at: new Date().toISOString()
    })
    sendMessage(msg, socket)
}

function unmask(encodedBuffer, maskKey) {
    let decodedBuffer = Buffer.from(encodedBuffer);
    /*
    * Because the maskKey has only 4 bytes, so we need to mod by 4.
    * XOR ^
    *
    * (71).toString(2).padStart(8,"0") = 0 1 0 0 0 1 1 1
    * (53).toString(2).padStart(8,"0") = 0 0 1 1 0 1 0 1      ^ ( XOR )
    * ----------------------------------------------
    *                                    0 1 1 1 0 0 1 0
    *
    * String.fromCharCode(parseInt('01110010', 2))
    * (71 ^ 53).toString(2).padStart(8,"0")
    */

    const fillWithEightZeros = (t) => t.padStart(8, "0");
    const toBinary = (t) => fillWithEightZeros(t.toString(2));
    const fromBinaryToDecimal = (t) => parseInt(toBinary(t), 2);
    const getCharFromBinary = (t) => String.fromCharCode(parseInt(fromBinaryToDecimal(t)));

    for(let i = 0; i < encodedBuffer.length; i++){
        decodedBuffer[i] = encodedBuffer[i] ^ maskKey[i % 4];

        const logger = {
            unmaskingCalc : `${toBinary(encodedBuffer[i])} ^ ${toBinary(maskKey[i % 4])} = ${toBinary(decodedBuffer[i])}`,
            decoded : getCharFromBinary(decodedBuffer[i])
        }

        // console.log(logger)
    }
    return decodedBuffer;
}

function prepareHandShakeHeaders(id) {
    const acceptKey = createSocketAccept(id)
    return [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        ''
    ].map(line => line.concat('\r\n')).join('')
}

function createSocketAccept(id) {
    const sha1Hash = crypto.createHash('sha1')
    sha1Hash.update(id + WEBSOCKET_MAGIC_STRING_KEY)
    return sha1Hash.digest('base64')
}

// error handling to keep the server on
;
[
    "uncaughtException",
    "unhandledRejection"
].forEach(event =>
    process.on(event, (err) => {
        console.error(`something bad happened! event: ${event}, msg: ${err.stack || err}`)
    })
)