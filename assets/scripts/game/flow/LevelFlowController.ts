import { _decorator, Component, EventTouch, Input, Node, Sprite, UITransform, Vec3, director, input, tween } from 'cc';
import { GAME_CONFIG } from '../../core/Constants';
import { EventKeys } from '../../core/EventKeys';
import { resolveLevelTheme } from '../../config/LevelThemeResolver';
import { GameState } from '../../core/GameState';
import { BoosterType, LevelId, TileId, TileSelectionResult, BoosterUseResult } from '../../core/Types';
import { ChapterRepository } from '../../data/repositories/ChapterRepository';
import { ConfigRepository } from '../../data/repositories/ConfigRepository';
import { LevelRepository } from '../../data/repositories/LevelRepository';
import { ProgressRepository } from '../../data/repositories/ProgressRepository';
import { LevelModel } from '../../data/models/LevelModel';
import { ResolvedLevelTheme, ShakeLevel } from '../../data/models/LevelThemeModel';
import { TileRuntimeModel } from '../../data/models/TileModel';
import { getMatchKey } from '../../core/TileMatchGroup';
import { Haptic } from '../../core/HapticManager';
import { Analytics } from '../../core/analytics/AnalyticsManager';
import type { AttemptContext } from '../../core/analytics/AnalyticsManager';
import { BoardManager } from '../board/BoardManager';
import { SlotManager, type SlotAddResult } from '../slot/SlotManager';
import { ConveyorManager } from '../conveyor/ConveyorManager';
import { DropChuteManager } from '../conveyor/DropChuteManager';
import { HudView } from '../../ui/hud/HudView';
import { ResultView } from '../../ui/result/ResultView';
import { AudioFeedback } from '../feedback/AudioFeedback';
import { colorFromHex, createLabel, createNode, drawCircle, drawRect, loadSpriteFrameFromResources } from '../../ui/common/UiFactory';
import { ScreenAdapter } from '../../ui/common/ScreenAdapter';
import { UI_LAYOUT } from '../../ui/common/UILayoutConfig';
import { MatchEffect } from '../../ui/effects/MatchEffect';
import { ComboFeedback } from '../../ui/effects/ComboFeedback';
import { MetaChapterRepository } from '../../meta/MetaChapterRepository';
import { BeadProgressService } from '../../meta/beads/BeadProgressService';
import { GameSession, GameSnapshot } from './GameSession';

const { ccclass } = _decorator;

const GAME_BACKGROUND_SOURCE_WIDTH = 1242;
const GAME_BACKGROUND_SOURCE_HEIGHT = 2340;
const MAX_RESULT_COMBO_VOICE_WAIT_SEC = 1.8;

/**
 * LevelFlowController — 关卡内核心流程控制器
 *
 * 历史脉络：
 * - v1.5.0：碎片瀑布特效初版（自家实现，270 粒子）
 * - v1.5.1：拆出 AppFlow 顶层接管（autoBoot/teardown/onReturnHome）
 * - v1.5.2：合并同事 feat/ui 的瀑布特效 v6.3 + 飞入动画 + 成功/失败弹窗 + 复活
 *   * 仅引入"飞入 + 瀑布 + 弹窗 + 复活"4 件事，BoardManager / SlotManager / TileActor / SlotItemView
 *     仍以 main 版（你调好的堆叠/cover/托盘）为准；同事的 ComboFeedback 暂不引入。
 */
@ccclass('LevelFlowController')
export class LevelFlowController extends Component {
    private readonly session = new GameSession();
    private board!: BoardManager;
    private slot!: SlotManager;
    private conveyor: ConveyorManager | null = null;
    private dropChute: DropChuteManager | null = null;
    private hud!: HudView;
    private result!: ResultView;
    private audio!: AudioFeedback;
    private comboFeedback: ComboFeedback | null = null;
    private currentTheme: ResolvedLevelTheme | null = null;
    /** 顶层特效层（碎片爆裂 + Combo 文字） */
    private effectLayer!: Node;

    /** v1.6: combo 计数 (用于 hub 槽抖动等级判定) */
    private comboCount = 0;
    private lastMatchTime = 0;
    /** combo 时间窗口与 ComboFeedback 一致 */
    private static readonly COMBO_WINDOW_SEC = 1.5;

    /**
     * v1.5.5：飞行中尚未落槽的 tile 数量。
     * 飞行 0.35s 期间用户可能继续点击，期间 slot.getCount() 还没更新，
     * 多张 tile 会算出相同的 slotIndex 全部飞向同一格，落槽时撞在一起，
     * 视觉上像"丢失"。这里给每张飞行中的 tile 预占一个槽位。
     */
    private pendingFlyCount = 0;

    /** hub 为空时点金色，先入槽挂起，等待下一张普通 tile 触发。 */
    private pendingGoldenTileId: TileId | null = null;


    /** v1.5：外层 AppFlowController 提供的"返回首页"回调；不存在时执行内置兜底 */
    private onReturnHome: (() => void) | null = null;
    private autoBoot = true;
    private resultTask: (() => void) | null = null;
    /** 当前关卡尝试上下文(埋点用;level_start 生成,result/quit 结算) */
    private currentAttempt: AttemptContext | null = null;

    protected onEnable(): void {
        ScreenAdapter.onResize(this.handleResize, this);
    }

    protected onDisable(): void {
        ScreenAdapter.offResize(this.handleResize, this);
        this.cancelResultTask();
    }

    private handleResize = (): void => {
        if (!this.node.activeInHierarchy) return;
        ScreenAdapter.applyFullscreen(this.node);
        const bgNode = this.node.getChildByName('ChapterBackground');
        if (bgNode) this.applyGameBackgroundCover(bgNode);
        if (this.hasEditableLayout()) this.applyEditableLayoutScale();
    };

    protected start(): void {
        // v1.5：当 Main.scene 直接挂 LevelFlowController（旧用法）时，
        // 自动创建 AppFlowController 接管首页/地图/设置流程，避免必须手工改 Cocos 场景。
        // AppFlow 创建时会调用 setAutoBoot(false)，所以下面的 if 自动失效。
        if (this.autoBoot) {
            void this.installAppFlowOnSelf();
        }
    }

    /** v1.5：外层接管时调用，禁用 start() 内的自动启动 */
    setAutoBoot(value: boolean): void {
        this.autoBoot = value;
    }

    /** v1.5：外层接管时绑定"返回首页"回调（替代默认 backToHome 走自己的逻辑） */
    setReturnHomeHandler(cb: () => void): void {
        this.onReturnHome = cb;
    }

    setChapterStartHandler(cb: (levelId: LevelId) => void): void {
        this.onOpenChapterStart = cb;
    }

    setChapterEndHandler(cb: (levelId: LevelId) => void): void {
        this.onOpenChapterEnd = cb;
    }


    /** v1.5：外层显式启动入口（替代 start 自动 bootstrap） */
    async boot(levelId: LevelId = GAME_CONFIG.defaultLevelId): Promise<GameSnapshot> {
        MatchEffect.preload();
        this.buildRuntimeView();
        await ChapterRepository.loadAll();
        return this.startLevel(levelId);
    }

    /** v1.5：清理 runtime 子节点，便于 AppFlow 切换到首页/地图后释放资源 */
    teardown(): void {
        this.cancelResultTask();
        (this.audio as AudioFeedback | undefined)?.stopBgm();
        if (!this.hasEditableLayout()) {
            this.node.removeAllChildren();
        }
        this.session.state = GameState.Home;
    }

    /**
     * v1.5：在自身节点上挂载 AppFlowController 接管整个 App 流程。
     * 通过动态 require 避免 LevelFlowController <-> AppFlowController 互引导致循环依赖。
     */
    private async installAppFlowOnSelf(): Promise<void> {
        // 标记自动启动已让位给 AppFlow，避免重复进入
        this.autoBoot = false;
        const mod: typeof import('./AppFlowController') = await import('./AppFlowController');
        const AppFlowCtor = mod.AppFlowController;
        // 在父节点上挂 AppFlowController（而不是同节点，避免组件冲突）
        const parent = this.node.parent ?? this.node;
        const appNode = ScreenAdapter.createFullscreenNode(parent, 'AppFlow');
        appNode.layer = this.node.layer;
        appNode.addComponent(AppFlowCtor);
        // 隐藏自身节点，让 AppFlow 完全接管渲染
        this.node.active = false;
    }

    getSnapshot(): GameSnapshot {
        return this.session.getSnapshot();
    }

    async startLevel(levelId: LevelId = GAME_CONFIG.defaultLevelId): Promise<GameSnapshot> {
        this.cancelResultTask();
        this.session.state = GameState.Loading;
        this.session.message = 'Loading level...';
        this.pendingFlyCount = 0;  // v1.5.5：重置飞行计数，避免 restart 时残留
        this.pendingGoldenTileId = null;
        this.updateHud();

        const [level, boosters, tileTypes] = await Promise.all([
            LevelRepository.loadLevel(levelId),
            ConfigRepository.loadBoosters(),
            ConfigRepository.loadTileTypes(),
        ]);

        this.currentTheme = resolveLevelTheme(level);
        this.audio.configure(this.currentTheme.audio);
        this.audio.playBgm();
        MatchEffect.configure(this.currentTheme.effects.match);
        this.comboFeedback?.configure(this.currentTheme.effects.combo);

        // 关卡所在章节解锁（首次进入即视为已解锁）
        if (level.chapterId) {
            ProgressRepository.unlockChapter(level.chapterId);
        }
        await this.applyLevelBackground(level, this.currentTheme);

        // 图案分布已在关卡 JSON 中按层级规则写好；运行时不再无约束随机重洗，避免破坏“单图案最多 6 个 / 分层控制难度”的策划分布。
        this.ensureFirstMatch(level);

        // v1.5.3：应用本关玩法机制（覆盖标记 / 金色标记），在 board.setup 之前完成
        this.applyLevelMechanicsBeforeBoard(level);

        this.session.start(level, boosters);
        // 埋点:关卡开始(生成 attempt_id/attempt_index,后续 result/restart/quit 复用)
        this.currentAttempt = Analytics.trackLevelStart(level.id, level.chapterId ?? null);
        this.result.hide();
        this.slot.configureTheme(
            this.currentTheme.tileBase,
            this.currentTheme.effects.mechanics,
            this.currentTheme.effects.hubShake,
        );
        // v1.5.3：配置收集槽容量 + 锁死最右
        this.slot.configureForLevel(
            level.slotCapacity ?? GAME_CONFIG.slotCapacity,
            level.mechanics?.slotLockRight ?? 0,
        );
        this.slot.reset();
        // v2.7：棋盘 tileSize 与传送带/落地道具 cellSize 互为依赖（带宽随 tileSize 变，
        //   棋盘可用宽度又要先扣除带宽预留才能算出 tileSize）。
        //   用主题 tileSizeMax 作保守上界估算预留——即便本关实际 tileSize 更小，
        //   预留只会偏大（棋盘略保守收缩），绝不会出现「预留不足导致重叠」；
        //   避免为了收敛精确值而二次调用 board.setup（会重复触发入场动画/震动）。
        const reserve = this.computeBandReserve(level, UI_LAYOUT.game.board.tileSizeMax);
        this.board.setBandReserve(reserve.left, reserve.right, reserve.top, reserve.bottom);
        this.board.setup(level, tileTypes, (tile) => this.handleTilePicked(tile.id), this.currentTheme);
        // v2.4 传送带：棋盘外独立条。tile 花色复用主题皮肤，点击后走 handleConveyorPick 入槽。
        this.setupConveyors(level, tileTypes);
        director.emit(EventKeys.LevelLoaded, level.id, this.currentTheme);
        this.syncSnapshot('Pick tiles and match three of a kind.');

        // v1.5.3：黑乌鸦机制（带动画飞入收集槽）—— 在 board 渲染之后运行
        const crowCount = level.mechanics?.crowSnatchCount ?? 0;
        if (crowCount > 0) {
            this.runCrowSnatch(crowCount);
        }
        return this.getSnapshot();
    }

    private ensureFirstMatch(level: LevelModel): void {
        const lvId = typeof level.id === 'number' ? level.id : Number(level.id ?? 0);
        if (!lvId || lvId < 4) return;

        const intTiles = level.tiles.filter(
            (tile) => Number.isInteger(tile.row) && Number.isInteger(tile.col),
        );
        if (intTiles.length < 3) return;

        const topByPos = new Map<string, typeof intTiles[number]>();
        intTiles.forEach((tile) => {
            const key = `${tile.row}|${tile.col}`;
            const current = topByPos.get(key);
            if (!current || tile.layer > current.layer) topByPos.set(key, tile);
        });
        const topTiles = Array.from(topByPos.values());
        if (topTiles.length < 3) return;

        const topKeyCount = new Map<string, number>();
        topTiles.forEach((tile) => {
            const key = getMatchKey(tile.type);
            topKeyCount.set(key, (topKeyCount.get(key) ?? 0) + 1);
        });
        for (const count of topKeyCount.values()) {
            if (count >= 3) return;
        }

        const anchors = topTiles.slice(0, 3);
        const anchorMatchKeys = new Set(anchors.map((tile) => getMatchKey(tile.type)));
        const typeCount = new Map<string, number>();
        intTiles.forEach((tile) => typeCount.set(tile.type, (typeCount.get(tile.type) ?? 0) + 1));

        let chosenType: string | null = null;
        for (const [type, count] of typeCount) {
            if (count >= 3 && !anchorMatchKeys.has(getMatchKey(type))) {
                chosenType = type;
                break;
            }
        }
        if (!chosenType) {
            for (const [type, count] of typeCount) {
                if (count >= 3 && !anchors.some((tile) => tile.type === type)) {
                    chosenType = type;
                    break;
                }
            }
        }
        if (!chosenType) return;

        const candidates = intTiles.filter(
            (tile) => tile.type === chosenType && !anchors.includes(tile),
        ).slice(0, 3);
        if (candidates.length < 3) return;

        for (let i = 0; i < 3; i += 1) {
            const oldType = anchors[i].type;
            anchors[i].type = chosenType;
            candidates[i].type = oldType;
        }
    }

    /**
     * v1.5.3：在 BoardManager.setup 之前给 level.tiles 注入机制：
     * - covered：v7.9 改为在「所有 tile」中随机标 N 张（不再限定最顶层）
     * - golden：随机选一张已有 tile，在其位置叠一层金色 tile
     */
    private applyLevelMechanicsBeforeBoard(level: LevelModel): void {
        const m = level.mechanics;
        if (!m) return;
        level.tiles.forEach((tile) => { tile.covered = false; tile.golden = false; });
        level.tiles = level.tiles.filter((tile) => !tile.id.startsWith('GOLDEN_'));

        const maxLayer = Math.max(...level.tiles.map((tile) => tile.layer));

        const coverCount = m.coverTileCount ?? 0;
        if (coverCount > 0) {
            // v7.9：从全部 tile 里随机抽 N 张做遮挡（之前仅 layer === maxLayer 的最顶层）
            //   被压在下层的 covered tile 会等到上层被消除才有机会被点击/揭开，
            //   形成「随机出现的遮挡 tile」体验。
            const picked = this.pickRandomTrue(level.tiles, coverCount);
            picked.forEach((tile) => { tile.covered = true; });
        }

        const goldenCount = m.goldenTileCount ?? 0;
        if (goldenCount > 0) {
            const candidates = level.tiles.filter((tile) => {
                if (tile.covered) return false;
                const goldenLayer = tile.layer + 1;
                return !level.tiles.some((other) => {
                    if (other.id === tile.id || other.covered || other.layer <= goldenLayer) return false;
                    return other.row === tile.row && other.col === tile.col;
                });
            });
            const targets = this.pickRandomTrue(candidates, goldenCount);
            let goldenMaxLayer = maxLayer;
            targets.forEach((target, idx) => {
                const goldenLayer = target.layer + 1;
                if (goldenLayer > goldenMaxLayer) goldenMaxLayer = goldenLayer;
                level.tiles.push({
                    id: `GOLDEN_${idx + 1}`,
                    type: 'golden',
                    row: target.row,
                    col: target.col,
                    layer: goldenLayer,
                    golden: true,
                    // v1.5.3：记下覆盖的目标 tile 类型，作为"首点 golden 无邻居"时的兜底全消目标
                    goldenTargetType: target.type,
                    goldenTargetId: target.id,
                });
            });
            if ((level.layers ?? 0) < goldenMaxLayer + 1) {
                level.layers = goldenMaxLayer + 1;
            }
        }

        // v2.4 摩天大楼：把每座塔展开成单格 0 层高堆叠的 tile（朝心 90% 遮挡）。
        // 这些 tile 是普通可消 tile，天然计入 clearAll / 三消匹配，无需额外结算逻辑。
        const skyscrapers = m.skyscrapers ?? [];
        if (skyscrapers.length > 0) {
            let towerMaxLayer = maxLayer;
            skyscrapers.forEach((tower) => {
                const types = tower.types ?? [];
                const count = tower.count ?? types.length;
                for (let l = 0; l < count; l += 1) {
                    if (l > towerMaxLayer) towerMaxLayer = l;
                    level.tiles.push({
                        id: `${tower.id}_L${String(l + 1).padStart(2, '0')}`,
                        type: types[l] ?? types[l % Math.max(1, types.length)] ?? 'apple',
                        row: tower.row,
                        col: tower.col,
                        layer: l,
                        layerStepCoef: 0.1,     // 90% 遮挡
                        stackTowardCenter: true,
                    });
                }
            });
            if ((level.layers ?? 0) < towerMaxLayer + 1) level.layers = towerMaxLayer + 1;
        }

        // v2.4 传送带：把带上 tile 标记 conveyorId，Board 渲染时跳过（改由 ConveyorManager 定位/渲染）。
        const conveyors = m.conveyors ?? [];
        conveyors.forEach((belt) => {
            (belt.types ?? []).forEach((type, i) => {
                level.tiles.push({
                    id: `${belt.id}_T${String(i + 1).padStart(3, '0')}`,
                    type,
                    row: -1, col: -1, layer: 0,   // 占位坐标，实际由传送带定位
                    conveyorId: belt.id,
                });
            });
        });
        // v2.6 落地道具：同理占位（由 DropChuteManager 定位/渲染，Board 跳过）。
        const chutes = m.dropChutes ?? [];
        chutes.forEach((chute) => {
            (chute.types ?? []).forEach((type, i) => {
                level.tiles.push({
                    id: `${chute.id}_T${String(i + 1).padStart(3, '0')}`,
                    type,
                    row: -1, col: -1, layer: 0,
                    conveyorId: chute.id,
                });
            });
        });
    }

    private pickRandomTrue<T>(arr: T[], n: number): T[] {
        const out: T[] = [];
        const copy = [...arr];
        for (let i = 0; i < n && copy.length > 0; i += 1) {
            const idx = Math.floor(Math.random() * copy.length);
            out.push(copy.splice(idx, 1)[0]);
        }
        return out;
    }

    /**
     * v2.7：根据本关传送带/落地道具配置计算侧边物理占位预留（像素）。
     * 竖版机制贴左/右侧（宽度 = cellSize + gap，多条按 index 叠加）；
     * 横版传送带贴顶/底（厚度同理）。用于 BoardManager.setBandReserve，
     * 保证棋盘 tile 计算尺寸时已扣除这块空间，物理上不会与侧边条重叠。
     */
    private computeBandReserve(level: LevelModel, tileSizeHint: number): { left: number; right: number; top: number; bottom: number } {
        const themeCfg = this.currentTheme?.effects?.mechanics?.conveyor;
        const cellSize = tileSizeHint || themeCfg?.cellSize || 96;
        const gap = themeCfg?.gap ?? 12;
        const inset = themeCfg?.leftInset ?? 18;
        const stride = cellSize + gap + 28; // 与 ConveyorManager/DropChuteManager 内多条叠加的 index 步长一致（取较大值兜底）
        const m = level.mechanics;
        const count = { left: 0, right: 0, top: 0, bottom: 0 };
        (m?.conveyors ?? []).forEach((cv) => {
            const horiz = cv.orientation === 'horizontal';
            const edge = horiz ? (cv.edge === 'bottom' ? 'bottom' : 'top') : (cv.edge === 'right' ? 'right' : 'left');
            count[edge] += 1;
        });
        (m?.dropChutes ?? []).forEach((dc) => {
            const edge = dc.edge === 'right' ? 'right' : 'left';
            count[edge] += 1;
        });
        const bandWidth = (n: number): number => (n <= 0 ? 0 : inset + n * stride);
        return {
            left: bandWidth(count.left),
            right: bandWidth(count.right),
            top: bandWidth(count.top),
            bottom: bandWidth(count.bottom),
        };
    }

    /**
     * v2.4 传送带装配。tile 花色复用主题皮肤（icon/matchKey），
     * 点击窗口内 tile → handleConveyorPick → 入槽（与普通三消同一套消除逻辑）。
     */
    private setupConveyors(level: LevelModel, tileTypes: import('../../data/models/TileModel').TileTypeConfig[]): void {
        const typeMap = new Map(tileTypes.map((t) => [t.id, t]));
        const resolveTile = (type: string, id: string): TileRuntimeModel => {
            const skin = this.currentTheme?.tileIcons?.[type];
            const cfg = typeMap.get(type);
            return {
                id, type, row: -1, col: -1, layer: 0, conveyorId: 'belt',
                icon: skin?.icon ?? cfg?.icon ?? type.slice(0, 2).toUpperCase(),
                iconAsset: skin?.iconAsset ?? cfg?.iconAsset,
                color: skin?.color ?? cfg?.color ?? '#607D8B',
                matchKey: skin?.matchKey ?? getMatchKey(type),
                layoutX: 0, layoutY: 0, clickable: true, selected: false, removed: false,
                covered: false, golden: false,
            };
        };
        // 传送带（持续转动，玩家点走的槎位永久留空不补；未点走的自然循环回队尾）—— v2.7：cellSize 与棋盘实际 tile 尺寸保持一致
        if (this.conveyor) {
            this.conveyor.configureTheme(this.currentTheme?.tileBase, this.currentTheme?.effects?.mechanics, this.board.getCurrentTileSize());
            this.conveyor.setup(level.mechanics?.conveyors ?? [], resolveTile, (tile, fromWorld) => this.handleConveyorPick(tile, fromWorld));
        }
        // 落地道具（极快掉落、框外计数、补位、不足长度压缩）—— v2.7：同上
        if (this.dropChute) {
            this.dropChute.configureTheme(this.currentTheme?.tileBase, this.currentTheme?.effects?.mechanics, this.board.getCurrentTileSize());
            this.dropChute.setup(level.mechanics?.dropChutes ?? [], resolveTile, (tile, fromWorld) => this.handleConveyorPick(tile, fromWorld));
        }
    }

    /**
     * v2.4 传送带 tile 被点击：直接飞入收集槽（tile 已从带子移除）。
     * 走 addTileEager + 飞行 + commitRender + 消除，与棋盘 tile 一致，
     * 但来源在带子上、不经过 board.collectTile。
     */
    private handleConveyorPick(tile: TileRuntimeModel, fromWorld: Vec3): void {
        if (this.session.state !== GameState.Playing) return;
        const targetIndex = this.slot.getCount() + this.pendingFlyCount;
        const slotWorldPos = this.slot.getSlotWorldPosition(targetIndex);
        const slotResult = this.slot.addTileEager(tile);
        this.slot.markFlying(tile.id);
        this.pendingFlyCount += 1;

        // 临时飞行节点（带子 tile 节点已销毁，这里新建一个从 fromWorld 飞到槽）
        const size = this.currentTheme?.effects?.mechanics?.conveyor?.cellSize ?? 90;
        const flyNode = createNode(this.effectLayer, `CFly_${tile.id}`, 0, 0, size, size);
        flyNode.setWorldPosition(fromWorld);
        flyNode.setSiblingIndex(9999);
        const baseNode = createNode(flyNode, 'Base', 0, 0, size, size);
        const baseSprite = baseNode.addComponent(Sprite);
        baseSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        if (this.currentTheme?.tileBase) loadSpriteFrameFromResources(this.currentTheme.tileBase, (f) => { if (f && baseSprite.isValid) baseSprite.spriteFrame = f; });
        const iconSize = Math.round(size * 0.72);
        const iconNode = createNode(flyNode, 'Icon', 0, 0, iconSize, iconSize);
        if (tile.iconAsset) {
            const iconSprite = iconNode.addComponent(Sprite);
            iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            loadSpriteFrameFromResources(tile.iconAsset, (f) => { if (f && iconSprite.isValid) iconSprite.spriteFrame = f; });
        } else {
            createLabel(iconNode, 'IconText', tile.icon ?? '?', 0, 0, Math.round(iconSize * 0.7), colorFromHex('#333'), iconSize, iconSize);
        }

        tween(flyNode)
            .to(0.24, { worldPosition: slotWorldPos }, { easing: 'quadInOut' })
            .call(() => {
                if (flyNode.isValid) flyNode.destroy();
                this.pendingFlyCount = Math.max(0, this.pendingFlyCount - 1);
                if (this.session.state !== GameState.Playing) return;
                this.slot.clearFlying(tile.id);
                this.slot.commitRender();
                if (slotResult.matched) {
                    this.playSlotMatchSequence(slotResult, 0.9, `Matched ${tile.icon}.`);
                    director.emit(EventKeys.TileMatched, slotResult.matchedTileIds);
                    this.board.markMatched(slotResult.matchedTileIds);
                    this.applyHubShake(slotResult);
                    this.finishOrSyncAfterSlotChange(`Matched ${tile.icon}.`);
                } else {
                    this.finishOrSyncAfterSlotChange(`Conveyor ${tile.icon}.`, slotResult.full);
                }
            })
            .start();
    }

    /** v1.5.3：黑乌鸦动画 —— 从主铺层随机抽 N 张飞到收集槽 */
    private runCrowSnatch(count: number): void {
        const targets = this.board.pickBottomTilesForCrow(count);
        if (targets.length === 0) return;
        const slotPos = this.slot?.node?.getWorldPosition?.();
        const crowCfg = this.currentTheme?.effects?.mechanics?.crow;
        targets.forEach((tile, idx) => {
            const fromPos = this.board.getTileWorldPosition(tile.id);
            if (!fromPos) return;
            const size = crowCfg?.size ?? 90;
            const flyNode = createNode(this.node, `Crow_${tile.id}`, fromPos.x, fromPos.y, size, size);
            flyNode.setSiblingIndex(999);
            if (crowCfg?.enabled !== false) {
                // 底座
                const baseNode = createNode(flyNode, 'Base', 0, 0, size, size);
                const baseSprite = baseNode.addComponent(Sprite);
                baseSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                const tileBase = this.currentTheme?.tileBase;
                if (tileBase) {
                    loadSpriteFrameFromResources(tileBase, (frame) => {
                        if (frame && baseSprite?.isValid) baseSprite.spriteFrame = frame;
                    });
                }
                // 图标：直接显示被抓 tile 的图标（替代原来的 🐦 emoji）
                const iconSize = Math.round(size * 0.82);
                const iconNode = createNode(flyNode, 'Icon', 0, 0, iconSize, iconSize);
                const iconSprite = iconNode.addComponent(Sprite);
                iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                if (tile.iconAsset) {
                    loadSpriteFrameFromResources(tile.iconAsset, (frame) => {
                        if (frame && iconSprite?.isValid) iconSprite.spriteFrame = frame;
                    });
                }
            }

            const slotX = slotPos ? slotPos.x : 0;
            const slotY = slotPos ? slotPos.y : 650;
            setTimeout(() => {
                tween(flyNode)
                    .to((crowCfg?.flyDurationBase ?? 0.6) + idx * (crowCfg?.flyDurationStep ?? 0.05), { worldPosition: new Vec3(slotX, slotY, 0) })
                    .call(() => {
                        const snatched = this.board.forceSnatchTile(tile.id);
                        if (snatched) {
                            const slotResult = this.slot.addTile(snatched);
                            if (slotResult.matched) {
                                this.playSlotMatchSequence(slotResult, 0.85, `Matched ${snatched.icon}.`);
                                this.board.markMatched(slotResult.matchedTileIds);
                            }
                            this.session.slotTileIds = this.slot.getTileIds();
                            this.session.remainingTiles = this.board.getRemainingCount();
                            if (!slotResult.matched) this.syncSnapshot(`Crow stole ${snatched.icon}.`);
                        }
                        if (flyNode.isValid) flyNode.destroy();
                    })
                    .start();
            }, (crowCfg?.delayBaseMs ?? 200) + idx * (crowCfg?.delayStepMs ?? 120));
        });
    }

    async restartLevel(source: 'fail_popup' | 'pause' | 'unknown' = 'fail_popup'): Promise<GameSnapshot> {
        // 埋点:重开(重开前上报当前 duration/moves)
        Analytics.trackLevelRestart(this.currentAttempt, this.session.moves, source);
        this.audio?.play('shuffle', 0.9);
        const levelId = this.session.level?.id ?? GAME_CONFIG.defaultLevelId;
        return this.startLevel(levelId);
    }

    backToHome(reason: string = 'unknown'): GameSnapshot {
        console.warn('[LevelFlowController] backToHome called, reason:', reason);
        console.trace('[LevelFlowController] backToHome stack');
        // 埋点:局内退出(仅当关卡未结算时上报;已 win/fail 的尝试不重复报 quit)
        if (this.session.state === GameState.Playing || this.session.state === GameState.Loading) {
            const quitSource = reason.startsWith('FailPopup') || reason.startsWith('SuccessPopup')
                ? 'home_button'
                : 'back_button';
            Analytics.trackLevelQuit(this.currentAttempt, this.session.moves, quitSource);
        }
        this.currentAttempt = null;
        this.session.state = GameState.Home;
        this.syncSnapshot('Back to home');
        // v1.5：若外层 AppFlow 接管，转交它做场景切换；否则保持内置逻辑（向后兼容）
        if (this.onReturnHome) {
            this.onReturnHome();
        }
        return this.getSnapshot();
    }

    /**
     * AppFlowController 回首页/退后台时调用:若本关未结算,补报 level_quit 并结束会话。
     * @param quitSource 退出来源:回首页=home_button,退后台=app_background
     * 返回是否存在活跃对局(供上层决定是否切会话)。
     */
    notifyReturnHome(quitSource: 'home_button' | 'app_background' = 'home_button'): boolean {
        const hasActive = this.session.state === GameState.Playing || this.session.state === GameState.Loading;
        if (hasActive) {
            Analytics.trackLevelQuit(this.currentAttempt, this.session.moves, quitSource);
        }
        this.currentAttempt = null;
        return hasActive;
    }

    selectTile(tileId: TileId): TileSelectionResult {
        if (this.session.state !== GameState.Playing) {
            return this.rejectTile(tileId, 'Game is not playing');
        }
        return this.handleTilePicked(tileId);
    }

    useBooster(type: BoosterType): BoosterUseResult {
        if (this.session.state !== GameState.Playing) {
            return { success: false, type, message: 'Game is not playing' };
        }
        if (!this.session.isBoosterUnlocked(type)) {
            this.syncSnapshot(`${type} is locked in this level.`);
            return { success: false, type, message: this.session.message };
        }

        if (!this.session.consumeBooster(type)) {
            this.syncSnapshot(`No ${type} boosters left.`);
            return { success: false, type, message: this.session.message };
        }
        this.updateHud();

        if (type === 'hint') {
            return this.useHintClear3();
        }

        if (type === 'shuffle') {
            this.audio.play('shuffle', 0.9);
            this.board.shuffleRemaining();
            this.syncSnapshot('Board shuffled.');
            return { success: true, type, message: this.session.message };
        }

        const restored = this.slot.undoLast();
        if (!restored) {
            this.refundBooster(type);
            this.syncSnapshot('Nothing to undo.');
            return { success: false, type, message: this.session.message };
        }
        this.audio.play('undo', 0.9);
        this.board.restoreTile(restored.id);
        this.syncSnapshot('Last tile returned.');
        return { success: true, type, message: this.session.message };
    }

    private refundBooster(type: BoosterType): void {
        this.session.refundBooster(type);
    }

    /**
     * Hint 道具改为 Clear3：取托盘最左 1 个 tile 的 matchKey，凑齐 3 个同 matchKey 消除。
     * 优先从托盘拿，不够从棋盘补；凑不够 3 个则退款失败。
     */
    private useHintClear3(): BoosterUseResult {
        const type: BoosterType = 'hint';

        if (this.slot.getCount() < 1) {
            this.refundBooster(type);
            this.syncSnapshot('Tray is empty.');
            return { success: false, type, message: this.session.message };
        }

        const leftmostId = this.slot.getTileIds()[0];
        const leftmostTile = this.slot.getTileById(leftmostId);
        if (!leftmostTile) {
            this.refundBooster(type);
            this.syncSnapshot('Tray error.');
            return { success: false, type, message: this.session.message };
        }
        const targetMatchKey = leftmostTile.matchKey;
        const need = 3;

        const allSlotTiles = this.slot.getTileIds()
            .map((id) => this.slot.getTileById(id))
            .filter(Boolean) as TileRuntimeModel[];
        const slotKillIds: TileId[] = allSlotTiles
            .filter((tile) => tile.matchKey === targetMatchKey)
            .slice(0, need)
            .map((tile) => tile.id);

        const needFromBoard = need - slotKillIds.length;
        const boardKillIds = needFromBoard > 0
            ? this.board.pickBoardTilesByMatchKey(targetMatchKey, needFromBoard)
            : [];

        if (slotKillIds.length + boardKillIds.length < need) {
            this.refundBooster(type);
            this.syncSnapshot(`Not enough ${targetMatchKey} tiles.`);
            return { success: false, type, message: this.session.message };
        }

        const slotKillSet = new Set(slotKillIds);
        this.slot.removeTilesByPredicate((tile) => slotKillSet.has(tile.id));
        if (boardKillIds.length > 0) {
            this.board.forceRemoveTiles(boardKillIds);
        }

        this.audio.play('hint', 0.9);
        this.session.slotTileIds = this.slot.getTileIds();
        this.session.remainingTiles = this.board.getRemainingCount();
        this.finishOrSyncAfterSlotChange('Clear 3 used.');
        return { success: true, type, message: this.session.message };
    }

    finishLevel(win: boolean): GameSnapshot {
        if (this.session.state !== GameState.Playing || this.resultTask) return this.getSnapshot();
        if (!win) {
            this.completeLevel(false);
            return this.getSnapshot();
        }
        const delay = this.comboFeedback?.prepareComboVoiceForResult(MAX_RESULT_COMBO_VOICE_WAIT_SEC) ?? 0;
        if (delay <= 0.05) {
            this.completeLevel(true);
            return this.getSnapshot();
        }
        this.resultTask = () => {
            this.resultTask = null;
            if (!this.node.activeInHierarchy || this.session.state !== GameState.Playing) return;
            this.completeLevel(true);
        };
        this.scheduleOnce(this.resultTask, Math.min(MAX_RESULT_COMBO_VOICE_WAIT_SEC, delay) + 0.05);
        return this.getSnapshot();
    }

    private completeLevel(win: boolean): void {
        this.cancelResultTask();
        this.session.setResult(win);
        // 埋点:关卡结果(win/fail 合并一个事件;fail_reason=slot_full 由槽满触发)
        const failReason = win ? '' : (this.session.state === GameState.Lose ? 'slot_full' : 'unknown');
        Analytics.trackLevelResult(this.currentAttempt, win, this.session.moves, failReason);
        this.currentAttempt = null;
        this.syncSnapshot(win ? 'Level cleared.' : 'Tray is full.');
        director.emit(win ? EventKeys.LevelWin : EventKeys.LevelLose, this.session.level?.id ?? null);

        // 隐藏所有棋盘砖块（含飞行中置顶节点），防止穿透弹窗遮罩
        this.board.hideAllTiles();

        const currentLevelId = this.session.level?.id ?? GAME_CONFIG.defaultLevelId;
        if (win) {
            void this.showWinResult(currentLevelId);
        } else {
            this.audio.play('fail', 0.85);
            this.result.show(false, {
                onNext: () => { void this.advanceAfterWin(); },
                onRetry: () => { void this.restartLevel(); },
                onHome: () => this.backToHome('FailPopup.SuccessHomeButton'),
                onRevive: () => this.reviveAndContinue(),
            });
        }
    }

    private cancelResultTask(): void {
        if (!this.resultTask) return;
        this.unschedule(this.resultTask);
        this.resultTask = null;
    }

    private async showWinResult(currentLevelId: LevelId): Promise<void> {
        const beadReward = await BeadProgressService.claimLevelReward(currentLevelId);
        if (!this.node.isValid) return;
        if (!beadReward) {
            console.warn('[showWinResult] claimLevelReward returned null for level', currentLevelId);
        } else {
            console.log('[showWinResult] beadReward OK for level', currentLevelId, 'puzzle:', beadReward.puzzle.id, 'prev:', beadReward.previousCellCount, 'completed:', beadReward.completedCellCount);
        }
        this.audio.play('win', 0.85);
        this.result.show(true, {
            onNext: () => {
                console.log('[LevelFlowController] onNext invoked (advanceAfterWin trigger)');
                void this.advanceAfterWin();
            },
            onRetry: () => { void this.restartLevel(); },
            onHome: () => this.backToHome('SuccessPopup.SuccessHomeButton'),
            onRevive: () => this.reviveAndContinue(),
            winData: {
                levelId: currentLevelId,
                nextLevelId: currentLevelId + 1,
                chestProgress: 12,
                chestTarget: 16,
                backgroundPath: this.currentTheme?.background ?? this.session.level?.background,
                beadReward,
            },
        });
    }

    /** 复活：恢复 hub 最右 5 张回棋盘原位，并洗剩余棋盘。 */
    private reviveAndContinue(): GameSnapshot {
        const hubTileIds = this.slot.getTileIds();
        const restoreCount = Math.min(5, hubTileIds.length);
        const idsToRestore = hubTileIds.slice(-restoreCount);

        if (idsToRestore.length > 0) {
            const idSet = new Set(idsToRestore);
            this.slot.removeTilesByPredicate((tile) => idSet.has(tile.id));
        }

        idsToRestore.forEach((id) => this.board.restoreTile(id));
        this.audio.play('shuffle', 0.9);
        this.board.shuffleRemaining();
        this.pendingGoldenTileId = null;
        this.session.state = GameState.Playing;
        this.session.message = 'Revived';
        this.result.hide();
        this.syncSnapshot(`Revived: ${idsToRestore.length} tile${idsToRestore.length === 1 ? '' : 's'} returned, board reshuffled.`);
        return this.getSnapshot();
    }

    /** 通关后直接进入下一关；章节起始关交给 AppFlow 展示 *_start 起始页。 */
    private async advanceAfterWin(): Promise<void> {
        const currentLevel = this.session.level;
        if (!currentLevel) {
            this.backToHome('advanceAfterWin: no currentLevel in session');
            return;
        }

        const nextLevelId = currentLevel.id + 1;
        const chapterTransition = await ChapterRepository.detectChapterTransition(currentLevel.id);
        if (chapterTransition) {
            this.session.state = GameState.ChapterTransition;
            director.emit(EventKeys.ChapterTransitionStart, {
                fromChapter: chapterTransition.from,
                toChapter: chapterTransition.to,
                triggerLevelId: currentLevel.id,
            });
            ProgressRepository.unlockChapter(chapterTransition.to.id);
            director.emit(EventKeys.ChapterUnlocked, chapterTransition.to.id);
            director.emit(EventKeys.ChapterTransitionEnd, {
                fromChapter: chapterTransition.from,
                toChapter: chapterTransition.to,
                triggerLevelId: currentLevel.id,
            });
        }

        this.result.hide();
        if (this.onOpenChapterStart && await MetaChapterRepository.isSubchapterStartLevel(nextLevelId)) {
            this.onOpenChapterStart(nextLevelId);
            return;
        }

        try {
            await LevelRepository.loadLevel(nextLevelId);
            await this.startLevel(nextLevelId);
        } catch (error) {
            console.error('[LevelFlowController] advanceAfterWin: failed to load next level', nextLevelId, error);
            this.backToHome('advanceAfterWin: loadLevel/startLevel threw (see error above)');
        }
    }

    private isChapterStartLevel(levelId: LevelId): boolean {
        return levelId === 1 || levelId === 5 || levelId === 10 || levelId === 15;
    }

    private isChapterEndLevel(levelId: LevelId): boolean {
        return levelId === 4 || levelId === 9 || levelId === 14 || levelId === 20;
    }

    private buildRuntimeView(): void {
        if (this.hasEditableLayout()) {
            this.bindEditableRuntimeView();
            return;
        }
        this.node.removeAllChildren();
        this.audio = new AudioFeedback(this.node);
        ScreenAdapter.applyFullscreen(this.node);
        this.fitDesignToCanvas();
        this.drawGameBackground();

        const layout = UI_LAYOUT.game;
        const contentWidth = ScreenAdapter.contentWidth(layout.content.horizontalPadding, layout.content.maxWidth, layout.content.minWidth);
        const SLOT_Y = layout.slot.y;
        const SLOT_H = layout.slot.height;
        const slotNode = createNode(this.node, 'Slot', 0, SLOT_Y, contentWidth, SLOT_H);
        slotNode.setSiblingIndex(10);
        this.slot = slotNode.addComponent(SlotManager);
        this.slot.configureLayout(contentWidth, SLOT_H);

        const BOARD_Y = layout.board.y;
        const boardNode = createNode(this.node, 'Board', 0, BOARD_Y, contentWidth, layout.board.height);
        boardNode.setSiblingIndex(20);
        this.board = boardNode.addComponent(BoardManager);
        this.board.setAvailableWidth(contentWidth);
        // BoardManager 内部坐标系以 Board 节点为原点。
        const BOARD_GAP = layout.board.verticalGap;
        const SLOT_VISUAL_BOTTOM = SLOT_Y - SLOT_H / 2 - BOARD_GAP;
        const BOOSTER_VISUAL_TOP = ScreenAdapter.bottomY(UI_LAYOUT.hud.boosters.bottomInset)
            + UI_LAYOUT.hud.boosters.buttonSize * UI_LAYOUT.hud.boosters.scale / 2
            + BOARD_GAP;
        const SAFETY_GAP = layout.board.safetyGap;
        this.board.setSafeArea(
            SLOT_VISUAL_BOTTOM - BOARD_Y - SAFETY_GAP,
            BOOSTER_VISUAL_TOP - BOARD_Y + SAFETY_GAP,
        );
        this.bindCanvasPointerFallback();

        // v2.4 传送带层（棋盘外独立条，置于棋盘之上、HUD 之下）
        const conveyorNode = createNode(this.node, 'Conveyor', 0, 0, contentWidth, layout.board.height);
        conveyorNode.setSiblingIndex(25);
        this.conveyor = conveyorNode.addComponent(ConveyorManager);
        // 竖直胶囊轨道：占棋盘可用竖直区间（slot 底 → booster 顶），贴左侧列
        this.conveyor?.configureLayout(SLOT_VISUAL_BOTTOM, BOOSTER_VISUAL_TOP, contentWidth);

        const dropNode = createNode(this.node, 'DropChute', 0, 0, contentWidth, layout.board.height);
        dropNode.setSiblingIndex(26);
        this.dropChute = dropNode.addComponent(DropChuteManager);
        this.dropChute?.configureLayout(SLOT_VISUAL_BOTTOM, BOOSTER_VISUAL_TOP, contentWidth);

        const hudNode = createNode(this.node, 'HUD', 0, 0);
        hudNode.setSiblingIndex(30);
        this.hud = hudNode.addComponent(HudView);
        this.hud.bind({
            onBack: () => this.backToHome('HUD back button'),
            onRestart: () => { void this.restartLevel('pause'); },
            onTileDebugSelect: (tileId) => this.selectTile(tileId),
            onBooster: (type) => this.useBooster(type),
            onGotoLevel: (levelId) => { void this.startLevel(Math.max(1, levelId)); },
            onSetting: () => director.emit(EventKeys.AppOpenSettings),
        });

        const resultNode = ScreenAdapter.createFullscreenNode(this.node, 'Result');
        resultNode.setSiblingIndex(60);
        this.result = resultNode.addComponent(ResultView);
        this.result.hide();

        // 顶层特效层（碎片爆裂 + Combo 文字 + 序列帧动画）
        const effectLayer = ScreenAdapter.createFullscreenNode(this.node, 'EffectLayer');
        effectLayer.setSiblingIndex(40);
        this.effectLayer = effectLayer;

        // ComboFeedback 监听 EventKeys.TileMatched 自动弹文字
        this.comboFeedback = effectLayer.addComponent(ComboFeedback);
        // 预加载碎片图（异步，第一次三消时基本已就绪）
        MatchEffect.preload();
    }

    private hasEditableLayout(): boolean {
        return !!this.node.getChildByName('ChapterBackground')
            && !!this.node.getChildByName('Slot')
            && !!this.node.getChildByName('Board')
            && !!this.node.getChildByName('HUD');
    }

    private getOrCreateChild(name: string): Node {
        return this.node.getChildByName(name) ?? createNode(this.node, name, 0, 0);
    }

    private getNodeSize(node: Node, fallbackWidth: number, fallbackHeight: number): { width: number; height: number } {
        const transform = node.getComponent(UITransform);
        return {
            width: transform?.contentSize.width ?? fallbackWidth,
            height: transform?.contentSize.height ?? fallbackHeight,
        };
    }

    private getEditableLayoutScale(slotWidth: number): number {
        const safeWidth = ScreenAdapter.metrics().safeWidth;
        const horizontalPadding = UI_LAYOUT.game.board.editableSidePadding ?? 12;
        const targetWidth = Math.max(1, safeWidth - horizontalPadding * 2);
        return Math.min(1, targetWidth / Math.max(1, slotWidth));
    }

    private applyEditableLayoutScale(): number {
        const slotNode = this.node.getChildByName('Slot');
        if (!slotNode) return 1;
        const slotSize = this.getNodeSize(slotNode, ScreenAdapter.contentWidth(UI_LAYOUT.game.content.horizontalPadding, UI_LAYOUT.game.content.maxWidth, UI_LAYOUT.game.content.minWidth), UI_LAYOUT.game.slot.height);
        const scale = this.getEditableLayoutScale(slotSize.width);
        ['Slot', 'Board', 'Conveyor', 'DropChute'].forEach((name) => {
            const node = this.node.getChildByName(name);
            node?.setScale(scale, scale, 1);
        });
        const boardNode = this.node.getChildByName('Board');
        if (this.board && boardNode) {
            this.board.setAvailableWidth(slotSize.width);
            this.board.setWidthRatioOverride(1);
            const boardY = boardNode.position.y;
            const slotBottom = slotNode.position.y - slotSize.height * scale / 2 - UI_LAYOUT.game.board.verticalGap;
            const boosterTop = this.computeEditableBoosterTop() + UI_LAYOUT.game.board.verticalGap;
            this.board.setSafeArea(
                (slotBottom - boardY - UI_LAYOUT.game.board.safetyGap) / scale,
                (boosterTop - boardY + UI_LAYOUT.game.board.safetyGap) / scale,
            );
        }
        return scale;
    }

    private bindEditableRuntimeView(): void {
        this.audio = new AudioFeedback(this.node);
        this.fitDesignToCanvas();

        const bgNode = this.getOrCreateChild('ChapterBackground');
        bgNode.setSiblingIndex(1);
        this.applyGameBackgroundCover(bgNode);
        const bgSprite = bgNode.getComponent(Sprite) ?? bgNode.addComponent(Sprite);
        bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.bgSprite = bgSprite;
        this.loadBackgroundSpriteByPath('newtheme/bg/chapter1/1');

        const slotNode = this.getOrCreateChild('Slot');
        slotNode.setSiblingIndex(10);
        const slotSize = this.getNodeSize(slotNode, ScreenAdapter.contentWidth(UI_LAYOUT.game.content.horizontalPadding, UI_LAYOUT.game.content.maxWidth, UI_LAYOUT.game.content.minWidth), UI_LAYOUT.game.slot.height);

        const boardNode = this.getOrCreateChild('Board');
        boardNode.setSiblingIndex(20);
        const editableScale = this.applyEditableLayoutScale();
        this.slot = slotNode.getComponent(SlotManager) ?? slotNode.addComponent(SlotManager);
        this.slot.configureLayout(slotSize.width, slotSize.height);

        this.board = boardNode.getComponent(BoardManager) ?? boardNode.addComponent(BoardManager);
        this.board.setAvailableWidth(slotSize.width);
        this.board.setWidthRatioOverride(1);
        const boardY = boardNode.position.y;
        const slotBottom = slotNode.position.y - slotSize.height * editableScale / 2 - UI_LAYOUT.game.board.verticalGap;
        const boosterTop = this.computeEditableBoosterTop() + UI_LAYOUT.game.board.verticalGap;
        this.board.setSafeArea(
            (slotBottom - boardY - UI_LAYOUT.game.board.safetyGap) / editableScale,
            (boosterTop - boardY + UI_LAYOUT.game.board.safetyGap) / editableScale,
        );
        this.bindCanvasPointerFallback();

        // v2.4 传送带层（编辑器手摆布局分支也要挂，否则场景走这条时传送带不显示）
        const conveyorNode = this.node.getChildByName('Conveyor') ?? createNode(this.node, 'Conveyor', 0, 0, slotSize.width, UI_LAYOUT.game.board.height);
        conveyorNode.setSiblingIndex(25);
        conveyorNode.setScale(editableScale, editableScale, 1);
        this.conveyor = conveyorNode.getComponent(ConveyorManager) ?? conveyorNode.addComponent(ConveyorManager);
        this.conveyor?.configureLayout(slotBottom, boosterTop, slotSize.width);

        const dropNode = this.node.getChildByName('DropChute') ?? createNode(this.node, 'DropChute', 0, 0, slotSize.width, UI_LAYOUT.game.board.height);
        dropNode.setSiblingIndex(26);
        dropNode.setScale(editableScale, editableScale, 1);
        this.dropChute = dropNode.getComponent(DropChuteManager) ?? dropNode.addComponent(DropChuteManager);
        this.dropChute?.configureLayout(slotBottom, boosterTop, slotSize.width);

        const hudNode = this.getOrCreateChild('HUD');
        hudNode.setSiblingIndex(30);
        this.hud = hudNode.getComponent(HudView) ?? hudNode.addComponent(HudView);
        this.hud.bind({
            onBack: () => this.backToHome('HUD back button'),
            onRestart: () => { void this.restartLevel('pause'); },
            onTileDebugSelect: (tileId) => this.selectTile(tileId),
            onBooster: (type) => this.useBooster(type),
            onGotoLevel: (levelId) => { void this.startLevel(Math.max(1, levelId)); },
            onSetting: () => director.emit(EventKeys.AppOpenSettings),
        });

        const resultNode = this.node.getChildByName('Result') ?? ScreenAdapter.createFullscreenNode(this.node, 'Result');
        resultNode.setSiblingIndex(60);
        this.result = resultNode.getComponent(ResultView) ?? resultNode.addComponent(ResultView);
        this.result.hide();

        const effectLayer = this.node.getChildByName('EffectLayer') ?? ScreenAdapter.createFullscreenNode(this.node, 'EffectLayer');
        effectLayer.setSiblingIndex(40);
        this.effectLayer = effectLayer;

        this.comboFeedback = effectLayer.getComponent(ComboFeedback) ?? effectLayer.addComponent(ComboFeedback);
        MatchEffect.preload();
    }

    private computeEditableBoosterTop(): number {
        const hud = this.node.getChildByName('HUD');
        const names = ['undoButton', 'hintButton', 'shuffleButton'];
        const tops = names.map((name) => {
            const button = hud?.getChildByName(name);
            const transform = button?.getComponent(UITransform);
            if (!button || !transform) return ScreenAdapter.bottomY(UI_LAYOUT.hud.boosters.bottomInset) + UI_LAYOUT.hud.boosters.buttonSize * UI_LAYOUT.hud.boosters.scale / 2;
            return button.position.y + transform.contentSize.height * button.scale.y / 2;
        });
        return Math.max(...tops);
    }

    private fitDesignToCanvas(): void {
        // Canvas 已经按 ResolutionPolicy.SHOW_ALL 把当前设计区自适应到 viewport，业务根节点保持 1:1。
        this.node.setScale(1, 1, 1);
    }

    private bgSprite: Sprite | null = null;

    private getGameBackgroundCoverSize(): { width: number; height: number } {
        const size = ScreenAdapter.fullSize();
        const aspect = GAME_BACKGROUND_SOURCE_WIDTH / GAME_BACKGROUND_SOURCE_HEIGHT;
        return {
            width: Math.max(size.width, size.height * aspect),
            height: Math.max(size.height, size.width / aspect),
        };
    }

    private applyGameBackgroundCover(node: Node): void {
        const cover = this.getGameBackgroundCoverSize();
        const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
        transform.setContentSize(cover.width, cover.height);
        node.setPosition(0, 0, 0);
    }

    private drawGameBackground(): void {
        const size = ScreenAdapter.fullSize();
        const fallback = createNode(this.node, 'SkyFallback', 0, 0, size.width, size.height);
        fallback.setSiblingIndex(0);
        drawRect(fallback, size.width, size.height, colorFromHex('#86C9F8'), undefined, 0, 0);

        const bgNode = createNode(this.node, 'ChapterBackground', 0, 0, 1, 1);
        bgNode.setSiblingIndex(1);
        this.applyGameBackgroundCover(bgNode);
        const sprite = bgNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.bgSprite = sprite;
        // 默认背景：先用 chapter1 兜底，章节加载后再替换
        this.loadBackgroundSpriteByPath('newtheme/bg/chapter1/1');
    }

    /**
     * v3：按关卡级 background 加载背景，回退到章节默认，再回退到 chapter1。
     */
    private async applyLevelBackground(level: { background?: string; chapterId?: string }, theme?: ResolvedLevelTheme): Promise<void> {
        if (!this.bgSprite) return;
        if (theme?.background) {
            this.loadBackgroundSpriteByPath(theme.background, 'newtheme/bg/chapter1/1');
            return;
        }
        if (level.background) {
            this.loadBackgroundSpriteByPath(level.background, 'newtheme/bg/chapter1/1');
            return;
        }
        await this.applyChapterBackground(level.chapterId);
    }

    /**
     * 按当前关卡所属章节加载背景。chapterId 为空时回退到 chapter1 默认图。
     */
    private async applyChapterBackground(chapterId?: string): Promise<void> {
        if (!this.bgSprite) return;
        if (!chapterId) {
            this.loadBackgroundSpriteByPath('newtheme/bg/chapter1/1');
            return;
        }
        const chapter = await ChapterRepository.findById(chapterId);
        if (!chapter) {
            this.loadBackgroundSpriteByPath('newtheme/bg/chapter1/1');
            return;
        }
        this.loadBackgroundSpriteByPath(chapter.backgroundImage, 'newtheme/bg/chapter1/1');
    }

    private loadBackgroundSpriteByPath(primaryPath: string, fallbackPath?: string): void {
        if (!this.bgSprite) return;
        const sprite = this.bgSprite;
        sprite.spriteFrame = null;
        loadSpriteFrameFromResources(primaryPath, (frame) => {
            if (frame) { sprite.spriteFrame = frame; return; }
            if (!fallbackPath) {
                loadSpriteFrameFromResources('newtheme/bg/chapter1/1', (fb) => {
                    if (fb) sprite.spriteFrame = fb;
                });
                return;
            }
            loadSpriteFrameFromResources(fallbackPath, (fb) => {
                if (fb) sprite.spriteFrame = fb;
                else {
                    loadSpriteFrameFromResources('newtheme/bg/chapter1/1', (fb2) => {
                        if (fb2) sprite.spriteFrame = fb2;
                    });
                }
            });
        });
    }

    private bindCanvasPointerFallback(): void {
        // v1.5.5：去掉全局 input.on(TOUCH_END) 监听。
        // TileActor.setup 已经在每个 tile 节点上注册了 node.on(TOUCH_END)，
        // 双重监听会导致快速点击时事件触发两次，造成 tile 状态混乱"丢失"。
        // 节点级监听天然只命中 tile 范围内的点击，且跨平台通用（H5/微信小游戏/Native 都支持）。
    }

    private onTouchEnd(_event: EventTouch): void {
        // 已废弃：保留 stub 避免 onDestroy 引用报错
    }

    onDestroy(): void {
        // v1.5.5：input.on 已不再注册，此处仅保留作为接口完整性
    }

    private resolveGoldenWithHubCounts(goldenId: TileId, fallbackMessage: string): boolean {
        const hubIds = this.slot.getTileIds();
        const hubMatchKeys = this.slot.getCurrentMatchKeys();
        const hubKeyCount = new Map<string, number>();
        hubIds.forEach((id, index) => {
            if (id === goldenId) return;
            const key = hubMatchKeys[index];
            hubKeyCount.set(key, (hubKeyCount.get(key) ?? 0) + 1);
        });

        const result = this.board.findGoldenClearTargets(goldenId, hubKeyCount);
        if (!result) {
            this.slot.removeTilesByPredicate((slotTile) => slotTile.id === goldenId);
            this.board.forceRemoveTiles([goldenId]);
            this.syncSnapshot(fallbackMessage);
            return false;
        }

        const { boardIds, targetMatchKey } = result;
        const hubMatchIds: TileId[] = [];
        hubIds.forEach((id, index) => {
            if (id === goldenId) return;
            if (hubMatchKeys[index] === targetMatchKey) hubMatchIds.push(id);
        });

        if (boardIds.length > 0) this.board.forceRemoveTiles(boardIds);
        this.slot.removeTilesByPredicate((slotTile) =>
            slotTile.id === goldenId || hubMatchIds.includes(slotTile.id),
        );
        this.board.forceRemoveTiles([goldenId, ...hubMatchIds]);
        this.audio.play('match', 1.0);
        this.playMatchEffect([this.slot.getSlotWorldPosition(Math.max(0, this.slot.getCount()))]);
        this.syncSnapshot('Golden cleared 3 tiles (fallback).');
        return true;
    }

    /**
     * 处理玩家点击 tile：同步消除模型（main v1.5.0 流程）
     * collectTile 内部已 playPickFeedback（缩到 0.18 隐藏），
     * 然后立刻 addTile 落槽 → 三消判定 → 瀑布特效。
     *
     * 注：飞入贝塞尔动效（同事 v6.3 的 playFlyToSlot）暂未引入，
     * 因为它需要 collectTile 不立即隐藏 selected tile，与 main 版 cover 机制冲突。
     * 等以后再做配合层改造，目前这版只引入"瀑布特效 + 成功/失败弹窗"。
     */
    private handleTilePicked(tileId: TileId): TileSelectionResult {
        // 死亡/胜利后立即拦截
        if (this.session.state !== GameState.Playing) {
            return this.rejectTile(tileId, 'Game is not playing');
        }
        // v1.5.3：covered tile 点击时先揭开，再按同一次点击进槽（同事 D 方案）
        if (this.board.isCovered(tileId)) {
            this.board.revealCoveredTile(tileId);
        }

        // v1.5.3：golden tile 点击后送入槽，再用邻居 type 触发棋盘全消
        const isGolden = this.board.isGolden(tileId);

        const tile = this.board.collectTile(tileId);
        if (!tile) return this.rejectTile(tileId, 'Tile is blocked or missing');

        this.audio.play('click', 0.8);
        // 点中有效瓷砖时震动，逻辑同按钮释放：单次 40ms 轻震。
        Haptic.tick();
        this.session.recordMove();

        // 飞入动画：计算目标槽位世界坐标
        const targetIndex = this.slot.getCount() + this.pendingFlyCount;
        const slotWorldPos = this.slot.getSlotWorldPosition(Math.min(targetIndex, this.slot.getCapacity() - 1));
        this.pendingFlyCount += 1;

        // ★ 数据层提前判定：入槽但跳过视觉渲染，消除/满载结果即时可知
        const slotResult = this.slot.addTileEager(tile);
        // 标记飞入中，防止其他砖块 commitRender 时提前渲染此砖块
        this.slot.markFlying(tileId);
        let postFlyMessage = `Picked ${tile.icon}.`;
        let pendingLose = slotResult.full;

        if (this.pendingGoldenTileId && !isGolden && !slotResult.matched) {
            const goldenId = this.pendingGoldenTileId;
            this.pendingGoldenTileId = null;
            const nearestIds = this.board.getNearestTilesOfMatchKey(tile.matchKey, goldenId, 2);
            if (nearestIds.length >= 2) {
                this.board.forceRemoveTiles(nearestIds);
                this.slot.removeTilesByPredicate((slotTile) =>
                    slotTile.id === goldenId || slotTile.id === tile.id,
                );
                this.board.forceRemoveTiles([goldenId, tile.id]);
                this.audio.play('match', 1.0);
                this.playMatchEffect([this.slot.getSlotWorldPosition(Math.max(0, this.slot.getCount()))]);
                postFlyMessage = `Golden cleared 3 ${tile.icon}.`;
                pendingLose = false;
                this.syncSnapshot(postFlyMessage);
            } else {
                const cleared = this.resolveGoldenWithHubCounts(goldenId, 'Golden vanished (no enough match targets).');
                postFlyMessage = cleared ? 'Golden cleared 3 tiles (fallback).' : 'Golden vanished (no enough match targets).';
                pendingLose = false;
            }
        } else if (isGolden && !slotResult.matched && this.slot.getCount() === 1) {
            if (this.board.countAliveNonGolden() === 0) {
                this.slot.removeTilesByPredicate((slotTile) => slotTile.id === tile.id);
                this.board.forceRemoveTiles([tile.id]);
                this.audio.play('match', 1.0);
                postFlyMessage = 'Golden cleared the last tile.';
                pendingLose = false;
                this.syncSnapshot(postFlyMessage);
            } else {
                this.pendingGoldenTileId = tile.id;
                postFlyMessage = 'Golden waiting next tile.';
                this.syncSnapshot(postFlyMessage);
            }
        } else if (isGolden && !slotResult.matched) {
            const aliveNonGolden = this.board.countAliveNonGolden();
            if (aliveNonGolden === 0) {
                this.slot.removeTilesByPredicate((slotTile) => slotTile.id === tile.id);
                this.board.forceRemoveTiles([tile.id]);
                this.audio.play('match', 1.0);
                postFlyMessage = 'Golden cleared the last tile.';
                pendingLose = false;
                this.syncSnapshot(postFlyMessage);
            } else {
                const hubIds = this.slot.getTileIds();
                const hubMatchKeys = this.slot.getCurrentMatchKeys();
                const goldenIdx = hubIds.indexOf(tile.id);
                let nearestHubId: TileId | null = null;
                let nearestHubKey = '';
                let minDist = Infinity;
                hubIds.forEach((id, index) => {
                    if (id === tile.id) return;
                    const dist = Math.abs(index - goldenIdx);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestHubId = id;
                        nearestHubKey = hubMatchKeys[index];
                    }
                });

                if (nearestHubId) {
                    const boardNearestIds = this.board.getNearestTilesOfMatchKey(nearestHubKey, tileId, 2);
                    if (boardNearestIds.length >= 2) {
                        this.board.forceRemoveTiles(boardNearestIds);
                        this.slot.removeTilesByPredicate((slotTile) =>
                            slotTile.id === tile.id || slotTile.id === nearestHubId,
                        );
                        this.board.forceRemoveTiles([tile.id, nearestHubId]);
                        this.audio.play('match', 1.0);
                        this.playMatchEffect([this.slot.getSlotWorldPosition(Math.max(0, this.slot.getCount()))]);
                        postFlyMessage = `Golden cleared 3 ${nearestHubKey}.`;
                        pendingLose = false;
                        this.syncSnapshot(postFlyMessage);
                    } else {
                        const cleared = this.resolveGoldenWithHubCounts(tile.id, 'Golden vanished (no enough match targets).');
                        postFlyMessage = cleared ? 'Golden cleared 3 tiles (fallback).' : 'Golden vanished (no enough match targets).';
                        pendingLose = false;
                    }
                } else {
                    const cleared = this.resolveGoldenWithHubCounts(tile.id, 'Golden vanished (no enough match targets).');
                    postFlyMessage = cleared ? 'Golden cleared 3 tiles (fallback).' : 'Golden vanished (no enough match targets).';
                    pendingLose = false;
                }
            }
        } else if (isGolden && slotResult.matched) {
            this.board.forceRemoveTiles([tile.id]);
        }

        this.board.playFlyToSlot(tileId, slotWorldPos, () => {
            this.pendingFlyCount = Math.max(0, this.pendingFlyCount - 1);
            if (this.session.state !== GameState.Playing) return;

            // 飞行到位：解除飞行标记，视觉渲染（砖块出现在托盘）
            this.slot.clearFlying(tileId);
            this.slot.commitRender();

            // 视觉就绪后再触发消除动画，保证顺序正确
            if (slotResult.matched) {
                this.playSlotMatchSequence(slotResult, 0.9, `Matched ${tile.icon}.`);
                director.emit(EventKeys.TileMatched, slotResult.matchedTileIds);
                this.board.markMatched(slotResult.matchedTileIds);
                this.applyHubShake(slotResult);
                this.session.slotTileIds = this.slot.getTileIds();
                this.session.remainingTiles = this.board.getRemainingCount();
                this.syncSnapshot(`Matched ${tile.icon}.`);
                return;
            }

            this.applyHubShake(slotResult);
            this.session.slotTileIds = this.slot.getTileIds();
            this.session.remainingTiles = this.board.getRemainingCount();
            director.emit(EventKeys.TileSelected, tile.id);
            // v1.9.1: 还有砖在飞入中时不做死亡判定，避免后续飞入触发匹配的砖
            // 还没执行 markPendingRemove，导致 getActiveCount() 未扣除待消除数而误判死亡
            if (this.pendingFlyCount > 0) {
                this.syncSnapshot(postFlyMessage);
            } else {
                this.finishOrSyncAfterSlotChange(postFlyMessage, pendingLose);
            }
        });

        return {
            tileId,
            tileType: tile.type,
            accepted: true,
            // 飞入是异步的, 同步 return 时 match 结果还未产生; HUD 通过 syncSnapshot 异步刷新
            matched: false,
            matchedTileIds: [],
            slotFull: false,
        };
    }

    /**
     * v1.5.2：调用同事 MatchEffect v6.3 在每个被消除 tile 的槽内位置喷瀑布
     */
    private playMatchEffect(slotWorldPositions: Vec3[]): void {
        if (!this.effectLayer || !this.effectLayer.isValid) return;
        if (!slotWorldPositions || slotWorldPositions.length === 0) return;
        slotWorldPositions.forEach((pos) => {
            MatchEffect.playAt(pos, this.effectLayer);
        });
    }

    /** 三消序列：三张砖都进槽后，逐个删除砖块视觉并从该位置抛出碎片；碎片快结束时再重排槽位。 */
    private playSlotMatchSequence(slotResult: SlotAddResult, volume: number, doneMessage: string): void {
        if (!slotResult.matched || slotResult.matchedTileIds.length === 0) return;
        if (!this.effectLayer || !this.effectLayer.isValid) {
            this.slot.finalizeMatchedTiles(slotResult.matchedTileIds);
            this.finishOrSyncAfterSlotChange(doneMessage);
            return;
        }
        // 标记待消除数，full 判定时扣除，避免消除动画期间误判死亡
        this.slot.markPendingRemove(slotResult.matchedTileIds.length, slotResult.matchedTileIds);
        this.audio.play('match', volume);

        const startDelay = 0.04;
        const stepDelay = 0.04;
        const finalizeDelay = startDelay + stepDelay * Math.max(0, slotResult.matchedTileIds.length - 1) + 0.32;
        const capacitySpan = Math.max(1, this.slot.getCapacity() - 1);

        slotResult.matchedTileIds.forEach((tileId, order) => {
            const pos = slotResult.matchedSlotPositions[order] ?? this.slot.getSlotWorldPosition(order);
            const slotIndex = slotResult.matchedSlotIndices[order] ?? order;
            const slotFactor = Math.max(0, Math.min(1, slotIndex / capacitySpan));
            const burstFactor = order / Math.max(1, slotResult.matchedTileIds.length - 1);
            const countScale = 0.72 + burstFactor * 0.26;
            this.scheduleOnce(() => {
                this.slot.hideTileVisual(tileId);
                MatchEffect.playAt(pos, this.effectLayer, {
                    // 竖向也按三块砖的时间差展开：第一块窄而长，第三块宽而短，叠出抛物线三角形
                    countScale,
                    speedScale: 1.06 + burstFactor * 0.16,
                    xSpeedScale: 0.56 + slotFactor * 0.36 + burstFactor * 0.42,
                    ySpeedScale: 0.62 + burstFactor * 0.10,
                    spreadScale: 1.0,
                    spreadXScale: 0.52 + burstFactor * 0.48,
                    spreadYScale: 1.34 + burstFactor * 0.26,
                    lifeScale: 0.78,
                    emitDurationScale: 0.18,
                    initialAgeScale: 1.08,
                    diagonalFallStrength: 320 + burstFactor * 160,
                    xOffset: -18 + burstFactor * 34,
                    yOffset: -6 + burstFactor * 4,
                });
            }, startDelay + order * stepDelay);
        });

        this.scheduleOnce(() => {
            this.slot.finalizeMatchedTiles(slotResult.matchedTileIds);
            this.finishOrSyncAfterSlotChange(doneMessage);
        }, finalizeDelay);
    }

    private finishOrSyncAfterSlotChange(message: string, pendingLose = false): void {
        if (this.session.state !== GameState.Playing) return;
        this.session.slotTileIds = this.slot.getTileIds();
        this.session.remainingTiles = this.board.getRemainingCount();
        const slotFull = pendingLose || this.slot.getActiveCount() >= this.slot.getEffectiveCapacity();
        // v2.4：传送带 + 落地道具上未消除 tile 也算未通关
        const conveyorLeft = this.conveyor?.getRemainingCount?.() ?? 0;
        const dropLeft = this.dropChute?.getRemainingCount?.() ?? 0;
        if (this.board.getRemainingCount() === 0 && conveyorLeft === 0 && dropLeft === 0 && !this.board.hasRemainingPiggies()) {
            const celebrationDelay = this.comboFeedback?.getCelebrationRemainingSec() ?? 0;
            if (celebrationDelay > 0.02) {
                this.syncSnapshot(message);
                this.scheduleOnce(() => this.finishLevel(true), celebrationDelay + 0.03);
            } else {
                this.finishLevel(true);
            }
        } else if (slotFull) {
            this.finishLevel(false);
        } else {
            this.syncSnapshot(message);
        }
    }

    private syncSnapshot(message: string): void {
        this.session.message = message;
        this.session.slotTileIds = this.slot?.getTileIds?.() ?? [];
        this.session.remainingTiles = this.board?.getRemainingCount?.() ?? this.session.remainingTiles;
        this.updateHud();
    }

    /**
     * v1.6: 投入瓷砖后, 决定 hub 槽是否抖动以及抖动等级
     * 规则:
     *   - 若本次触发 match: combo 内第 1 次 = medium, combo 第 2+ 次 = large
     *   - 若未 match: 槽内总数 4=small, 5=medium, 6=large, 其他不动
     * @param slotResult addTile 返回结果
     */
    private applyHubShake(slotResult: { matched: boolean; countBeforeMatch: number }): void {
        const hubCfg = this.currentTheme?.effects?.hubShake;
        if (hubCfg?.enabled === false) return;
        const now = director.getTotalTime() / 1000;
        if (slotResult.matched) {
            const comboWindow = this.currentTheme?.effects?.combo?.comboWindowSec ?? LevelFlowController.COMBO_WINDOW_SEC;
            if (now - this.lastMatchTime > comboWindow) {
                this.comboCount = 1;
            } else {
                this.comboCount += 1;
            }
            this.lastMatchTime = now;
            const level: ShakeLevel = this.comboCount >= 2
                ? (hubCfg?.rules?.matchedCombo ?? 'large')
                : (hubCfg?.rules?.matchedFirst ?? 'medium');
            this.slot.playShake(level);
            return;
        }
        const n = slotResult.countBeforeMatch;
        const level = hubCfg?.rules?.unmatchedCounts?.[n];
        if (level) this.slot.playShake(level);
    }

    private updateHud(): void {
        if (!this.hud) return;
        this.hud.updateSnapshot(this.getSnapshot());
    }

    private rejectTile(tileId: TileId, reason: string): TileSelectionResult {
        return {
            tileId,
            tileType: '',
            accepted: false,
            matched: false,
            matchedTileIds: [],
            slotFull: false,
            reason,
        };
    }
}
