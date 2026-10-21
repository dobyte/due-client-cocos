/**
 * Cocos Creator `cc` 模块的最小类型声明
 *
 * 本仓库是独立库，不包含 Cocos Creator 编辑器生成的 `cc` 类型；
 * 该声明仅用于仓库内的独立类型检查与 IDE 提示，不会随 `assets/scripts` 拷贝到业务工程。
 */
declare module 'cc' {
    interface PropertyDecoratorFn {
        (target: object, propertyKey: string | symbol): void;
        (typeOrOptions?: unknown): (target: object, propertyKey: string | symbol) => void;
    }

    interface Decorator {
        // @ccclass('Name')
        ccclass(name?: string): ClassDecorator;
        // @property 或 @property(Label)
        property: PropertyDecoratorFn;
    }

    export const _decorator: Decorator;

    export class Component {
        schedule(callback: (...args: any[]) => void, interval?: number, repeat?: number, delay?: number): void;
        unschedule(callback: (...args: any[]) => void): void;
    }

    export class Label extends Component {
        string: string;
    }
}
