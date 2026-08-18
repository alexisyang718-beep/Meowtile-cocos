import { _decorator, Component, Node, Vec3, tween, easing } from 'cc';
import { GAME_CONFIG } from '../../core/Constants';
import { TileId, TileTypeId } from '../../core/Types';
import { getMatchKey } from '../../core/TileMatchGroup';
import { LevelModel, PiggyObstacle } from '../../data/models/LevelModel';
import { ResolvedLevelTheme } from '../../data/models/LevelThemeModel';
import { TileRuntimeModel, TileTypeConfig } from '../../data/models/TileModel';
import { TileActor } from './TileActor';
import { CoverSystem } from './CoverSystem';
import { UI_LAYOUT } from '../../ui/common/UILayoutConfig';
import { colorFromHex, createLabel, createNode, drawCircle, drawRect } from '../../ui/common/UiFactory';
import { Haptic } from '../../core/HapticManager';

const { ccclass } = _decorator;

@ccclass('BoardManager')
export class BoardManager extends Component {
    private tiles: TileRuntimeModel[] = [];
    private actors = new Map<TileId, TileActor>();
    private readonly coverSystem = new CoverSystem();
    private onPick: ((tile: TileRuntimeModel) => void) | null = null;
    private currentLevelRows = GAME_CONFIG.boardRows;
    private currentLevelCols = GAME_CONFIG.boardCols;
    private currentTileBase: string | undefined;
    private currentTheme: ResolvedLevelTheme | null = null;
    /** v4 自适应：本关 tile 实际像素尺寸（按 cols 计算，含上下限） */
    private currentTileSize = GAME_CONFIG.tileWidth;
    /** v4 自适应：本关 layer 总数（用于计算棋盘高度 + 安全偏移） */
    private currentTileLayers = 1;
    /** v4 自适应：本关棋盘整体 Y 偏移（按实际 tile 数据反推，避开 Slot/Booster） */
    private currentBoardOffsetY = 0;
    /**
     * v2.7 补丁：本关棋盘整体 X 偏移（避开左右传送带/落地道具侧边条）。
     * bandReserveLeft/Right 不对称时（例如只有右侧传送带），可用宽度的中心并不等于
     * 屏幕/安全区的几何中心 x=0 —— 此前一直缺失这个补偿，只靠 tile bbox 自身居中，
     * 导致 tileSize 缩小了但棋盘位置没有整体让开，最外侧一列仍会被侧边条压住。
     */
    private currentBoardOffsetX = 0;
    /** v1.5.6：bbox 布局中心（单位：tileSize=1） */
    private layoutCenterXUnit = 0;
    private layoutCenterYUnit = 0;
    private availableWidth = GAME_CONFIG.designWidth - 100;
    private widthRatioOverride: number | null = null;
    /** v4：安全区上边界（tile 顶 ≤ 此值），由 LevelFlowController.setSafeArea 注入 */
    private safeAreaTop = 540;
    /** v4：安全区下边界（tile 底 ≥ 此值），由 LevelFlowController.setSafeArea 注入 */
    private safeAreaBottom = -680;
    /** v1.5.3：本关小猪障碍物（layer 0/1 之间显示，覆盖区 4 tile 全消除后移除） */
    private piggies: PiggyObstacle[] = [];
    private piggyNodes = new Map<string, Node>();
    /**
     * v2.7：传送带/落地道具的侧边占位预留（像素）。
     * 这些机制渲染在棋盘外的独立条上（不占用 row/col 网格），但会挤占屏幕物理空间；
     * 棋盘计算 tileSize/bbox 时必须扣除这块预留区域，否则宽度不够时棋盘 tile 会被侧边条压盖/重叠。
     * 由 LevelFlowController 在 board.setup 之前根据 level.mechanics 的 conveyors/dropChutes 数量注入。
     */
    private bandReserveLeft = 0;
    private bandReserveRight = 0;
    private bandReserveTop = 0;
    private bandReserveBottom = 0;

    /**
     * v4：由外部（LevelFlowController）注入实际 Slot 底边 + Booster 顶边
     * BoardManager 据此自动算棋盘 Y 偏移，避免硬编码。
     * @param slotBottom Slot 节点的底边 y 坐标（含安全缝）
     * @param boosterTop Booster 节点的顶边 y 坐标（含安全缝）
     */
    setSafeArea(slotBottom: number, boosterTop: number): void {
        this.safeAreaTop = slotBottom;
        this.safeAreaBottom = boosterTop;
    }

    setAvailableWidth(width: number): void {
        this.availableWidth = Math.max(1, width);
    }

    setWidthRatioOverride(value: number | null): void {
        this.widthRatioOverride = typeof value === 'number' && value > 0 ? value : null;
    }

    /**
     * v2.7：由 LevelFlowController 在 board.setup 之前调用，注入本关传送带/落地道具
     * 占用的侧边物理空间（像素），棋盘计算 tileSize 时据此收缩可用区域——
     * 保证棋盘 tile 永不与侧边条重叠（"强制占位，不让放其他瓷砖"）。
     * 左右各取 max(左侵占, 右侵占) 双边对称收缩，保证任一侧都不会被压盖（保守但绝不重叠）。
     */
    setBandReserve(left: number, right: number, top: number, bottom: number): void {
        this.bandReserveLeft = Math.max(0, left);
        this.bandReserveRight = Math.max(0, right);
        this.bandReserveTop = Math.max(0, top);
        this.bandReserveBottom = Math.max(0, bottom);
    }

    /** v2.7：本关棋盘实际 tile 像素尺寸（bbox-based 自适应结果），供传送带/落地道具同步保持视觉一致。 */
    getCurrentTileSize(): number {
        return this.currentTileSize;
    }

    setup(level: LevelModel, tileTypes: TileTypeConfig[], onPick: (tile: TileRuntimeModel) => void, theme?: ResolvedLevelTheme): void {
        this.onPick = onPick;
        this.currentTheme = theme ?? null;
        this.currentLevelRows = level.rows ?? GAME_CONFIG.boardRows;
        this.currentLevelCols = level.cols ?? GAME_CONFIG.boardCols;
        this.currentTileBase = theme?.tileBase;
        this.currentTileLayers = level.layers ?? 1;
        this.piggies = level.mechanics?.piggies ?? [];
        // v2.4：传送带 tile 不参与棋盘 bbox 计算（它们在棋盘外的独立条上）。
        const boardTilesForBounds = level.tiles.filter((tile) => !tile.conveyorId);
        // v1.5.6：基于实际 tile/piggy bbox 算 tileSize，而不是只看 cols/rows/layers。
        // 这样不同关卡形状、golden 临时层、小猪 2x2 区域都能统一适配。
        this.currentTileSize = this.computeTileSize(boardTilesForBounds, this.piggies);
        // v1.5.6：棋盘中心 = 可用区域中心（上下距离托盘/道具的 margin 与左右同理）
        this.currentBoardOffsetY = this.computeBoardOffsetY(boardTilesForBounds);
        // v2.7 补丁：左右传送带/落地道具预留不对称时，棋盘需要整体横移让开（同 Y 方向原理）。
        this.currentBoardOffsetX = this.computeBoardOffsetX();
        // 同步给 CoverSystem 用于遮挡判定
        this.coverSystem.setTileSize(this.currentTileSize);

        this.node.removeAllChildren();
        this.actors.clear();
        this.piggyNodes.clear();

        const typeMap = new Map<TileTypeId, TileTypeConfig>();
        tileTypes.forEach((type) => typeMap.set(type.id, type));
        // v2.4：传送带 tile 不属于棋盘，由 ConveyorManager 管理，这里过滤掉。
        const boardTiles = level.tiles.filter((tile) => !tile.conveyorId);
        this.tiles = boardTiles.map((tile) => {
            const type = typeMap.get(tile.type);
            const skin = this.currentTheme?.tileIcons?.[tile.type];
            const runtime: TileRuntimeModel = {
                ...tile,
                icon: skin?.icon ?? type?.icon ?? tile.type.slice(0, 2).toUpperCase(),
                iconAsset: skin?.iconAsset ?? type?.iconAsset,
                color: skin?.color ?? type?.color ?? '#607D8B',
                matchKey: skin?.matchKey ?? getMatchKey(tile.type),
                goldenTargetMatchKey: tile.goldenTargetType
                    ? this.currentTheme?.tileIcons?.[tile.goldenTargetType]?.matchKey ?? getMatchKey(tile.goldenTargetType)
                    : undefined,
                layoutX: 0,
                layoutY: 0,
                clickable: true,
                selected: false,
                removed: false,
                covered: tile.covered === true,
                golden: tile.golden === true,
            };
            const position = this.getTilePosition(runtime);
            runtime.layoutX = position.x;
            runtime.layoutY = position.y;
            return runtime;
        });
        this.refreshCover();
        this.renderTiles();
        this.renderPiggies();
    }

    collectTile(tileId: TileId): TileRuntimeModel | null {
        const tile = this.findTile(tileId);
        if (!tile || !tile.clickable || tile.removed || tile.selected) return null;
        tile.selected = true;
        this.refreshCover();
        this.refreshActors(tile.id);
        return tile;
    }

    /**
     * 卡牌飞入槽位动画 (从 TileTripGameReal.flyToSlot 移植)
     * 调用方传入目标世界坐标, BoardManager 让对应 actor 走贝塞尔曲线飞过去
     */
    playFlyToSlot(tileId: TileId, slotWorldPos: Vec3, onDone: () => void): void {
        const actor = this.actors.get(tileId);
        if (!actor) { onDone(); return; }
        actor.playFlyToSlot(slotWorldPos, () => {
            actor.refreshView();
            onDone();
        });
    }

    restoreTile(tileId: TileId): void {
        const tile = this.findTile(tileId);
        if (!tile) return;
        tile.selected = false;
        tile.removed = false;
        // 恢复节点的位置/缩放/层级：飞入槽位时节点已被移到槽位并缩放，
        // 撤回时必须归位到棋盘原位才能正常显示
        const actor = this.actors.get(tileId);
        if (actor) {
            actor.node.setPosition(new Vec3(tile.layoutX, tile.layoutY, 0));
            actor.node.setScale(new Vec3(1, 1, 1));
            actor.node.angle = 0;
            actor.node.active = true;
            // 恢复渲染层级（飞行时被 setSiblingIndex(99999) 置顶了）
            this.restoreActorSiblingIndex(tile);
        }
        this.refreshCover();
        this.refreshActors();
    }

    markMatched(tileIds: TileId[]): void {
        tileIds.forEach((id) => {
            const tile = this.findTile(id);
            if (!tile) return;
            tile.removed = true;
            tile.selected = false;
        });
        this.refreshCover();
        this.refreshActors();
        // v1.5.3: 检查每个小猪覆盖区是否已清空，若清空则移除小猪并刷新点击状态
        this.checkAndRemovePiggies();
    }

    /**
     * v1.5.2：播放 tile 飞入槽位的贝塞尔动画（从 feat/ui 移植，与上方 playFlyToSlot 合并保留）
     */
    shuffleRemaining(): void {
        // 金色 tile 不参与洗牌；它的特殊逻辑依赖 type/matchKey 保持为 golden。
        const alive = this.tiles.filter((tile) => !tile.removed && !tile.selected && !tile.golden);
        if (alive.length === 0) return;
        const visuals = alive.map((tile) => ({
            type: tile.type,
            icon: tile.icon,
            iconAsset: tile.iconAsset,
            color: tile.color,
            matchKey: tile.matchKey,
            goldenTargetMatchKey: tile.goldenTargetMatchKey,
        }));
        // 用真随机洗牌（之前的伪随机种子总是一样的，看起来"没变"）
        for (let i = visuals.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [visuals[i], visuals[j]] = [visuals[j], visuals[i]];
        }

        const shuffleCfg = this.currentTheme?.effects?.shuffle;
        if (shuffleCfg?.enabled === false) {
            alive.forEach((tile, index) => {
                const actor = this.actors.get(tile.id);
                tile.type = visuals[index].type;
                tile.icon = visuals[index].icon;
                tile.iconAsset = visuals[index].iconAsset;
                tile.color = visuals[index].color;
                tile.matchKey = visuals[index].matchKey;
                tile.goldenTargetMatchKey = visuals[index].goldenTargetMatchKey;
                actor?.reloadAfterShuffle(tile);
            });
            return;
        }

        const STEP1 = shuffleCfg?.gatherDuration ?? 0.22;
        const HOLD = shuffleCfg?.holdDuration ?? 0.18;
        const STEP3 = shuffleCfg?.scatterDuration ?? 0.20;
        const STAGGER_MAX = shuffleCfg?.staggerMax ?? 0.10;

        const centerX = this.currentBoardOffsetX;
        const centerY = this.currentBoardOffsetY;

        const vortexCfg = shuffleCfg?.vortex;
        if (vortexCfg?.enabled !== false) {
            const vortexRadius = vortexCfg?.radius ?? 700;
            const vortexBg = createNode(this.node, 'ShuffleVortexBg', centerX, centerY, vortexRadius * 2, vortexRadius * 2);
            const layers = Math.max(1, vortexCfg?.layers ?? 10);
            const maxAlpha = vortexCfg?.maxAlpha ?? 230;
            for (let i = 0; i < layers; i++) {
                const ratio = layers <= 1 ? 1 : i / (layers - 1);
                const r = vortexRadius * (1 - ratio * 0.95);
                const alpha = Math.round(ratio * maxAlpha);
                if (alpha === 0) continue;
                const layer = createNode(vortexBg, `Layer_${i}`, 0, 0, r * 2, r * 2);
                drawCircle(layer, r, colorFromHex('#000000', alpha));
            }
            vortexBg.setSiblingIndex(0);
            vortexBg.setScale(new Vec3(0, 0, 1));
            tween(vortexBg)
                .to(vortexCfg?.expandDuration ?? 0.10, { scale: new Vec3(1, 1, 1) })
                .delay(vortexCfg?.holdDuration ?? 0.10)
                .to(vortexCfg?.shrinkDuration ?? 0.20, { scale: new Vec3(0, 0, 1) })
                .call(() => { if (vortexBg.isValid) vortexBg.destroy(); })
                .start();
        }

        // 计算所有瓷砖到中心的距离, 用于 stagger
        const dists = alive.map((tile) => {
            const dx = tile.layoutX - centerX;
            const dy = tile.layoutY - centerY;
            return Math.sqrt(dx * dx + dy * dy);
        });
        const maxDist = Math.max(1, ...dists);

        const ARC_MAG = shuffleCfg?.arcMagnitude ?? 0.7;
        const spinTurnsMin = Math.max(1, Math.floor(shuffleCfg?.spinTurnsMin ?? 1));
        const spinTurnsMax = Math.max(spinTurnsMin, Math.floor(shuffleCfg?.spinTurnsMax ?? 2));

        alive.forEach((tile, index) => {
            const actor = this.actors.get(tile.id);
            if (!actor) return;
            const node = actor.node;
            const startX = tile.layoutX;
            const startY = tile.layoutY;
            const dist = dists[index];
            // 离中心越远 → 比例越大 → delay 越小; 越近 → delay 越大
            const proximityRatio = 1 - dist / maxDist;   // 0..1, 0=最远 1=最近
            const delay = proximityRatio * STAGGER_MAX;

            // 顺时针弧线: 法线 = (dy, -dx)/dist (P 看向 C 的右侧, 屏幕坐标 y 向上 → 顺时针漩涡)
            const midDirX = dist > 0.5 ? (startY - centerY) / dist : 0;
            const midDirY = dist > 0.5 ? -(startX - centerX) / dist : 0;
            const arcMag = dist * ARC_MAG;
            // 汇聚弧线中点 (右侧法线)
            const midX1 = (startX + centerX) / 2 + midDirX * arcMag;
            const midY1 = (startY + centerY) / 2 + midDirY * arcMag;
            // 散落弧线中点 (反向 → 仍顺时针漩涡)
            const midX3 = (centerX + startX) / 2 - midDirX * arcMag;
            const midY3 = (centerY + startY) / 2 - midDirY * arcMag;

            // 阶段 ① 旋转: 整数圈 (360 或 720), 这样到中心时角度=0 (端正)
            // 但 cocos tween angle 是相对值, 实际旋转量 = spin1 - 0 = spin1
            const spin1Turns = spinTurnsMin + Math.floor(Math.random() * (spinTurnsMax - spinTurnsMin + 1));
            const spin1 = (Math.random() < 0.5 ? -1 : 1) * 360 * spin1Turns;
            // 阶段 ③ 旋转: 同样整数圈, 末态 = spin1 + spin3 然后归零
            const spin3Turns = spinTurnsMin + Math.floor(Math.random() * (spinTurnsMax - spinTurnsMin + 1));
            const spin3 = (Math.random() < 0.5 ? -1 : 1) * 360 * spin3Turns;

            tween(node)
                .delay(delay)
                // ①.a 起点 → 弧线中点 (含旋转, 阶段末态 = 整圈, 视觉端正)
                .parallel(
                    tween().to(STEP1 / 2, { position: new Vec3(midX1, midY1, 0) }, { easing: easing.quadIn }),
                    tween().to(STEP1, { angle: spin1 }),
                )
                // ①.b 弧线中点 → 中心
                .to(STEP1 / 2, { position: new Vec3(centerX, centerY, 0) }, { easing: easing.quadOut })
                // ② 停留: 强制 angle=0 (#1 端正), 同时换皮
                .call(() => {
                    node.angle = 0;
                    tile.type = visuals[index].type;
                    tile.icon = visuals[index].icon;
                    tile.iconAsset = visuals[index].iconAsset;
                    tile.color = visuals[index].color;
                    tile.matchKey = visuals[index].matchKey;
                    tile.goldenTargetMatchKey = visuals[index].goldenTargetMatchKey;
                    actor.reloadAfterShuffle(tile);
                })
                .delay(HOLD)
                // ③.a 中心 → 散落弧线中点
                .parallel(
                    tween().to(STEP3 / 2, { position: new Vec3(midX3, midY3, 0) }, { easing: easing.quadIn }),
                    tween().to(STEP3, { angle: spin3 }),
                )
                // ③.b 弧线中点 → 原位
                .to(STEP3 / 2, { position: new Vec3(startX, startY, 0) }, { easing: easing.quadOut })
                // 旋转归零
                .call(() => { node.angle = 0; })
                .start();
        });

        const boardShake = shuffleCfg?.boardShake;
        const shakeSteps = boardShake?.steps ?? [];
        if (boardShake?.enabled !== false && shakeSteps.length > 0) {
            const boardOrigX = this.node.position.x;
            const boardOrigY = this.node.position.y;
            let seq = tween(this.node);
            shakeSteps.forEach((step) => {
                seq = seq.to(step.duration, {
                    position: new Vec3(boardOrigX + step.x, boardOrigY + step.y, 0),
                    scale: new Vec3(step.scaleX, step.scaleY, 1),
                });
            });
            seq.start();
        }
    }

    getHintTile(slotMatchKeys: string[] = []): TileRuntimeModel | null {
        const alive = this.tiles.filter((tile) => !tile.removed && !tile.selected && tile.clickable);
        const preferred = alive.find((tile) => slotMatchKeys.includes(tile.matchKey));
        return preferred ?? alive[0] ?? null;
    }

    highlightTile(tileId: TileId): void {
        const actor = this.actors.get(tileId);
        if (!actor) return;
        actor.node.setScale(new Vec3(1.18, 1.18, 1));
        this.scheduleOnce(() => actor.node.setScale(new Vec3(1, 1, 1)), 0.35);
    }

    getRemainingCount(): number {
        // 已飞入槽内但尚未完成结算的 tile，视觉上已经离开棋盘，不应继续计入剩余数量。
        return this.tiles.filter((tile) => !tile.removed && !tile.selected).length;
    }

    /** 棋盘上仍存活的非金色 tile 数量。 */
    countAliveNonGolden(): number {
        return this.tiles.filter((tile) => !tile.removed && !tile.selected && !tile.golden).length;
    }

    /**
     * 关卡结束/复活弹窗显示前调用：强制隐藏所有棋盘砖块（含飞行中置顶节点），
     * 避免飞行砖块因 siblingIndex=99999 穿透弹窗遮罩。
     */
    hideAllTiles(): void {
        this.actors.forEach((actor) => {
            actor.node.active = false;
        });
    }

    pickNearestAtRootPosition(rootX: number, rootY: number): TileRuntimeModel | null {
        return this.findNearestTile(rootX - this.node.position.x, rootY - this.node.position.y);
    }

    findTile(tileId: TileId): TileRuntimeModel | null {
        return this.tiles.find((tile) => tile.id === tileId) ?? null;
    }

    private refreshCover(): void {
        this.coverSystem.refreshClickable(this.tiles);

        // v1.5.3：同 layer + 同 row/col 的完全重叠堆叠，只允许最上面一张可点。
        // Cocos 同父节点渲染顺序是后添加的在上方；renderTiles 同 layer 保持 tiles 原顺序添加，
        // 所以同 key 分组里最后一个 alive tile 才是当前 top。
        const groups = new Map<string, TileRuntimeModel[]>();
        this.tiles.forEach((tile) => {
            if (tile.removed || tile.selected) return;
            const key = `${tile.layer}|${tile.row.toFixed(2)}|${tile.col.toFixed(2)}`;
            const arr = groups.get(key) ?? [];
            arr.push(tile);
            groups.set(key, arr);
        });
        groups.forEach((group) => {
            if (group.length <= 1) return;
            const top = group[group.length - 1];
            group.slice(0, -1).forEach((tile) => { tile.clickable = false; });
            top.clickable = true;
        });
    }

    private renderTiles(): void {
        // 按 layer 升序添加：低层先（siblingIndex 小，渲染在下面），高层后（渲染在上面且触摸优先）
        // v1.6 开局下落动画 (用户最新约束):
        //   #1 整体 1.3s 内 *所有* 瓷砖全部到位 (单瓷砖序列 1.0s + 最大错峰 0.30s = 1.30s)
        //   #2 起点 Y 用绝对画面外坐标 (1100 > 设计上沿 960), 确保动画前看不到任何瓷砖
        //   #3 增强随机性 — "稀里哗啦" 感:
        //      - 同 layer 内 jitter 0~0.20s (远大于之前 0.05)
        //      - 起点 Y 在画面外 0~2*tileH 范围内再随机 (高度参差不齐, 落速差异大)
        //      - fallDuration 在 0.40~0.55 区间随机 (有的块快有的块慢)
        //      - 回弹幅度 ±20% 随机 (有的块弹得高有的弹得低)
        //   #4 后排(低 layer)与前排(高 layer)的 *基础* delay 差缩到 0.10s, 配合 jitter 总 ≤ 0.30s
        const sorted = [...this.tiles].sort((a, b) => a.layer - b.layer);

        const enterCfg = this.currentTheme?.effects?.boardEnter;
        const enterEnabled = enterCfg?.enabled !== false;
        const layerStaggerMax = enterCfg?.layerStaggerMax ?? 0.10;
        const jitterMax = enterCfg?.jitterMax ?? 0.20;

        // 开局棋盘入场动画：使用更稀疏、稍重的落地脉冲，和拼豆逐颗填充的细密 tick 区分开。
        if (enterEnabled) {
            Haptic.pulsePattern(0.95, 22, 150);
        }

        const tileH = this.currentTileSize;
        const screenTopY = enterCfg?.screenTopY ?? 960;
        const offscreenBaseY = screenTopY + tileH * (enterCfg?.offscreenBaseTileHeights ?? 1);
        const offscreenJitterRange = tileH * (enterCfg?.offscreenJitterTileHeights ?? 2);

        // 计算 layer 跨度, 用于 stagger 比例 (低 layer 先落, 高 layer 后落)
        const minLayer = sorted[0]?.layer ?? 0;
        const maxLayer = sorted[sorted.length - 1]?.layer ?? 0;
        const layerSpan = Math.max(1, maxLayer - minLayer);

        // v1.5.3：同位置同 layer 重叠（同事 D 关 5 / 17 piggy 上层 4 张 row/col 完全相同）
        //         给同位置每张 tile 加一个微小扇形偏移，让玩家肉眼可见有几张叠在一起。
        const stackKey = (t: TileRuntimeModel) => `${t.layer}|${t.row.toFixed(2)}|${t.col.toFixed(2)}`;
        const stackOrder = new Map<string, number>();
        const stackTotal = new Map<string, number>();
        sorted.forEach((tile) => {
            const key = stackKey(tile);
            stackTotal.set(key, (stackTotal.get(key) ?? 0) + 1);
        });
        sorted.forEach((tile) => {
            const key = stackKey(tile);
            const order = stackOrder.get(key) ?? 0;
            stackOrder.set(key, order + 1);
            const total = stackTotal.get(key) ?? 1;
            // 视觉扇形偏移：仅当存在 >=2 张完全同位置 tile 时启用
            let visualOffsetX = 0;
            let visualOffsetY = 0;
            if (total > 1) {
                const step = Math.min(10, this.currentTileSize * 0.08);
                // 4 张时 → -1.5/-0.5/+0.5/+1.5 步长，居中扇形
                const k = order - (total - 1) / 2;
                visualOffsetX = k * step;
                visualOffsetY = k * step * 0.6;
            }

            const node = new Node(`Tile_${tile.id}`);
            node.layer = this.node.layer;
            this.node.addChild(node);
            // v1.6 落点 = 主线扇形偏移后的最终位置
            const finalX = tile.layoutX + visualOffsetX;
            const finalY = tile.layoutY + visualOffsetY;
            const startY = offscreenBaseY + Math.random() * offscreenJitterRange;
            node.setPosition(new Vec3(finalX, enterEnabled ? startY : finalY, 0));
            const actor = node.addComponent(TileActor);
            actor.setup(tile, (t) => { if (this.onPick) this.onPick(t); }, this.currentTileBase, this.currentTileSize, this.currentTheme?.effects?.mechanics);
            this.actors.set(tile.id, actor);
            if (!enterEnabled) return;

            // #4 基础 delay: 后排(低 layer)~0, 前排(高 layer)~0.10s
            // #3 同 layer 内加 0~0.20s 真随机抖动, 让节奏完全错乱
            const layerProgress = (tile.layer - minLayer) / layerSpan;  // 0..1
            const baseDelay = layerProgress * layerStaggerMax;
            const jitter = Math.random() * jitterMax;
            const delay = baseDelay + jitter;

            const fallMin = enterCfg?.fallDurationMin ?? 0.40;
            const fallMax = enterCfg?.fallDurationMax ?? 0.55;
            const bounce1UpMin = enterCfg?.bounce1UpMin ?? 0.18;
            const bounce1UpMax = enterCfg?.bounce1UpMax ?? 0.24;
            const bounce1DownMin = enterCfg?.bounce1DownMin ?? 0.11;
            const bounce1DownMax = enterCfg?.bounce1DownMax ?? 0.16;
            const bounce2UpMin = enterCfg?.bounce2UpMin ?? 0.10;
            const bounce2UpMax = enterCfg?.bounce2UpMax ?? 0.14;
            const bounce2DownMin = enterCfg?.bounce2DownMin ?? 0.07;
            const bounce2DownMax = enterCfg?.bounce2DownMax ?? 0.10;
            const randRange = (min: number, max: number) => min + Math.random() * Math.max(0, max - min);
            const fallDuration = randRange(fallMin, fallMax);
            const bounce1Up = randRange(bounce1UpMin, bounce1UpMax);
            const bounce1Down = randRange(bounce1DownMin, bounce1DownMax);
            const bounce2Up = randRange(bounce2UpMin, bounce2UpMax);
            const bounce2Down = randRange(bounce2DownMin, bounce2DownMax);

            const bounceRandomness = enterCfg?.bounceHeightRandomness ?? 0.30;
            const bounceMinScale = 1 - bounceRandomness / 2;
            const bounce1H = tileH * ((enterCfg?.bounce1HeightRatio ?? 0.15) * (bounceMinScale + Math.random() * bounceRandomness));
            const bounce2H = tileH * ((enterCfg?.bounce2HeightRatio ?? 0.05) * (bounceMinScale + Math.random() * bounceRandomness));

            tween(node)
                .delay(delay)
                // 1. 下落到位 (加速)
                .to(fallDuration, { position: new Vec3(finalX, finalY, 0) }, { easing: easing.quadIn })
                // 2. 第 1 次向上回弹 ~15% 瓷砖高度
                .to(bounce1Up, { position: new Vec3(finalX, finalY + bounce1H, 0) }, { easing: easing.quadOut })
                .to(bounce1Down, { position: new Vec3(finalX, finalY, 0) }, { easing: easing.quadIn })
                // 3. 第 2 次向上回弹 ~5% 瓷砖高度
                .to(bounce2Up, { position: new Vec3(finalX, finalY + bounce2H, 0) }, { easing: easing.quadOut })
                .to(bounce2Down, { position: new Vec3(finalX, finalY, 0) }, { easing: easing.quadIn })
                .start();
        });
    }

    /**
     * 撤回道具：恢复 actor 的渲染层级到正确的 layer 顺序。
     * 按 layer 升序排列 tile，找到目标 tile 应在的位置，将 actor 节点插入。
     */
    private restoreActorSiblingIndex(targetTile: TileRuntimeModel): void {
        const sorted = [...this.tiles]
            .filter((t) => !t.removed && !t.selected)
            .sort((a, b) => a.layer - b.layer);
        const targetIdx = sorted.findIndex((t) => t.id === targetTile.id);
        if (targetIdx < 0) return;
        // 找到排序中前一个 tile 的 actor，把目标插到它后面
        const actor = this.actors.get(targetTile.id);
        if (!actor) return;
        if (targetIdx === 0) {
            actor.node.setSiblingIndex(0);
        } else {
            const prevTile = sorted[targetIdx - 1];
            const prevActor = this.actors.get(prevTile.id);
            if (prevActor) {
                actor.node.setSiblingIndex(prevActor.node.getSiblingIndex() + 1);
            }
        }
    }

    private refreshActors(exceptTileId?: TileId): void {
        this.tiles.forEach((tile) => {
            if (tile.id === exceptTileId) return;
            const actor = this.actors.get(tile.id);
            if (!actor) return;
            actor.setClickable(tile.clickable);
            actor.refreshView();
        });
    }

    private findNearestTile(x: number, y: number): TileRuntimeModel | null {
        const halfW = this.currentTileSize / 2;
        const halfH = this.currentTileSize / 2;
        let best: TileRuntimeModel | null = null;
        // 精确 AABB 命中：点击坐标必须在牌面矩形内；多张重叠取最高 layer，
        // 同 layer 时取后渲染的 tile（sorted 后靠后 = sibling 更上层）。
        const sorted = [...this.tiles].sort((a, b) => a.layer - b.layer);
        sorted.forEach((tile) => {
            if (!tile.clickable || tile.removed || tile.selected) return;
            if (Math.abs(tile.layoutX - x) <= halfW && Math.abs(tile.layoutY - y) <= halfH) {
                if (!best || tile.layer >= best.layer) {
                    best = tile;
                }
            }
        });
        return best;
    }

    private getTilePosition(tile: TileRuntimeModel): Vec3 {
        // 优先使用关卡 JSON 提供的绝对坐标（D 手摆）
        if (typeof tile.x === 'number' && typeof tile.y === 'number') {
            return new Vec3(tile.x, tile.y, 0);
        }

        // v1.5.6：bbox-based layout。
        // 先把每张 tile 归一化到 tileSize=1 的坐标系，再整体减去 bbox 中心。
        // 这样不管一行 6/7/8 个、golden 临时增加层、小猪 2x2，都能保证视觉 bbox 居中。
        const ratio = this.getTileStepRatio();
        // 金色 tile 需要 100% 盖在目标牌上：layer 仍高一层，但 stagger 计算按 target 层处理。
        const staggerLayer = (tile.golden && tile.goldenTargetId) ? tile.layer - 1 : tile.layer;
        // v1.5.6+：每层 stagger 系数默认 0.5。tile.layerStepCoef 可单独覆盖（如 0 = 100% 覆盖，0.1 = 90% 覆盖）。
        const stepCoef = typeof tile.layerStepCoef === 'number' ? tile.layerStepCoef : 0.5;
        const dir = this.getLayerStepDirection(tile, ratio);
        const centerXUnit = tile.col * ratio + staggerLayer * ratio * stepCoef * dir.x;
        const centerYUnit = -tile.row * ratio + staggerLayer * ratio * stepCoef * dir.y;
        const px = (centerXUnit - this.layoutCenterXUnit) * this.currentTileSize + this.currentBoardOffsetX;
        const py = (centerYUnit - this.layoutCenterYUnit) * this.currentTileSize + this.currentBoardOffsetY;
        return new Vec3(px, py, 0);
    }

    /**
     * v5：按实际 tile 数据计算棋盘整体 Y 偏移
     * - 棋盘垂直居中到安全区中心 (safeAreaTop + safeAreaBottom) / 2
     * - 若超出顶/底边 → 再向内挤压
     */
    private computeBoardOffsetY(tiles: { row: number; col: number; layer: number }[]): number {
        // v1.5.6：上下也按"同一边距"原则布局。
        // safeAreaTop/Bottom 是托盘底/道具顶边界；棋盘 bbox 放在内缩 margin 后的区域中心。
        if (!tiles || tiles.length === 0) return 0;
        const margin = this.getBoardMargin();
        // v2.7：横版传送带贴顶/贴底会额外占用竖直空间，中心随之内缩。
        const top = this.safeAreaTop - margin - this.bandReserveTop;
        const bottom = this.safeAreaBottom + margin + this.bandReserveBottom;
        return (top + bottom) / 2;
    }

    /**
     * v2.7 补丁：按左右传送带/落地道具预留计算棋盘整体 X 偏移，对称于 computeBoardOffsetY。
     * 可用区域是 [-availableWidth/2, availableWidth/2]（与 ConveyorManager.configureLayout 的
     * bandLeft/bandRight 定义一致），扣除 margin + 对应侧的 bandReserve 后取中点。
     * 左右预留不相等时（例如只有右侧传送带），中点会偏离 0，棋盘据此整体让开侧边条。
     */
    private computeBoardOffsetX(): number {
        const margin = this.getBoardMargin();
        const half = this.availableWidth / 2;
        const left = -half + margin + this.bandReserveLeft;
        const right = half - margin - this.bandReserveRight;
        return (left + right) / 2;
    }

    private getBoardMargin(): number {
        return this.availableWidth * UI_LAYOUT.game.board.marginRatio;
    }

    /** v1.5.6：bbox-based tileSize。按实际 tile/piggy 视觉 bbox 反推尺寸。 */
    private computeTileSize(tiles: { row: number; col: number; layer: number; x?: number; y?: number }[], piggies: PiggyObstacle[]): number {
        const bounds = this.computeLayoutUnitBounds(tiles, piggies);
        this.layoutCenterXUnit = (bounds.minX + bounds.maxX) / 2;
        this.layoutCenterYUnit = (bounds.minY + bounds.maxY) / 2;

        const margin = this.getBoardMargin();
        // v2.7：竖版传送带/落地道具贴左右侧会挤占横向空间，棋盘宽度需先扣除这块预留区，
        //   否则宽度不足时棋盘外沿 tile 会与侧边条重叠——"强制占位，不让放其他瓷砖"的物理落地点。
        // v2.9：砖块只保留两档尺寸。
        //   常规棋盘按 6×7 视觉尺度使用大砖；最大棋盘按 7×8 视觉尺度使用小砖。
        //   小于常规尺度的结构不再继续放大；超过最大尺度时仅做安全兜底缩小，关卡结构本身应避免超过 7×8。
        const boardWidthRatio = this.widthRatioOverride ?? UI_LAYOUT.game.board.widthRatio ?? 1;
        const alignedWidth = this.availableWidth * boardWidthRatio;
        const availableWidth = Math.max(1, alignedWidth - this.bandReserveLeft - this.bandReserveRight);
        const availableHeight = Math.max(1, (this.safeAreaTop - this.safeAreaBottom) - margin * 2 - this.bandReserveTop - this.bandReserveBottom);

        const bboxWidth = Math.max(1, bounds.maxX - bounds.minX);
        const bboxHeight = Math.max(1, bounds.maxY - bounds.minY);
        const ratio = this.getTileStepRatio();
        const normalCols = Math.max(1, UI_LAYOUT.game.board.normalVisualCols ?? 6);
        const normalRows = Math.max(1, UI_LAYOUT.game.board.normalVisualRows ?? 7);
        const maxCols = Math.max(normalCols, UI_LAYOUT.game.board.maxVisualCols ?? 7);
        const maxRows = Math.max(normalRows, UI_LAYOUT.game.board.maxVisualRows ?? 8);
        const normalWidth = 1 + (normalCols - 1) * ratio;
        const normalHeight = 1 + (normalRows - 1) * ratio;
        const maxWidth = 1 + (maxCols - 1) * ratio;
        const maxHeight = 1 + (maxRows - 1) * ratio;
        const largeSize = Math.min(availableWidth / normalWidth, availableHeight / normalHeight);
        const smallSize = Math.min(availableWidth / maxWidth, availableHeight / maxHeight);
        const fitsNormal = bboxWidth <= normalWidth && bboxHeight <= normalHeight;
        const safeSize = Math.min(availableWidth / bboxWidth, availableHeight / bboxHeight);
        const raw = fitsNormal ? largeSize : Math.min(smallSize, safeSize);

        return Math.max(this.getTileSizeMin(), Math.min(this.getTileSizeMax(), raw));
    }

    private getTileStepRatio(): number {
        return UI_LAYOUT.game.board.tileStepRatio;
    }

    private getLayerStepDirection(tile: { row: number; col: number; layerStepDirX?: number; layerStepDirY?: number; stackTowardCenter?: boolean }, ratio: number): { x: number; y: number } {
        if (typeof tile.layerStepDirX === 'number' || typeof tile.layerStepDirY === 'number') {
            return {
                x: tile.layerStepDirX ?? 0,
                y: tile.layerStepDirY ?? 0,
            };
        }
        if (tile.stackTowardCenter) {
            const baseXUnit = tile.col * ratio;
            const baseYUnit = -tile.row * ratio;
            return {
                x: baseXUnit > this.layoutCenterXUnit ? -1 : 1,
                y: baseYUnit > this.layoutCenterYUnit ? -1 : 1,
            };
        }
        return { x: 1, y: 1 };
    }

    private getTileSizeMin(): number {
        return UI_LAYOUT.game.board.tileSizeMin;
    }

    private getTileSizeMax(): number {
        return UI_LAYOUT.game.board.tileSizeMax;
    }

    private computeLayoutUnitBounds(tiles: { row: number; col: number; layer: number; x?: number; y?: number }[], piggies: PiggyObstacle[]): { minX: number; maxX: number; minY: number; maxY: number } {
        const ratio = this.getTileStepRatio();
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const include = (cx: number, cy: number, half: number): void => {
            minX = Math.min(minX, cx - half);
            maxX = Math.max(maxX, cx + half);
            minY = Math.min(minY, cy - half);
            maxY = Math.max(maxY, cy + half);
        };

        tiles.forEach((tile) => {
            if (typeof tile.x === 'number' && typeof tile.y === 'number') return;
            // 朝心堆叠默认向内，不会撑大外边界；显式 layerStepDirX/Y 则按真实方向计入 bbox。
            if ((tile as any).stackTowardCenter
                && typeof (tile as any).layerStepDirX !== 'number'
                && typeof (tile as any).layerStepDirY !== 'number') {
                const cx = tile.col * ratio;
                const cy = -tile.row * ratio;
                include(cx, cy, 0.5);
                return;
            }
            const stepCoef = typeof (tile as any).layerStepCoef === 'number' ? (tile as any).layerStepCoef : 0.5;
            const dirX = typeof (tile as any).layerStepDirX === 'number' ? (tile as any).layerStepDirX : 1;
            const dirY = typeof (tile as any).layerStepDirY === 'number' ? (tile as any).layerStepDirY : 1;
            const cx = tile.col * ratio + tile.layer * ratio * stepCoef * dirX;
            const cy = -tile.row * ratio + tile.layer * ratio * stepCoef * dirY;
            include(cx, cy, 0.5);
        });

        piggies.forEach((piggy) => {
            const layer = piggy.coverLayer ?? 0;
            const cx = (piggy.col + 0.5) * ratio + layer * ratio / 2;
            const cy = -(piggy.row + 0.5) * ratio + layer * ratio / 2;
            include(cx, cy, 1.0);
        });

        if (minX === Infinity) return { minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5 };
        return { minX, maxX, minY, maxY };
    }

    // ============================================================
    //  v1.5.3 新增：4 类玩法机制 + 黑乌鸦 + 金色 tile + 小猪障碍物
    // ============================================================

    /**
     * v1.5.3 黑乌鸦：从棋盘"主铺层"（数量最多的那层）随机抽 N 张 tile。
     * 不要求 clickable（主铺层的 tile 通常被上层压着不可点击；
     * 乌鸦是程序化掠走，绕过点击判定）。每次进关用 Math.random 真随机。
     */
    pickBottomTilesForCrow(count: number): TileRuntimeModel[] {
        const alive = this.tiles.filter(
            (t) => !t.removed && !t.selected && !t.covered && !t.golden,
        );
        if (alive.length === 0) return [];
        // 找数量最多的 layer 作为主铺层
        const layerCount = new Map<number, number>();
        alive.forEach((t) => layerCount.set(t.layer, (layerCount.get(t.layer) ?? 0) + 1));
        let mainLayer = 0;
        let maxN = 0;
        layerCount.forEach((n, layer) => {
            if (n > maxN) { maxN = n; mainLayer = layer; }
        });
        const candidates = alive.filter((t) => t.layer === mainLayer);
        const pool = [...candidates];
        for (let i = pool.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, count);
    }

    /**
     * v1.5.3 黑乌鸦专用 —— 强制掠走 tile（无视 clickable / cover）。
     * 直接将其标记为 selected 并播放隐藏动画，然后返回 runtime model 用于槽。
     */
    forceSnatchTile(tileId: TileId): TileRuntimeModel | null {
        const tile = this.findTile(tileId);
        if (!tile || tile.removed || tile.selected) return null;
        tile.selected = true;
        const actor = this.actors.get(tile.id);
        if (actor) actor.playPickFeedback(() => actor.refreshView());
        this.refreshCover();
        this.refreshActors(tile.id);
        return tile;
    }

    /** v1.5.3 揭开 covered tile（点一次） */
    revealCoveredTile(tileId: TileId): boolean {
        const tile = this.findTile(tileId);
        if (!tile || !tile.covered) return false;
        tile.covered = false;
        const actor = this.actors.get(tileId);
        if (actor) actor.setCovered(false);
        this.refreshActors();
        return true;
    }

    /** v1.5.3 是否是 covered tile（用于点击逻辑判断） */
    isCovered(tileId: TileId): boolean {
        const tile = this.findTile(tileId);
        return !!(tile && tile.covered);
    }

    /** v1.5.3 是否是金色 tile */
    isGolden(tileId: TileId): boolean {
        const tile = this.findTile(tileId);
        return !!(tile && tile.golden);
    }

    /** v1.5.3 获取金色 tile 覆盖的目标 type（首点 golden 无邻居时用兜底） */
    getGoldenTargetMatchKey(tileId: TileId): string | null {
        const tile = this.findTile(tileId);
        return tile?.goldenTargetMatchKey ?? null;
    }

    /** v1.5.3 取所有同 type 且未消除的 tile id（用于金色 tile 触发全消） */
    getAllTilesOfType(type: TileTypeId): TileId[] {
        return this.tiles
            .filter((t) => !t.removed && !t.selected && t.type === type)
            .map((t) => t.id);
    }

    /**
     * v7.10：取离指定 tile 物理坐标最近的 N 张同 type tile id（按欧式距离升序）
     * 用于金色 tile 触发"消除最近 N 张"机制：
     *   以 fromTileId 的 layoutX/Y 为参考点，输出 count 张距离最小的同 type tile。
     *   排除自己 + 已消除 / 已选中的 tile。
     */
    getNearestTilesOfMatchKey(matchKey: string, fromTileId: TileId, count: number): TileId[] {
        const fromTile = this.findTile(fromTileId);
        if (!fromTile) return [];
        const candidates = this.tiles.filter((t) =>
            !t.removed && !t.selected
            && t.matchKey === matchKey
            && t.id !== fromTileId,
        );
        candidates.sort((a, b) => {
            const da = (a.layoutX - fromTile.layoutX) ** 2 + (a.layoutY - fromTile.layoutY) ** 2;
            const db = (b.layoutX - fromTile.layoutX) ** 2 + (b.layoutY - fromTile.layoutY) ** 2;
            return da - db;
        });
        return candidates.slice(0, count).map((t) => t.id);
    }

    /**
     * 金色 tile 的 fallback 选牌逻辑。
     * 在棋盘与 hub 合并后，找一个总数至少为 3 的 matchKey，优先返回距金色最近的棋盘目标。
     */
    findGoldenClearTargets(goldenTileId: TileId, hubMatchKeyCounts: Map<string, number>): { boardIds: TileId[]; targetMatchKey: string } | null {
        const golden = this.findTile(goldenTileId);
        if (!golden) return null;

        const aliveBoard = this.tiles.filter((tile) =>
            !tile.removed && !tile.selected && !tile.golden && tile.id !== goldenTileId,
        );
        const sorted = [...aliveBoard].sort((a, b) => {
            const da = (a.layoutX - golden.layoutX) ** 2 + (a.layoutY - golden.layoutY) ** 2;
            const db = (b.layoutX - golden.layoutX) ** 2 + (b.layoutY - golden.layoutY) ** 2;
            return da - db;
        });

        const keyCount = new Map<string, number>();
        sorted.forEach((tile) => keyCount.set(tile.matchKey, (keyCount.get(tile.matchKey) ?? 0) + 1));
        hubMatchKeyCounts.forEach((count, key) => {
            keyCount.set(key, (keyCount.get(key) ?? 0) + count);
        });

        const seed = sorted.find((tile) => (keyCount.get(tile.matchKey) ?? 0) >= 3);
        if (!seed) {
            for (const [key, count] of hubMatchKeyCounts) {
                if (count >= 3) return { boardIds: [], targetMatchKey: key };
            }
            return null;
        }

        const needFromBoard = 3 - (hubMatchKeyCounts.get(seed.matchKey) ?? 0);
        const boardIds = sorted
            .filter((tile) => tile.matchKey === seed.matchKey)
            .slice(0, Math.max(0, needFromBoard))
            .map((tile) => tile.id);
        return { boardIds, targetMatchKey: seed.matchKey };
    }

    /** Hint/Clear3 道具：按 matchKey 从棋盘挑选 count 个未选中/未消除 tile（优先顶层）。 */
    pickBoardTilesByMatchKey(matchKey: string, count: number): TileId[] {
        const candidates = this.tiles.filter(
            (tile) => !tile.removed && !tile.selected && tile.matchKey === matchKey,
        );
        candidates.sort((a, b) => b.layer - a.layer);
        return candidates.slice(0, count).map((tile) => tile.id);
    }

    /** v1.5.3 直接强行标记移除（用于金色 tile 全消，不走 selected → matched 流程） */
    forceRemoveTiles(tileIds: TileId[]): void {
        tileIds.forEach((id) => {
            const tile = this.findTile(id);
            if (!tile) return;
            tile.removed = true;
            tile.selected = false;
        });
        this.refreshCover();
        this.refreshActors();
        this.checkAndRemovePiggies();
    }

    /** v1.5.3 取 tile 的世界坐标（用于黑乌鸦动画起点） */
    getTileWorldPosition(tileId: TileId): Vec3 | null {
        const tile = this.findTile(tileId);
        if (!tile) return null;
        return new Vec3(
            this.node.position.x + tile.layoutX,
            this.node.position.y + tile.layoutY,
            0,
        );
    }

    /** v1.5.3 是否还有小猪存在（影响通关判定） */
    hasRemainingPiggies(): boolean {
        return this.piggies.length > 0;
    }

    /**
     * v1.5.3 渲染小猪。小猪占据 coverLayer 的 2×2 区域；上一层 4 个 tile 完全
     *  重叠在小猪正中心（半格错位 + 同 row,col → 中心点重合）
     *  渲染位置 = 该 layer 的 (row+0.5, col+0.5) 几何中心 + 该 layer 的 stagger 偏移
     */
    private renderPiggies(): void {
        this.piggies.forEach((piggy) => {
            const size = this.currentTileSize;
            // v1.5.6：与 getTilePosition 同一套 bbox-based 公式
            const ratio = this.getTileStepRatio();
            const layer = piggy.coverLayer ?? 0;
            const centerXUnit = (piggy.col + 0.5) * ratio + layer * ratio / 2;
            const centerYUnit = -(piggy.row + 0.5) * ratio + layer * ratio / 2;
            const px = (centerXUnit - this.layoutCenterXUnit) * size + this.currentBoardOffsetX;
            const py = (centerYUnit - this.layoutCenterYUnit) * size + this.currentBoardOffsetY;

            const piggyCfg = this.currentTheme?.effects?.mechanics?.piggy;
            const node = createNode(this.node, `Piggy_${piggy.id}`, px, py, size * 2, size * 2);
            drawRect(node, size * 2, size * 2,
                colorFromHex(piggyCfg?.bodyColor ?? '#FFA0BD', 255), colorFromHex(piggyCfg?.strokeColor ?? '#FF4D7E', 255),
                piggyCfg?.strokeWidth ?? 4, Math.round(size * (piggyCfg?.radiusRatio ?? 0.18)));
            createLabel(node, 'pigFace', piggyCfg?.emoji ?? '🐷', 0, 0, Math.round(size * (piggyCfg?.fontScale ?? 1.2)),
                colorFromHex('#FFFFFF'), size * 2, size * 2);

            // v7.10：修复小猪被外圈 tile 视觉盖住（stagger 偏移导致非 quad 区的高层 tile 越界压到小猪粉框）
            //   旧方案：小猪 sibling 紧跟 layer === coverLayer 的最后一张 → 上一层 (coverLayer+1) 全部 tile 都在小猪之上，
            //          包括「外圈非 quad 区」的那些 tile，stagger 偏移后视觉上盖住小猪粉框。
            //   新方案：① 把小猪 sibling 提到 *所有 tile* 之上（确保不被任何外圈 tile 视觉压住）
            //          ② 再把「真正覆盖小猪的 4 张 cover tile」（layer === coverLayer+1 且
            //             row/col 命中中心点 / 2×2 quad 整数格）显式抬到小猪 sibling 之上
            //   语义结果：小猪正好夹在「层 coverLayer 与覆盖区 4 张 cover tile」之间。
            const myLayer = piggy.coverLayer ?? 0;
            const centerCol = piggy.col + 0.5;
            const centerRow = piggy.row + 0.5;
            // ① 小猪先到顶
            let topSibling = -1;
            this.actors.forEach((actor) => {
                const idx = actor.node.getSiblingIndex();
                if (idx > topSibling) topSibling = idx;
            });
            node.setSiblingIndex(topSibling + 1);
            // ② 把覆盖小猪的 cover tile 抬到小猪之上
            //   v7.10 兼容两种布局：
            //   - 旧（4 张完全重叠）：t.row=centerRow 且 t.col=centerCol
            //   - 新（4 张分散到 2×2 quad 4 格）：t.row ∈ [piggy.row, piggy.row+1] 且 t.col ∈ [piggy.col, piggy.col+1]
            const piggySibling = node.getSiblingIndex();
            this.actors.forEach((actor, tileId) => {
                const t = this.tiles.find((tt) => tt.id === tileId);
                if (!t) return;
                if (t.layer !== myLayer + 1) return;
                const isCenterOverlap = Math.abs(t.row - centerRow) < 0.01 && Math.abs(t.col - centerCol) < 0.01;
                const isInQuad = t.row >= piggy.row && t.row <= piggy.row + 1
                    && t.col >= piggy.col && t.col <= piggy.col + 1;
                if (!isCenterOverlap && !isInQuad) return;
                actor.node.setSiblingIndex(piggySibling + 1);
            });
            this.piggyNodes.set(piggy.id, node);
        });
    }

    /** v1.5.3 找到 layer == targetLayer 的最后一个 tile 节点的 siblingIndex */
    private findLastSiblingIndexOfLayer(targetLayer: number): number {
        const sortedTiles = [...this.tiles].sort((a, b) => a.layer - b.layer);
        let lastIdx = -1;
        sortedTiles.forEach((tile, idx) => {
            if (tile.layer === targetLayer) lastIdx = idx;
        });
        return lastIdx;
    }

    /**
     * v1.5.3 检查每只小猪：当其上一层（coverLayer+1）覆盖 piggy 2×2 区域的
     *  tile 全部消除后，移除小猪
     * v7.10：判定从「中心点重合 (row+0.5, col+0.5)」改为「2×2 区域内任意整数格 (row..row+1, col..col+1)」，
     *        以兼容新版 4 张分散到 4 个格子的小猪覆盖布局。
     */
    private checkAndRemovePiggies(): void {
        if (this.piggies.length === 0) return;
        const remaining: PiggyObstacle[] = [];
        this.piggies.forEach((piggy) => {
            const layer = piggy.coverLayer ?? 0;
            const centerRow = piggy.row + 0.5;
            const centerCol = piggy.col + 0.5;
            // v7.10：兼容两种 cover 布局
            //   - 旧布局：4 张完全重叠在中心 (row+0.5, col+0.5)
            //   - 新布局：4 张分散到 quad 4 格 (row, col), (row, col+1), (row+1, col), (row+1, col+1)
            const stillCovered = this.tiles.some((t) => {
                if (t.removed || t.layer <= layer) return false;
                if (Math.abs(t.row - centerRow) < 0.01 && Math.abs(t.col - centerCol) < 0.01) return true;
                if (t.row >= piggy.row && t.row <= piggy.row + 1
                    && t.col >= piggy.col && t.col <= piggy.col + 1) return true;
                return false;
            });
            if (stillCovered) {
                remaining.push(piggy);
            } else {
                const node = this.piggyNodes.get(piggy.id);
                if (node && node.isValid) {
                    tween(node).to(0.18, { scale: new Vec3(1.2, 1.2, 1) })
                        .to(0.16, { scale: new Vec3(0, 0, 1) })
                        .call(() => node.destroy()).start();
                }
                this.piggyNodes.delete(piggy.id);
            }
        });
        this.piggies = remaining;
    }
}
