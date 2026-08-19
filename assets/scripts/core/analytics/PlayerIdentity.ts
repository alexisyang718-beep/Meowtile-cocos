/**
 * 玩家游客身份 (UUID v4)。
 * 纯逻辑模块:不依赖 cc,可由 vitest 直接测试。
 * 系统存储绑定与全局单例见 PlayerIdentityRuntime.ts。
 *
 * 生命周期:生成只发生在"localStorage 读不到合法 UUID"时,
 * 即首次启动 / 重装 / 清除数据。正常启动永远复用同一个 ID。
 * (移植自 roblock-cocos,key 前缀改为 meowtile)
 */

export const PLAYER_ID_KEY = 'meowtile:player-id:v1';

export interface PlayerIdentityStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlayerId(value: string): boolean {
    return UUID_RE.test(value);
}

function formatBytes(bytes: Uint8Array): string {
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function v4FromBytes(bytes: Uint8Array): string {
    // RFC 4122 v4:version=4, variant=10
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    return formatBytes(bytes);
}

function cryptoUuid(): string | null {
    const cryptoApi = (globalThis as {
        crypto?: {
            randomUUID?: () => string;
            getRandomValues?: (array: Uint8Array) => Uint8Array;
        };
    }).crypto;
    if (!cryptoApi) return null;
    if (typeof cryptoApi.randomUUID === 'function') {
        try {
            const value = cryptoApi.randomUUID();
            if (isPlayerId(value)) return value;
        } catch {
            // fall through to next source
        }
    }
    if (typeof cryptoApi.getRandomValues === 'function') {
        try {
            const bytes = new Uint8Array(16);
            cryptoApi.getRandomValues(bytes);
            return v4FromBytes(bytes);
        } catch {
            // fall through to Math.random
        }
    }
    return null;
}

function mathRandomUuid(): string {
    const bytes = new Uint8Array(16);
    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
    }
    return v4FromBytes(bytes);
}

/**
 * 生成 v4 UUID。
 * 优先 Web Crypto (randomUUID → getRandomValues);
 * Android JSB 无 crypto 时降级 Math.random(格式仍为合法 v4)。
 */
export function generatePlayerId(): string {
    return cryptoUuid() ?? mathRandomUuid();
}

const NOOP_STORAGE: PlayerIdentityStorage = Object.freeze({
    getItem: () => null,
    setItem: () => undefined,
});

export class PlayerIdentityStore {
    private readonly storage: PlayerIdentityStorage;
    private id: string;

    public constructor(storage?: PlayerIdentityStorage) {
        this.storage = storage ?? NOOP_STORAGE;
        const persisted = this.storage.getItem(PLAYER_ID_KEY);
        this.id = persisted && isPlayerId(persisted) ? persisted : this.issueNewId();
    }

    public getId(): string {
        return this.id;
    }

    /** 调试/风控用:强制换新身份并持久化。正常流程永不调用。 */
    public reset(): string {
        this.id = this.issueNewId();
        return this.id;
    }

    private issueNewId(): string {
        const id = generatePlayerId();
        try {
            this.storage.setItem(PLAYER_ID_KEY, id);
        } catch (error) {
            console.warn('[PlayerIdentity] persist failed', error);
        }
        return id;
    }
}
