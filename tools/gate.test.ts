import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { Client, Packer } from '../assets/scripts/network/index';
import { Verifier } from '../assets/scripts/network/security/verifier';

// Node 环境注入 WebSocket 实现
(globalThis as any).WebSocket = WebSocket;

/**
 * 连接真实 due 网关并发送 greet 请求
 *
 * - WebSocket 网关：GATE_URL=ws://127.0.0.1:3553
 * - TCP 网关：先运行 tools/tcp-bridge.ts，再使用默认 GATE_URL
 *
 * 环境变量：
 * - GATE_URL：客户端连接的 WS 地址，默认 ws://127.0.0.1:3554（桥接器）
 * - KEY_FILE：网关 ECDSA 公钥路径，默认 due-benchmark/cluster/tcp/gate/resource/key.pub.pem
 * - ROUTE：业务路由，默认 1（benchmark node 的 greet）
 * - MESSAGE：请求内容，默认 hello-from-cocos-client
 * - SIZE：额外 request/response 测试的负载长度，默认 1024
 * - COUNT：额外 request/response 测试的请求次数，默认 1
 * - SUITES：协商套件，逗号分隔（如 "2" 仅 ChaCha20-Poly1305）；默认双方默认套件
 */

const URL = process.env.GATE_URL || 'ws://127.0.0.1:3554';
const KEY_FILE = process.env.KEY_FILE || 'E:\\workspace\\dobyte\\due-benchmark\\cluster\\tcp\\gate\\resource\\key.pub.pem';
const ROUTE = Number(process.env.ROUTE || 1);
const MESSAGE = process.env.MESSAGE || 'hello-from-cocos-client';
const SIZE = Number(process.env.SIZE || 1024);
const COUNT = Number(process.env.COUNT || 1);
const SUITES = process.env.SUITES ? process.env.SUITES.split(',').map(Number) : undefined;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const publicKey = readFileSync(KEY_FILE, 'utf8');

const client = new Client({
    url: URL,
    // 网关 benchmark 配置关闭了心跳检测
    heartbeat: 0,
    // 与 gateway 的 packet 配置保持一致：routeBytes/seqBytes 均为 4
    packer: new Packer({ byteOrder: 'big', routeBytes: 4, seqBytes: 4, bufferBytes: 5000 }),
    security: {
        verifier: Verifier.ecdsa(publicKey),
        suites: SUITES,
        handshakeTimeout: 5000,
    },
});

const startedAt = Date.now();
let connected = false;

const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待响应超时（10s）')), 10000);

    client.onConnect(() => {
        connected = true;
        console.log(`✓ 安全握手完成，连接建立（${Date.now() - startedAt} ms）`);

        const sentAt = Date.now();
        const payload = encoder.encode(JSON.stringify({ message: MESSAGE, sentAt }));
        const ok = client.send({ route: ROUTE, seq: 1, buffer: payload });

        console.log(`→ 发送 greet：route=${ROUTE} seq=1 len=${payload.length} send=${ok}`);
    });

    client.onReceive((_c, message) => {
        const text = message.buffer ? decoder.decode(message.buffer) : '';
        console.log(`← 收到响应：route=${message.route} seq=${message.seq} body=${text}`);

        try {
            const response = JSON.parse(text);
            assert.strictEqual(response.message, MESSAGE, '响应未回显请求内容');
            console.log('✓ 响应校验通过（message 回显一致）');
            clearTimeout(timer);
            resolve();
        } catch (error) {
            clearTimeout(timer);
            reject(error);
        }
    });

    client.onError(() => {
        if (!connected) {
            clearTimeout(timer);
            reject(new Error('连接或安全握手失败'));
        }
    });

    client.onDisconnect(() => {
        if (!connected) {
            clearTimeout(timer);
            reject(new Error('连接被关闭（未完成握手）'));
        }
    });
});

client.connect();

async function run() {
    await done;

    // request/response（验证 seq 关联、计数器递进与多块 AEAD 加解密）
    const message = 'x'.repeat(SIZE);

    for (let i = 1; i <= COUNT; i++) {
        const requestAt = Date.now();
        const response = await client.request(ROUTE, encoder.encode(JSON.stringify({ message, sentAt: requestAt })), 5000);
        const parsed = JSON.parse(response.buffer ? decoder.decode(response.buffer) : '{}');

        assert.strictEqual(parsed.message, message, '响应未回显请求内容');
        console.log(`✓ request/response ${SIZE}B 通过（${i}/${COUNT}，${Date.now() - requestAt} ms，seq=${response.seq}）`);
    }
}

run()
    .then(() => {
        client.disconnect();
        setTimeout(() => process.exit(0), 100);
    })
    .catch((error) => {
        console.error('✗ 测试失败:', error.message);
        client.disconnect();
        setTimeout(() => process.exit(1), 100);
    });
