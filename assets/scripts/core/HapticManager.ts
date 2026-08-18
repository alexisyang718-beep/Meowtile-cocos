import { native, sys } from 'cc';
import { NATIVE } from 'cc/env';

/** 与 SettingsModal 中保持一致的存储键 / 字段（此处直接读，避免 core 依赖 ui 层产生循环引用）。 */
const SETTINGS_KEY = 'tile-explorer:settings:v1';

/**
 * 统一震动入口（haptic / vibration）。
 *
 * 设计要点：
 *  - 单例，所有触发源（按钮释放 / combo 动画 / 开局动画）都走这里。
 *  - 受 SettingsStore.vibrate 开关控制，关闭时全局静音。
 *  - 安卓优先调用原生 AppActivity.vibrate(long)（见 native AppActivity.java）；
 *    失败 / 非原生环境回退 navigator.vibrate；都没有则静默，不报错（不影响 PC 调试）。
 *  - 长动画用「分段轻脉冲」模拟持续颤动：每隔 pulseGapMs 发一次 tickMs 短震，
 *    避免一次性长震在很多安卓机型上「嗡」一声糊掉。
 */
class HapticManagerImpl {
    /** 单次震动的默认时长（ms）——按钮点击反馈。
     *  注意：15ms 等过短时长在多数安卓机型上马达还没转起来就结束，几乎无感；
     *  按钮单次震动需要 ~40ms 才能被清晰感知。 */
    private readonly buttonTickMs = 40;
    /** 脉冲序列里每个短震的时长（ms）。 */
    private readonly pulseTickMs = 12;
    /** 脉冲序列里两次短震之间的间隔（ms）。 */
    private readonly pulseGapMs = 70;

    /** 原生反射是否可用（仅安卓 native 运行时）。 */
    private nativeReady: boolean | null = null;
    /** 当前正在进行的脉冲序列计时器集合，便于打断/清理。 */
    private activeTimers = new Set<number>();

    private get enabled(): boolean {
        try {
            const g = globalThis as unknown as { localStorage?: Storage };
            const raw = g.localStorage?.getItem(SETTINGS_KEY);
            if (!raw) return true; // 默认开启（与 DEFAULT_SETTINGS.vibrate = true 一致）
            const parsed = JSON.parse(raw) as { vibrate?: boolean };
            return parsed.vibrate !== false;
        } catch (_e) {
            return true;
        }
    }

    /** 真正下发一次震动（受开关控制由调用方保证）。 */
    private fire(ms: number): void {
        if (ms <= 0) return;
        // 1) 安卓 native 反射
        if (this.tryNative(ms)) return;
        // 2) Web / 小游戏回退
        try {
            const nav = (globalThis as unknown as { navigator?: { vibrate?: (p: number) => boolean } }).navigator;
            if (nav && typeof nav.vibrate === 'function') {
                nav.vibrate(ms);
                return;
            }
        } catch (_e) {
            // ignore
        }
        // 3) 都不支持 → 静默
    }

    private tryNative(ms: number): boolean {
        // 只有真机 native 运行时(NATIVE 常量) + 安卓系统才走原生反射。
        if (!NATIVE || sys.os !== sys.OS.ANDROID) {
            this.nativeReady = false;
            return false;
        }
        try {
            // Cocos 3.x: native 从 'cc' 模块导出，不在 globalThis 上。
            const reflection = native?.reflection;
            if (!reflection || typeof reflection.callStaticMethod !== 'function') {
                this.nativeReady = false;
                return false;
            }
            reflection.callStaticMethod(
                'com/cocos/game/AppActivity',
                'vibrate',
                '(I)V',
                Math.round(ms),
            );
            this.nativeReady = true;
            return true;
        } catch (_e) {
            this.nativeReady = false;
            return false;
        }
    }

    /** 单次轻震（按钮释放等离散事件）。 */
    public tick(ms: number = this.buttonTickMs): void {
        if (!this.enabled) return;
        this.fire(ms);
    }

    /**
     * 分段脉冲：在 durationSec 时间内持续发短震，模拟「跟随动画的持续震动」。
     * @param durationSec 动画总时长（秒）
     */
    public pulse(durationSec: number): void {
        this.pulsePattern(durationSec, this.pulseTickMs, this.pulseGapMs);
    }

    public pulsePattern(durationSec: number, tickMs: number, gapMs: number): void {
        if (!this.enabled) return;
        const totalMs = Math.max(0, durationSec * 1000);
        if (totalMs <= 0) return;
        const safeTickMs = Math.max(1, tickMs);
        const step = safeTickMs + Math.max(0, gapMs);
        const count = Math.max(1, Math.floor(totalMs / step));
        for (let i = 0; i < count; i += 1) {
            const delay = i * step;
            if (delay <= 0) {
                this.fire(safeTickMs);
                continue;
            }
            const timer = (globalThis as unknown as { setTimeout: (fn: () => void, ms: number) => number }).setTimeout(() => {
                this.activeTimers.delete(timer);
                // 每次发射前重新判断开关，途中关闭立即停。
                if (this.enabled) this.fire(safeTickMs);
            }, delay);
            this.activeTimers.add(timer);
        }
    }

    /** 打断所有进行中的脉冲（场景切换/关卡重置时调用，可选）。 */
    public cancelAll(): void {
        const clear = (globalThis as unknown as { clearTimeout: (id: number) => void }).clearTimeout;
        this.activeTimers.forEach((t) => clear(t));
        this.activeTimers.clear();
        this.stopCurrentVibration();
    }

    private stopCurrentVibration(): void {
        if (NATIVE && sys.os === sys.OS.ANDROID) {
            try {
                const reflection = native?.reflection;
                if (reflection && typeof reflection.callStaticMethod === 'function') {
                    reflection.callStaticMethod('com/cocos/game/AppActivity', 'vibrate', '(I)V', 0);
                    return;
                }
            } catch (_e) {
                // ignore
            }
        }
        try {
            const nav = (globalThis as unknown as { navigator?: { vibrate?: (p: number) => boolean } }).navigator;
            nav?.vibrate?.(0);
        } catch (_e) {
            // ignore
        }
    }
}

export const Haptic = new HapticManagerImpl();
