import { director } from 'cc';
import { EventKey, EventKeys } from './EventKeys';

/**
 * 事件总线辅助工具。
 * 业务代码可以继续直接用 `director.emit / director.on`，
 * 也可以用本工具拿到更好的类型提示和调试支持。
 *
 * 详见 docs/EVENT_BUS_V2.md。
 */
export class EventBus {
    private static debugEnabled = false;
    private static debugUnsub: Array<() => void> = [];

    static emit(event: EventKey, ...args: unknown[]): void {
        director.emit(event, ...args);
    }

    static on(event: EventKey, callback: (...args: any[]) => void, target?: unknown): void {
        director.on(event, callback, target);
    }

    static off(event: EventKey, callback: (...args: any[]) => void, target?: unknown): void {
        director.off(event, callback, target);
    }

    /**
     * 开启全局事件日志。仅用于开发调试。
     * 重复调用是幂等的；调用 disableDebugLog 移除监听。
     */
    static enableDebugLog(): void {
        if (this.debugEnabled) return;
        this.debugEnabled = true;
        Object.values(EventKeys).forEach((key) => {
            const handler = (...args: unknown[]): void => {
                // eslint-disable-next-line no-console
                console.log(`[event] ${key}`, ...args);
            };
            director.on(key, handler);
            this.debugUnsub.push(() => director.off(key, handler));
        });
    }

    static disableDebugLog(): void {
        if (!this.debugEnabled) return;
        this.debugUnsub.forEach((fn) => fn());
        this.debugUnsub = [];
        this.debugEnabled = false;
    }
}
