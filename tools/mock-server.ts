import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Packer } from '../assets/scripts/network/index';
import { concatBytes, equalBytes, randomBytes, utf8Bytes } from '../assets/scripts/network/security/bytes';
import { isSuiteSupported, DEFAULT_SUITES } from '../assets/scripts/network/security/aead';
import {
    decodeHandshakeFrame,
    deriveKeyMaterial,
    Direction,
    encodeHandshakeFrame,
    HandshakeFrame,
    KeyMaterial,
    SecureSession,
} from '../assets/scripts/network/security/handshake';
import { hmacSha256, sha256 } from '../assets/scripts/network/security/sha256';
import { generateX25519KeyPair, x25519 } from '../assets/scripts/network/security/x25519';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const TRANSCRIPT_LABEL = utf8Bytes('due-handshake-v1');

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

/**
 * 模拟服务端安全配置
 */
export interface MockSecurity {
    // 允许协商的套件（按服务端偏好排序）
    suites?: number[];
    // 模拟服务端签名（实际网关使用 RSA/ECDSA 私钥）
    signer: (data: Uint8Array) => Uint8Array;
}

interface PendingHandshake {
    transcript: Uint8Array;
    finishKey: Uint8Array;
    session: SecureSession;
}

/**
 * 处理 ClientHello 并返回 ServerHello 与待确认的握手状态
 */
function acceptHandshake(frame: Uint8Array, security: MockSecurity): { reply: Uint8Array; pending: PendingHandshake } {
    const { type, body } = decodeHandshakeFrame(frame);

    if (type !== HandshakeFrame.ClientHello || body.length < 65) {
        throw new Error('expect client hello');
    }

    const clientRandom = body.subarray(0, 32);
    const clientPublicKey = body.subarray(32, 64);
    const count = body[64];

    if (count === 0 || body.length !== 65 + count) {
        throw new Error('invalid client hello');
    }

    const offered = Array.from(body.subarray(65));
    const suites = security.suites && security.suites.length ? security.suites : DEFAULT_SUITES;
    const suiteID = suites.find((suite) => offered.indexOf(suite) !== -1 && isSuiteSupported(suite));

    if (suiteID === undefined) {
        throw new Error('no common aead suite');
    }

    const { privateKey, publicKey } = generateX25519KeyPair();
    const serverRandom = randomBytes(32);
    const prefix = concatBytes(new Uint8Array([suiteID]), serverRandom, publicKey);
    const signature = security.signer(sha256(concatBytes(TRANSCRIPT_LABEL, body, prefix)));
    const transcript = sha256(concatBytes(body, prefix, signature));
    const shared = x25519(privateKey, clientPublicKey);
    const salt = concatBytes(clientRandom, serverRandom);
    const material: KeyMaterial = deriveKeyMaterial(shared, salt, transcript);
    const mac = hmacSha256(material.s2cFinish, transcript);
    const replyBody = concatBytes(
        prefix,
        new Uint8Array([(signature.length >>> 8) & 0xff, signature.length & 0xff]),
        signature,
        mac,
    );

    return {
        reply: encodeHandshakeFrame(HandshakeFrame.ServerHello, replyBody),
        pending: {
            transcript,
            finishKey: material.c2sFinish,
            session: new SecureSession(suiteID, material, 'server'),
        },
    };
}

/**
 * 校验客户端 Finished 帧
 */
function confirmHandshake(pending: PendingHandshake, frame: Uint8Array): SecureSession {
    const { type, body } = decodeHandshakeFrame(frame);

    if (type !== HandshakeFrame.Finished) {
        throw new Error('expect finished');
    }

    if (!equalBytes(hmacSha256(pending.finishKey, pending.transcript), body)) {
        throw new Error('invalid finished mac');
    }

    return pending.session;
}

export interface MockServer {
    wss: WebSocketServer;
    port: number;
}

/**
 * 启动 due 协议模拟服务器
 * @param port 监听端口，传 0 表示随机端口
 * @param packer 与客户端一致的打包器（保证协议一致性）
 * @param security 会话安全配置；不传则不启用
 */
export function startMockServer(port = 3533, packer = new Packer(), security?: MockSecurity): Promise<MockServer> {
    return new Promise((resolve) => {
        const wss = new WebSocketServer({ port });

        wss.on('connection', (ws: WebSocket) => {
            let session: SecureSession | undefined;
            let pending: PendingHandshake | undefined;

            ws.on('message', (data) => {
                const raw = data as Buffer;
                const arrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
                const packet = packer.unpack(arrayBuffer);

                // 握手帧 -> 推进握手状态机
                if (packet.isHandshake) {
                    if (!security) {
                        return;
                    }

                    try {
                        const payload = packet.handshake || new Uint8Array(0);

                        if (session) {
                            return;
                        }

                        if (pending === undefined) {
                            const accepted = acceptHandshake(payload, security);
                            pending = accepted.pending;
                            ws.send(Buffer.from(packer.packHandshake(accepted.reply)));
                        } else {
                            session = confirmHandshake(pending, payload);
                            pending = undefined;
                            console.log('[mock-server] 安全握手完成');
                        }
                    } catch (error) {
                        console.error('[mock-server] 安全握手失败:', error);
                        ws.close();
                    }

                    return;
                }

                // 心跳包 -> 回复携带服务器时间戳的心跳
                if (packet.isHeartbeat) {
                    ws.send(packHeartbeat(Date.now()));
                    return;
                }

                if (!packet.message) {
                    return;
                }

                let message = packet.message;

                // 安全会话已建立 -> 解密客户端消息
                if (security) {
                    if (!session) {
                        return;
                    }

                    try {
                        message = {
                            seq: message.seq,
                            route: message.route,
                            buffer: session.open(
                                message.buffer || new Uint8Array(0),
                                Direction.ClientToServer,
                                message.route,
                                message.seq || 0,
                            ),
                        };
                    } catch (error) {
                        console.error('[mock-server] 解密消息失败:', error);
                        return;
                    }
                }

                const text = message.buffer ? decode(message.buffer) : '';

                console.log(`[mock-server] 收到消息 route=${message.route} seq=${message.seq} data=${text}`);

                // 回显消息（保留 route 与 seq，用于 request/response）
                const payload = encode(JSON.stringify({
                    code: 0,
                    message: 'hello from mock server',
                    echo: text,
                    serverTime: Date.now(),
                }));

                const response = security && session
                    ? {
                        seq: message.seq,
                        route: message.route,
                        buffer: session.seal(
                            payload,
                            Direction.ServerToClient,
                            message.route,
                            message.seq || 0,
                        ),
                    }
                    : {
                        seq: message.seq,
                        route: message.route,
                        buffer: payload,
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
