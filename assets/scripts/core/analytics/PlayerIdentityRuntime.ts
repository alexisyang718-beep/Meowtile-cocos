/**
 * 玩家身份运行时绑定:把系统 localStorage 注入 PlayerIdentityStore。
 * 本文件依赖 cc,仅供游戏运行时导入;逻辑测试请直接 import PlayerIdentity.ts。
 * (移植自 roblock-cocos)
 */
import { sys } from 'cc';

import { PlayerIdentityStore, PLAYER_ID_KEY, type PlayerIdentityStorage } from './PlayerIdentity';

class SystemPlayerIdentityStorage implements PlayerIdentityStorage {
    public getItem(key: string): string | null {
        return sys.localStorage?.getItem(key) ?? null;
    }
    public setItem(key: string, value: string): void {
        sys.localStorage?.setItem(key, value);
    }
}

/**
 * 是否首次启动(本地无 playerId)。
 * 必须在 PlayerIdentity 实例化前取值,用于 app_open 的 is_new_user 字段。
 */
const isNewPlayer = (sys.localStorage?.getItem(PLAYER_ID_KEY) ?? null) === null;

/** 全局玩家身份单例:进程内唯一,首次取用即固化,此后每次启动复用同一 ID。 */
export const PlayerIdentity = new PlayerIdentityStore(new SystemPlayerIdentityStorage());

// 模块加载即打印(只要场景/脚本 import 此模块就会触发,不再依赖 onLoad)。
// 同时也是身份生成成功的凭据 —— 看到此行 = localStorage 已写入 playerId。
console.log(`[PlayerIdentity] module loaded, playerId=${PlayerIdentity.getId()}, isNewPlayer=${isNewPlayer}`);

/** app_open 的 is_new_user 依据:本次冷启动是否为首次启动(本地无 playerId)。 */
export function isNewPlayerFlag(): boolean {
    return isNewPlayer;
}

export function getPlayerId(): string {
    return PlayerIdentity.getId();
}

/** 调试用:强制更换玩家身份(正常流程勿用)。 */
export function resetPlayerId(): string {
    return PlayerIdentity.reset();
}
