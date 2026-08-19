/**
 * AnalyticsManager — Meowtile 埋点统一出口
 *
 * 需求来源:《Meowtile 核心数据指标》《Meowtile 事件埋点需求》
 * - 公共字段(user_id/session_id/app_version/platform/client_time_ms)自动补齐,字段命名 snake_case
 * - 用户身份:UUID v4,localStorage 持久化(见 PlayerIdentityRuntime)
 * - 上报通道:Android Native 走 AppActivity.firebaseOnEvent 反射桥(Firebase Analytics);
 *   Web/其他平台静默降级只打日志,绝不影响游戏主流程
 * - 会话统计:levels_started / levels_won / levels_failed / max_consecutive_wins / max_reached_level_id
 *   在 session_end 合并上报(所有局内信息合并上报)
 *
 * 设计参考:roblock-cocos Analytics.ts + stack AnalyticsService.ts
 */

import { native, sys } from 'cc';
import { NATIVE } from 'cc/env';
import { APP_VERSION } from '../Constants';
import { LevelId, ChapterId } from '../Types';
import { getPlayerId } from './PlayerIdentityRuntime';

export type TrackEventParams = Record<string, string | number | boolean>;
type Platform = 'ios' | 'android' | 'web' | 'unknown';

const EVENT_LOG_KEY = 'meowtile_analytics_events_v1';
const MAX_LOCAL_EVENTS = 80;

/** 事件参数统一扁平化:Firebase Bundle 只接受 string/number/boolean */
function toFlatParams(params?: Record<string, unknown>): TrackEventParams {
    const out: TrackEventParams = {};
    if (!params) return out;
    for (const key of Object.keys(params)) {
        const value = params[key];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            out[key] = value;
        } else if (value !== undefined && value !== null) {
            out[key] = String(value);
        }
    }
    return out;
}

function resolvePlatform(): Platform {
    if (NATIVE) {
        return sys.os === sys.OS.ANDROID ? 'android' : sys.os === sys.OS.IOS ? 'ios' : 'unknown';
    }
    return 'web';
}

/** 一次关卡尝试的运行时上下文 */
export interface AttemptContext {
    attemptId: string;
    levelId: LevelId;
    chapterId: ChapterId | null;
    attemptIndex: number;
    startMs: number;
    /** 本关累计重开次数(同一会话内) */
    restartCount: number;
}

interface SessionContext {
    sessionId: string;
    startMs: number;
    levelsStarted: number;
    levelsWon: number;
    levelsFailed: number;
    maxConsecutiveWins: number;
    consecutiveWins: number;
    maxReachedLevelId: number;
    /** 记录 level_start 过但未结算的 levelId(退后台补报 session_end 时用) */
    openAttempt: AttemptContext | null;
    /** 每个 level 的尝试次数计数(attempt_index 依据) */
    attemptCountByLevel: Record<string, number>;
}

function newSession(): SessionContext {
    return {
        sessionId: `s_${Date.now()}_${Math.floor(Math.random() * 9000) + 1000}`,
        startMs: Date.now(),
        levelsStarted: 0,
        levelsWon: 0,
        levelsFailed: 0,
        maxConsecutiveWins: 0,
        consecutiveWins: 0,
        maxReachedLevelId: 0,
        openAttempt: null,
        attemptCountByLevel: {},
    };
}

class AnalyticsManagerImpl {
    private session: SessionContext = newSession();
    private sessionEnded = false;

    /** 会话开始(应在 app_open 上报前调用一次)。返回 sessionId。 */
    startSession(): string {
        this.session = newSession();
        this.sessionEnded = false;
        return this.session.sessionId;
    }

    getSessionId(): string {
        return this.session.sessionId;
    }

    /**
     * 通用埋点入口:自动补齐公共字段,分发给 Native Firebase 桥。
     * 未配置/失败时静默,绝不影响主流程。
     */
    track(event: string, params?: Record<string, unknown>): void {
        try {
            const flat = toFlatParams(params);
            const payload: TrackEventParams = {
                user_id: getPlayerId(),
                session_id: this.session.sessionId,
                app_version: APP_VERSION,
                platform: resolvePlatform(),
                client_time_ms: Date.now(),
                ...flat,
            };
            this.rememberLocal(event, payload);
            console.log(`[Analytics] ${event}`, payload);
            if (NATIVE && sys.os === sys.OS.ANDROID) {
                const reflection = native?.reflection;
                if (reflection && typeof reflection.callStaticMethod === 'function') {
                    reflection.callStaticMethod(
                        'com/cocos/game/AppActivity',
                        'firebaseOnEvent',
                        '(Ljava/lang/String;Ljava/lang/String;)V',
                        event, JSON.stringify(payload),
                    );
                }
            }
        } catch (error) {
            console.warn('[Analytics] track failed', error);
        }
    }

    /** 本地留存最近事件(调试面板/QA 用),与上报通道解耦 */
    private rememberLocal(event: string, payload: TrackEventParams): void {
        try {
            const list = this.readLocal();
            list.push({ type: event, timestamp: Date.now(), data: payload });
            if (list.length > MAX_LOCAL_EVENTS) list.splice(0, list.length - MAX_LOCAL_EVENTS);
            sys.localStorage?.setItem(EVENT_LOG_KEY, JSON.stringify(list));
        } catch {
            // ignore
        }
    }

    recent(limit = 20): Array<{ type: string; timestamp: number; data?: unknown }> {
        return this.readLocal().slice(-limit).reverse();
    }

    private readLocal(): Array<{ type: string; timestamp: number; data?: unknown }> {
        try {
            const raw = sys.localStorage?.getItem(EVENT_LOG_KEY);
            if (raw) return JSON.parse(raw);
        } catch {
            // ignore
        }
        return [];
    }

    // ===== 事件封装(字段对齐《Meowtile 事件埋点需求》事件字段明细) =====

    /** app_open — 游戏启动、埋点初始化完成后立即触发 */
    trackAppOpen(isNewUser: boolean, maxClearedLevelId: number): void {
        this.track('app_open', { is_new_user: isNewUser, max_cleared_level_id: maxClearedLevelId });
    }

    /** home_show — 首页每次展示 */
    trackHomeShow(currentLevelId: number, maxClearedLevelId: number): void {
        this.track('home_show', { current_level_id: currentLevelId, max_cleared_level_id: maxClearedLevelId });
    }

    /** start_level_click — source: home/map/result_next/bead_next/unknown */
    trackStartLevelClick(levelId: LevelId, source: string, maxClearedLevelId: number): void {
        this.track('start_level_click', { level_id: levelId, source, max_cleared_level_id: maxClearedLevelId });
    }

    /** level_start — 关卡开始可玩时;生成 attempt_id,统计 attempt_index */
    trackLevelStart(levelId: LevelId, chapterId: ChapterId | null): AttemptContext {
        const countKey = String(levelId);
        this.session.attemptCountByLevel[countKey] = (this.session.attemptCountByLevel[countKey] ?? 0) + 1;
        const attemptIndex = this.session.attemptCountByLevel[countKey];
        const attemptId = `a_${levelId}_${attemptIndex}_${Date.now().toString(36)}`;
        const ctx: AttemptContext = {
            attemptId,
            levelId,
            chapterId,
            attemptIndex,
            startMs: Date.now(),
            restartCount: this.session.openAttempt?.levelId === levelId
                ? this.session.openAttempt.restartCount
                : 0,
        };
        this.session.openAttempt = ctx;
        this.session.levelsStarted += 1;
        if (levelId > this.session.maxReachedLevelId) this.session.maxReachedLevelId = levelId;
        this.track('level_start', {
            attempt_id: attemptId,
            level_id: levelId,
            chapter_id: chapterId ?? 'unknown',
            attempt_index: attemptIndex,
        });
        return ctx;
    }

    /** level_result — win/fail 合并一个事件;结算后清空 openAttempt */
    trackLevelResult(ctx: AttemptContext | null, win: boolean, moves: number, failReason: string): void {
        const c = ctx ?? this.session.openAttempt;
        if (c) {
            this.session.openAttempt = null;
        }
        const durationSec = c ? Math.max(0, Math.round((Date.now() - c.startMs) / 1000)) : 0;
        if (win) {
            this.session.levelsWon += 1;
            this.session.consecutiveWins += 1;
            if (this.session.consecutiveWins > this.session.maxConsecutiveWins) {
                this.session.maxConsecutiveWins = this.session.consecutiveWins;
            }
        } else {
            this.session.levelsFailed += 1;
            this.session.consecutiveWins = 0;
        }
        this.track('level_result', {
            attempt_id: c?.attemptId ?? 'unknown',
            level_id: c?.levelId ?? -1,
            chapter_id: c?.chapterId ?? 'unknown',
            result: win ? 'win' : 'fail',
            duration_sec: durationSec,
            moves,
            restart_count: c?.restartCount ?? 0,
            fail_reason: win ? '' : failReason,
        });
    }

    /** level_restart — 玩家主动重开;重开前上报当前 duration 和 moves */
    trackLevelRestart(ctx: AttemptContext | null, moves: number, source: string): void {
        const c = ctx ?? this.session.openAttempt;
        if (!c) return;
        c.restartCount += 1;
        const durationSec = Math.max(0, Math.round((Date.now() - c.startMs) / 1000));
        this.track('level_restart', {
            attempt_id: c.attemptId,
            level_id: c.levelId,
            duration_sec: durationSec,
            moves,
            source,
        });
    }

    /** level_quit — 局内中途退出(返回/退后台且本关未结算);避免与 level_result 重复 */
    trackLevelQuit(ctx: AttemptContext | null, moves: number, quitSource: string): void {
        const c = ctx ?? this.session.openAttempt;
        if (!c) return;
        this.session.openAttempt = null;
        this.session.consecutiveWins = 0;
        const durationSec = Math.max(0, Math.round((Date.now() - c.startMs) / 1000));
        this.track('level_quit', {
            attempt_id: c.attemptId,
            level_id: c.levelId,
            duration_sec: durationSec,
            moves,
            quit_source: quitSource,
        });
    }

    /** session_end — 会话结束(退后台/回首页/关闭前);同一 session 只报一次 */
    trackSessionEnd(): void {
        if (this.sessionEnded) return;
        this.sessionEnded = true;
        const durationSec = Math.max(0, Math.round((Date.now() - this.session.startMs) / 1000));
        this.track('session_end', {
            duration_sec: durationSec,
            levels_started: this.session.levelsStarted,
            levels_won: this.session.levelsWon,
            levels_failed: this.session.levelsFailed,
            max_consecutive_wins: this.session.maxConsecutiveWins,
            max_reached_level_id: this.session.maxReachedLevelId,
        });
    }

    /** bead_popup_show — popup_type: subchapter_start / level_reward */
    trackBeadPopupShow(params: {
        levelId?: number | null;
        chapterId?: ChapterId | null;
        subchapterId?: string;
        puzzleId?: string;
        popupType: 'subchapter_start' | 'level_reward';
        progressPercent?: number;
        isSubchapterComplete?: boolean;
    }): void {
        this.track('bead_popup_show', {
            level_id: params.levelId ?? -1,
            chapter_id: params.chapterId ?? 'unknown',
            subchapter_id: params.subchapterId ?? 'unknown',
            puzzle_id: params.puzzleId ?? 'unknown',
            popup_type: params.popupType,
            progress_percent: params.progressPercent ?? 0,
            is_subchapter_complete: params.isSubchapterComplete ?? false,
        });
    }

    /** bead_popup_click — action: start/continue/next/home/close */
    trackBeadPopupClick(params: {
        levelId?: number | null;
        chapterId?: ChapterId | null;
        subchapterId?: string;
        puzzleId?: string;
        popupType: 'subchapter_start' | 'level_reward';
        action: string;
        progressPercent?: number;
        isSubchapterComplete?: boolean;
    }): void {
        this.track('bead_popup_click', {
            level_id: params.levelId ?? -1,
            chapter_id: params.chapterId ?? 'unknown',
            subchapter_id: params.subchapterId ?? 'unknown',
            puzzle_id: params.puzzleId ?? 'unknown',
            popup_type: params.popupType,
            action: params.action,
            progress_percent: params.progressPercent ?? 0,
            is_subchapter_complete: params.isSubchapterComplete ?? false,
        });
    }

    /** collection_open — source: home/result/unknown */
    trackCollectionOpen(params: {
        source: string;
        completedPuzzleCount?: number;
        totalPuzzleCount?: number;
        maxClearedLevelId: number;
    }): void {
        this.track('collection_open', {
            source: params.source,
            completed_puzzle_count: params.completedPuzzleCount ?? 0,
            total_puzzle_count: params.totalPuzzleCount ?? 0,
            max_cleared_level_id: params.maxClearedLevelId,
        });
    }
}

export const Analytics = new AnalyticsManagerImpl();
