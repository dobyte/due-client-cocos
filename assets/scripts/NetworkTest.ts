import { _decorator, Component, Label } from 'cc';
import { Client, Packer } from './network';

const { ccclass, property } = _decorator;

/**
 * due 网络客户端演示组件
 *
 * 用法：挂载到任意节点上，可选择性拖入一个 Label 用于显示连接状态。
 */
@ccclass('NetworkTest')
export class NetworkTest extends Component {
    // 服务器连接地址
    @property
    url: string = 'ws://127.0.0.1:3533';

    // 状态显示 Label（可选）
    @property(Label)
    statusLabel: Label | null = null;

    private client: Client | null = null;

    start() {
        this.client = new Client({
            url: this.url,
            heartbeat: 10000,
            packer: new Packer({
                byteOrder: 'big',
                seqBytes: 2,
                routeBytes: 2,
                bufferBytes: 5000,
            }),
        });

        this.client.onConnect((c) => this.onConnect(c));
        this.client.onDisconnect((c) => this.onDisconnect(c));
        this.client.onReceive((c, message) => this.onReceive(c, message));
        this.client.onHeartbeat((c, millisecond) => this.onHeartbeat(c, millisecond));
        this.client.onError((c) => this.onError(c));

        this.client.connect();
    }

    onDestroy() {
        this.unschedule(this.doSend);
        this.client && this.client.disconnect();
        this.client = null;
    }

    private onConnect(_c: Client) {
        console.log('[NetworkTest] 连接成功');
        this.setStatus('已连接');

        // 连接成功后每秒发送一次请求
        this.schedule(this.doSend, 1);
    }

    private onDisconnect(_c: Client) {
        console.log('[NetworkTest] 连接断开');
        this.setStatus('已断开，正在重连...');
        this.unschedule(this.doSend);

        // 3 秒后自动重连
        setTimeout(() => {
            this.client && this.client.connect();
        }, 3000);
    }

    private onReceive(_c: Client, message: { route: number; seq?: number; buffer?: Uint8Array }) {
        const text = message.buffer ? new TextDecoder().decode(message.buffer) : '';
        console.log(`[NetworkTest] 收到消息 route=${message.route} seq=${message.seq} data=${text}`);
    }

    private onHeartbeat(_c: Client, millisecond?: number) {
        millisecond && console.log(`[NetworkTest] 服务器时间戳: ${millisecond}`);
    }

    private onError(_c: Client) {
        console.error('[NetworkTest] 连接错误');
    }

    private doSend = () => {
        if (!this.client || !this.client.isConnected()) {
            return;
        }

        const buffer = new TextEncoder().encode(JSON.stringify({ message: 'hello server', time: Date.now() }));

        // 异步消息
        this.client.send({ route: 1, buffer });

        // 同步请求（需要服务器开启 seq 支持）
        this.client.request(2, buffer, 2000).then((message) => {
            const text = message.buffer ? new TextDecoder().decode(message.buffer) : '';
            console.log(`[NetworkTest] 请求响应: ${text}`);
        }).catch((err) => {
            console.error('[NetworkTest] 请求失败:', err);
        });
    }

    private setStatus(text: string) {
        if (this.statusLabel) {
            this.statusLabel.string = text;
        }
    }
}
