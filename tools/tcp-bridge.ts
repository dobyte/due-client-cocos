import net from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';

/**
 * TCP ↔ WebSocket 桥接器
 *
 * due 网关使用 TCP 时，Cocos 客户端（仅支持 WebSocket）可通过该桥接器连接。
 * 桥接器只做字节转发：一个 WS 消息对应一个 due 帧（size + payload）。
 *
 * 环境变量：
 * - TARGET：TCP 网关地址，默认 127.0.0.1:3553
 * - PORT：WS 监听端口，默认 3554
 * - BYTE_ORDER：size 字段字节序，big（默认）| little
 */

const TARGET = process.env.TARGET || '127.0.0.1:3553';
const PORT = Number(process.env.PORT || 3554);
const LITTLE_ENDIAN = (process.env.BYTE_ORDER || 'big') === 'little';

const [host, port] = TARGET.split(':');
const targetPort = Number(port || 3553);

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws: WebSocket) => {
    const tcp = net.connect(targetPort, host);
    let pending = Buffer.alloc(0);

    console.log(`[bridge] WS 连接建立，转发至 ${TARGET}`);

    ws.on('message', (data) => {
        if (!tcp.writable) {
            return;
        }

        const raw = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        tcp.write(raw);
    });

    tcp.on('data', (chunk) => {
        pending = Buffer.concat([pending, chunk]);

        while (pending.length >= 4) {
            const size = LITTLE_ENDIAN ? pending.readUInt32LE(0) : pending.readUInt32BE(0);

            if (size <= 0 || pending.length < 4 + size) {
                break;
            }

            const frame = pending.subarray(0, 4 + size);
            pending = pending.subarray(4 + size);
            ws.send(frame);
        }
    });

    const close = () => {
        tcp.destroy();
        ws.close();
    };

    ws.on('close', () => tcp.destroy());
    ws.on('error', close);
    tcp.on('close', () => ws.close());
    tcp.on('error', (error) => {
        console.error('[bridge] TCP 错误:', error.message);
        ws.close();
    });
});

wss.on('listening', () => {
    console.log(`[bridge] 监听 ws://127.0.0.1:${PORT} -> ${TARGET}`);
});
