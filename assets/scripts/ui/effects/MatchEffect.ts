import { _decorator, Color, Component, Node, Sprite, SpriteFrame, UITransform, Vec3, resources } from 'cc';
import { MatchEffectConfig, MatchEmitterConfig } from '../../data/models/LevelThemeModel';
const { ccclass } = _decorator;

/**
 * MatchEffect v6 — 瀑布喷涌特效
 *
 * 用户需求 (2026-05-28 13:15 截图标注):
 *   #1 上 (起点) 与 下 (终点) 距离拉到画面底部
 *   #2 不一次喷完, 持续 ~2 秒分批均匀掉落
 *   #3 固定通道宽度, 减少横向扩散 (上下保持等宽)
 *   #4 多种碎片贴图叠加 (主白瓷砖 + sand 沙 + line 线 + crystal 水晶 + drip 水滴)
 *   #5 整体瀑布感, 喷涌持续涌出
 *
 * 实现: 持续发射器, 在 EMIT_DURATION 时间内按 EMIT_RATE 不断生成新碎片,
 *       每个碎片有恒定 vx/vy + 重力, 形成瀑布轨迹
 */

const ORIGINAL_PREFAB_JSON = {
    // ... 见 v5 (保留追溯), 字段省略
    pathHint: '739ae8977278ca460163e5593c272414__739ae8977278ca460163e5593c272414_-7637875102593675964.json',
    fragmentParticle:     716708473702292539,
    fragment2Particle:    -6833865081870727727,
    fragmentSupParticle:  -8635760952708424958,
    fragment2SupParticle: -809088011766190812,
    fragmentNormalMat:    569055321363533231,
    fragmentIceMat:       -3600217064710581631,
};

type EmitterCfg = MatchEmitterConfig;

interface MatchEffectPlayOptions {
    countScale?: number;
    speedScale?: number;
    xSpeedScale?: number;
    ySpeedScale?: number;
    spreadScale?: number;
    spreadXScale?: number;
    spreadYScale?: number;
    lifeScale?: number;
    emitDurationScale?: number;
    /** 让后发射的碎片继承发射器已经经过的时间，避免晚生成碎片永远停在横向起点 */
    initialAgeScale?: number;
    /** 横向越往左飞，额外向下压得越多，用来形成右上到左下的三角结构 */
    diagonalFallStrength?: number;
    xOffset?: number;
    yOffset?: number;
}

@ccclass('MatchEffect')
export class MatchEffect extends Component {
    private static framePools: Record<string, SpriteFrame[]> = {
        shards: [], sand: [], line: [], crystal: [], drip: [],
    };
    private static loaded = false;

    private static enabled = true;
    private static readonly DEFAULT_GRAVITY = -5600;
    private static readonly DEFAULT_EMIT_DURATION = 0.62;
    /** 全局重力 (绝对值越大，下落越快) */
    private static GRAVITY = MatchEffect.DEFAULT_GRAVITY;
    /** 持续发射时间 (秒) */
    private static EMIT_DURATION = MatchEffect.DEFAULT_EMIT_DURATION;
    /** 终点 Y 偏移 (相对起点 worldPos), 让碎片瀑布到画面底部 */
    private static FALL_TARGET_Y_OFFSET = -1600;

    /**
     * 多发射器配置: 主+辅助叠加
     * 统一用“小碎片”：去掉大块和极小颗粒，保留密度与铺开
     */
    private static readonly DEFAULT_EMITTERS: EmitterCfg[] = [
        // 主瓷片：增加数量和尺寸权重，减少“太碎”的感觉
        {
            totalCount: 230, pool: 'shards',
            sizeMin: 40, sizeMax: 68,
            lifeMin: 0.95, lifeMax: 1.35,
            vxMin: -980, vxMax: 120,
            vyMin: -120, vyMax: 760,
            spreadX: 220, spreadY: 170,
            rotSpeedAmp: 1280,
        },
        // 次级主瓷片：保留密度，但仍以可见瓷片为主
        {
            totalCount: 220, pool: 'shards',
            sizeMin: 36, sizeMax: 56,
            lifeMin: 0.85, lifeMax: 1.25,
            vxMin: -1050, vxMax: 160,
            vyMin: -180, vyMax: 820,
            spreadX: 240, spreadY: 190,
            rotSpeedAmp: 1580,
        },
        // 小沙粒：减少占比，只做填缝
        {
            totalCount: 105, pool: 'sand',
            sizeMin: 24, sizeMax: 38,
            lifeMin: 0.75, lifeMax: 1.12,
            vxMin: -1100, vxMax: 180,
            vyMin: -220, vyMax: 700,
            spreadX: 230, spreadY: 180,
            rotSpeedAmp: 980,
        },
        // 小线状光纹：减少占比，避免过碎
        {
            totalCount: 80, pool: 'line',
            sizeMin: 36, sizeMax: 64,
            lifeMin: 0.78, lifeMax: 1.15,
            vxMin: -1120, vxMax: 80,
            vyMin: -120, vyMax: 740,
            spreadX: 220, spreadY: 155,
            rotSpeedAmp: 520,
            colorTint: { r: 255, g: 255, b: 255 }, // 保白
        },
        // 小水晶点缀：少量保留
        {
            totalCount: 35, pool: 'crystal',
            sizeMin: 26, sizeMax: 42,
            lifeMin: 0.8, lifeMax: 1.2,
            vxMin: -920, vxMax: 120,
            vyMin: -160, vyMax: 620,
            spreadX: 210, spreadY: 160,
            rotSpeedAmp: 980,
            colorTint: { r: 220, g: 235, b: 255 },
        },
    ];
    private static EMITTERS: EmitterCfg[] = [...MatchEffect.DEFAULT_EMITTERS];

    static configure(config?: MatchEffectConfig): void {
        this.enabled = config?.enabled !== false;
        this.GRAVITY = config?.gravity ?? this.DEFAULT_GRAVITY;
        this.EMIT_DURATION = config?.emitDuration ?? this.DEFAULT_EMIT_DURATION;
        this.EMITTERS = config?.emitters ? [...config.emitters] : [...this.DEFAULT_EMITTERS];
    }

    private static driver: MatchEffect | null = null;
    private shards: ShardState[] = [];
    private emitters: ActiveEmitter[] = [];

    static preload(onDone?: () => void): void {
        if (this.loaded) { onDone?.(); return; }
        const tasks: Array<{ path: string; pool: string }> = [];
        // shards 9 张白
        for (let i = 0; i < 9; i += 1) tasks.push({ path: `art/effects/match_shards/shard_${i}/spriteFrame`, pool: 'shards' });
        // 辅助单图
        tasks.push({ path: 'art/effects/aux_sand/spriteFrame', pool: 'sand' });
        tasks.push({ path: 'art/effects/aux_sand1/spriteFrame', pool: 'sand' });
        tasks.push({ path: 'art/effects/aux_line/spriteFrame', pool: 'line' });
        tasks.push({ path: 'art/effects/aux_crystal/spriteFrame', pool: 'crystal' });
        tasks.push({ path: 'art/effects/aux_drip/spriteFrame', pool: 'drip' });

        let count = 0;
        const total = tasks.length;
        for (const t of tasks) {
            resources.load(t.path, SpriteFrame, (err, frame) => {
                if (!err && frame) MatchEffect.framePools[t.pool].push(frame);
                count += 1;
                if (count === total) {
                    MatchEffect.loaded = MatchEffect.framePools.shards.length > 0;
                    onDone?.();
                }
            });
        }
    }

    /** 三消瞬间在世界坐标启动瀑布发射器 */
    static playAt(worldPos: Vec3, effectLayer: Node, options: MatchEffectPlayOptions = {}): void {
        if (!this.enabled) return;
        if (!effectLayer || !effectLayer.isValid) return;
        if (!this.loaded) {
            // 资源还没加载完（首次三消时偶发），触发一次 preload 完成后重试
            this.preload(() => {
                if (this.loaded) this.playAt(worldPos, effectLayer, options);
            });
            return;
        }

        if (!this.driver || !this.driver.node || !this.driver.node.isValid || this.driver.node !== effectLayer) {
            this.driver = effectLayer.getComponent(MatchEffect) ?? effectLayer.addComponent(MatchEffect);
        }

        const countScale = options.countScale ?? 1;
        const speedScale = options.speedScale ?? 1;
        const xSpeedScale = options.xSpeedScale ?? 1;
        const ySpeedScale = options.ySpeedScale ?? 1;
        const spreadScale = options.spreadScale ?? 1;
        const spreadXScale = options.spreadXScale ?? 1;
        const spreadYScale = options.spreadYScale ?? 1;
        const lifeScale = options.lifeScale ?? 1;
        const emitDurationScale = options.emitDurationScale ?? 1;
        const initialAgeScale = options.initialAgeScale ?? 0;
        const diagonalFallStrength = options.diagonalFallStrength ?? 0;
        const spawnPos = new Vec3(
            worldPos.x + (options.xOffset ?? 0),
            worldPos.y + (options.yOffset ?? 0),
            worldPos.z,
        );

        // 为每个 EmitterCfg 启动一个持续发射器，可按单块砖做数量/速度差异
        for (const cfg of this.EMITTERS) {
            const scaledCfg: EmitterCfg = {
                ...cfg,
                totalCount: Math.max(1, Math.round(cfg.totalCount * countScale)),
                lifeMin: cfg.lifeMin * lifeScale,
                lifeMax: cfg.lifeMax * lifeScale,
                vxMin: cfg.vxMin * speedScale * xSpeedScale,
                vxMax: cfg.vxMax * speedScale * xSpeedScale,
                vyMin: cfg.vyMin * speedScale * ySpeedScale,
                vyMax: cfg.vyMax * speedScale * ySpeedScale,
                spreadX: cfg.spreadX * spreadScale * spreadXScale,
                spreadY: cfg.spreadY * spreadScale * spreadYScale,
                rotSpeedAmp: cfg.rotSpeedAmp * speedScale,
            };
            this.driver.emitters.push({
                cfg: scaledCfg,
                worldPos: spawnPos.clone(),
                layer: effectLayer,
                t: 0,
                emittedCount: 0,
                duration: this.EMIT_DURATION * emitDurationScale,
                initialAgeScale,
                diagonalFallStrength,
            });
        }
    }

    private spawnOne(em: ActiveEmitter): void {
        const cfg = em.cfg;
        const pool = MatchEffect.framePools[cfg.pool];
        if (!pool || pool.length === 0) return;
        const frame = pool[Math.floor(Math.random() * pool.length)];
        const layer = em.layer;
        if (!layer || !layer.isValid) return;

        const node = new Node(`Shard_${cfg.pool}_${Date.now()}_${em.emittedCount}`);
        node.layer = layer.layer;
        const sp = node.addComponent(Sprite);
        sp.spriteFrame = frame;
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        const ut = node.addComponent(UITransform);
        const sizeRandPow = Math.pow(Math.random(), 1.3);
        const size = cfg.sizeMin + sizeRandPow * (cfg.sizeMax - cfg.sizeMin);
        ut.setContentSize(size, size);
        layer.addChild(node);

        // #3 减少扩散: spreadX/Y 控制起点抖动幅度
        const startX = em.worldPos.x + (Math.random() - 0.5) * cfg.spreadX;
        const startY = em.worldPos.y + (Math.random() - 0.5) * cfg.spreadY;

        const vx = cfg.vxMin + Math.random() * (cfg.vxMax - cfg.vxMin);
        const life = cfg.lifeMin + Math.random() * (cfg.lifeMax - cfg.lifeMin);
        const leftPower = cfg.vxMax !== cfg.vxMin
            ? Math.max(0, Math.min(1, (cfg.vxMax - vx) / (cfg.vxMax - cfg.vxMin)))
            : 0;
        const vyBase = cfg.vyMin + Math.random() * (cfg.vyMax - cfg.vyMin);
        const vy = vyBase - leftPower * em.diagonalFallStrength;
        const initialT = Math.min(life * 0.72, Math.max(0, em.t * em.initialAgeScale + Math.random() * 0.035));
        const initialX = startX + vx * initialT;
        const initialY = startY + vy * initialT + 0.5 * MatchEffect.GRAVITY * initialT * initialT;
        node.setWorldPosition(initialX, initialY, 0);

        const rotSpeed = (Math.random() - 0.5) * cfg.rotSpeedAmp;
        node.angle = Math.random() * 360 + rotSpeed * initialT;

        const tint = cfg.colorTint ?? { r: 255, g: 255, b: 255 };

        this.shards.push({
            node, sprite: sp,
            startX, startY,
            vx, vy,
            t: initialT, life,
            rotSpeed,
            size,
            tintR: tint.r, tintG: tint.g, tintB: tint.b,
        });
    }

    update(dt: number): void {
        // 1) 更新发射器: 持续按比例发射
        for (let i = this.emitters.length - 1; i >= 0; i -= 1) {
            const em = this.emitters[i];
            em.t += dt;
            // 按时间比例确定应该已经发射多少个
            const progress = Math.min(1, em.t / em.duration);
            const targetCount = Math.floor(em.cfg.totalCount * progress);
            while (em.emittedCount < targetCount) {
                this.spawnOne(em);
                em.emittedCount += 1;
            }
            if (em.t >= em.duration && em.emittedCount >= em.cfg.totalCount) {
                this.emitters.splice(i, 1);
            }
        }

        // 2) 更新所有活跃碎片
        if (this.shards.length === 0) return;
        const g = MatchEffect.GRAVITY;
        for (let i = this.shards.length - 1; i >= 0; i -= 1) {
            const s = this.shards[i];
            if (!s.node || !s.node.isValid) {
                this.shards.splice(i, 1);
                continue;
            }
            s.t += dt;
            if (s.t >= s.life) {
                s.node.destroy();
                this.shards.splice(i, 1);
                continue;
            }
            const x = s.startX + s.vx * s.t;
            const y = s.startY + s.vy * s.t + 0.5 * g * s.t * s.t;
            s.node.setWorldPosition(x, y, 0);
            s.node.angle += s.rotSpeed * dt;
            const progress = s.t / s.life;
            // 渐隐: 后 30% 才淡出
            let alpha = 255;
            if (progress > 0.7) {
                alpha = Math.max(0, 255 * (1 - (progress - 0.7) / 0.3));
            }
            s.sprite.color = new Color(s.tintR, s.tintG, s.tintB, alpha);
        }
    }

    static getOriginalPrefab(): typeof ORIGINAL_PREFAB_JSON {
        return ORIGINAL_PREFAB_JSON;
    }

    static clearAll(): void {
        if (!this.driver) return;
        for (const s of this.driver.shards) {
            if (s.node && s.node.isValid) s.node.destroy();
        }
        this.driver.shards = [];
        this.driver.emitters = [];
    }
}

interface ActiveEmitter {
    cfg: EmitterCfg;
    worldPos: Vec3;
    layer: Node;
    t: number;
    emittedCount: number;
    duration: number;
    initialAgeScale: number;
    diagonalFallStrength: number;
}

interface ShardState {
    node: Node;
    sprite: Sprite;
    startX: number;
    startY: number;
    vx: number;
    vy: number;
    t: number;
    life: number;
    rotSpeed: number;
    size: number;
    tintR: number;
    tintG: number;
    tintB: number;
}
