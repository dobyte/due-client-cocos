import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Packer } from '../assets/scripts/network/index';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encode(s: string): Uint8Array {
    return encoder.encode(s);
}

function decode(b: Uint8Array): string {
    return decoder.decode(b);
}

/**
 * 构造服务器心跳包（携带服务器时间戳）
 * 格式：[size=9][header=0x80][uint64 timestamp]
 */
function packHeartbeat(millisecond: number): Buffer {
    const buf = Buffer.alloc(13);
    buf.writeUInt32BE(9, 0);                 // size
    buf.writeUInt8(1 << 7, 4);               // header（心跳标记）
    buf.writeBigUInt64BE(BigInt(millisecond), 5); // 服务器时间戳（8 字节大端）
    return buf;
}

export interface MockServer {
    wss: WebSocketServer;
    port: number;
}

/**
 * 启动 due 协议模拟服务器
 * @param port 监听端口，传 0 表示随机端口
 * @param packer 与客户端一致的打包器（保证协议一致性）
 */
export function startMockServer(port = 3533, packer = new Packer()): Promise<MockServer> {
    return new Promise((resolve) => {
        const wss = new WebSocketServer({ port });

        wss.on('connection', (ws: WebSocket) => {
            ws.on('message', (data) => {
                const raw = data as Buffer;
                const arrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
                const packet = packer.unpack(arrayBuffer);

                // 心跳包 -> 回复携带服务器时间戳的心跳
                if (packet.isHeartbeat) {
                    ws.send(packHeartbeat(Date.now()));
                    return;
                }

                if (!packet.message) {
                    return;
                }

                const message = packet.message;
                const text = message.buffer ? decode(message.buffer) : '';

                console.log(`[mock-server] 收到消息 route=${message.route} seq=${message.seq} data=${text}`);

                // 回显消息（保留 route 与 seq，用于 request/response）
                const response = {
                    seq: message.seq,
                    route: message.route,
                    buffer: encode(JSON.stringify({
                        code: 0,
                        message: 'hello from mock server',
                        echo: text,
                        serverTime: Date.now(),
                    })),
                };

                ws.send(Buffer.from(packer.packMessage(response)));
            });

            ws.on('close', () => {
                console.log('[mock-server] 客户端断开连接');
            });
        });

        wss.on('listening', () => {
            const address = wss.address();
            const actualPort = typeof address === 'object' && address ? address.port : port;
            console.log(`[mock-server] 模拟服务器已启动 ws://127.0.0.1:${actualPort}`);
            resolve({ wss, port: actualPort });
        });
    });
}

// 直接运行本文件时启动服务器（端口可通过环境变量 PORT 指定）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const port = Number(process.env.PORT || 3533);
    startMockServer(port);
}
