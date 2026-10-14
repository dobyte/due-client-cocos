import assert from 'node:assert';
import { WebSocket } from 'ws';
import { Packer, Client } from '../assets/scripts/network/index';
import { startMockServer } from './mock-server';

// 将 ws 的 WebSocket 实现注入为全局，供 Client 使用（Node 环境无浏览器 WebSocket）
(globalThis as any).WebSocket = WebSocket;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encode(s: string): Uint8Array {
    return encoder.encode(s);
}

function decode(b: Uint8Array): string {
    return decoder.decode(b);
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
    ]);
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testPacker() {
    const packer = new Packer({ byteOrder: 'big', routeBytes: 2, seqBytes: 2, bufferBytes: 5000 });

    // 心跳包
    const hb = packer.unpack(packer.packHeartbeat());
    assert.strictEqual(hb.isHeartbeat, true);
    assert.strictEqual(hb.millisecond, undefined);

    // 消息包
    const packed = packer.packMessage({ seq: 123, route: 1, buffer: encode('hello') });
    const packet = packer.unpack(packed);
    assert.strictEqual(packet.isHeartbeat, false);
    assert.strictEqual(packet.message!.route, 1);
    assert.strictEqual(packet.message!.seq, 123);
    assert.strictEqual(decode(packet.message!.buffer!), 'hello');

    console.log('  ✓ Packer 编解码（心跳/消息）通过');
}

async function testClient() {
    const packer = new Packer({ byteOrder: 'big', routeBytes: 2, seqBytes: 2, bufferBytes: 5000 });
    const server = await startMockServer(0, packer);

    const client = new Client({
        url: `ws://127.0.0.1:${server.port}`,
        heartbeat: 200,
        packer,
    });

    const onConnect = new Promise<void>((resolve) => client.onConnect(() => resolve()));
    const onReceive = new Promise<string>((resolve) => client.onReceive((_c, m) => resolve(decode(m.buffer!))));
    const onHeartbeat = new Promise<number>((resolve) => client.onHeartbeat((_c, ms) => { if (ms) resolve(ms); }));
    const onDisconnect = new Promise<void>((resolve) => client.onDisconnect(() => resolve()));

    client.connect();
    await withTimeout(onConnect, 3000, '连接超时');

    // 异步消息
    client.send({ route: 100, buffer: encode(JSON.stringify({ hello: 'world' })) });
    const recv = await withTimeout(onReceive, 3000, '接收消息超时');
    assert.ok(recv.includes('hello from mock server'), '回显内容应包含服务器响应');
    console.log('  ✓ send/onReceive 异步消息通过');

    // 同步请求
    const resp = await withTimeout(client.request(200, encode('ping'), 3000), 3000, '请求超时');
    const respText = decode(resp.buffer!);
    assert.ok(respText.includes('ping'), '响应应回显请求数据');
    console.log('  ✓ request/response 同步请求通过');

    // 心跳
    const ms = await withTimeout(onHeartbeat, 3000, '心跳超时');
    assert.ok(ms > 0, '心跳应携带服务器时间戳');
    console.log(`  ✓ 心跳通过（服务器时间戳 ${ms}）`);

    // 断开连接
    client.disconnect();
    await withTimeout(onDisconnect, 3000, '断开连接超时');
    console.log('  ✓ disconnect 断开连接通过');

    server.wss.close();
    await delay(50);
}

async function main() {
    console.log('=== due 客户端模拟测试 ===\n');
    console.log('[1] Packer 编解码');
    await testPacker();
    console.log('\n[2] Client 端到端通信');
    await testClient();
    console.log('\n=== 全部测试通过 ===');
}

main().catch((err) => {
    console.error('测试失败:', err);
    process.exit(1);
});
