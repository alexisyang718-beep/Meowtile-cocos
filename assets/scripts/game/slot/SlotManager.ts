import { _decorator, Component, Node, Sprite, tween, UITransform, Vec3, view } from 'cc';
import { GAME_CONFIG } from '../../core/Constants';
import { TileId, TileTypeId } from '../../core/Types';
import { HubShakeEffectConfig, MechanicEffectConfig, ShakeLevel } from '../../data/models/LevelThemeModel';
import { TileRuntimeModel } from '../../data/models/TileModel';
import { UI_LAYOUT } from '../../ui/common/UILayoutConfig';
import { colorFromHex, createLabel, createNode, drawRect, loadSpriteFrameFromResources } from '../../ui/common/UiFactory';
import { SlotItemView } from './SlotItemView';

const { ccclass } = _decorator;

const SLOT_ASSET_PATH = 'newtheme/slot';
const SLOT_ASSET_WIDTH = 1653;
const SLOT_ASSET_HEIGHT = 324;
const SLOT_CELL_CENTER_X = 149;
const SLOT_CELL_STEP_X = 227;
const SLOT_CELL_SIZE = 270;
const SLOT_ASSET_CENTER_X = SLOT_ASSET_WIDTH / 2;

export interface SlotAddResult {
    matched: boolean;
    matchedTileIds: TileId[];
    /** v1.5：匹配触发瞬间，3 张被消除 tile 在槽内的世界坐标（给特效用） */
    matchedSlotPositions: Vec3[];
    /** 匹配触发瞬间，3 张被消除 tile 所在槽位索引（给差异化碎片参数用） */
    matchedSlotIndices: number[];
    full: boolean;
    /** v1.6：插入引发了已有瓷砖的位置交换 (新葡萄塞到第 1 个葡萄旁边, 把后面的瓷砖往后挤) */
    rearranged: boolean;
    /** v1.6：本次插入后、消除前的槽内瓷砖总数 (1..capacity) — 给抖动等级用 */
    countBeforeMatch: number;
}

@ccclass('SlotManager')
export class SlotManager extends Component {
    private tiles: TileRuntimeModel[] = [];
    /** 可被 Undo 返回棋盘的 tile 点击历史。支持连续使用多次返回道具。 */
    private undoStack: TileId[] = [];
    /** 消除动画播放期间，已判定但尚未从 tiles 移除的砖块数。full 判定时需扣除，避免误判死亡。 */
    private pendingRemoveCount = 0;
    /** 消除动画期间待移除的砖块ID，防止消除动画期间同类型砖块再次触发匹配。 */
    private pendingRemoveIds: Set<TileId> = new Set();
    /** 飞入动画中尚未到达托盘的砖块ID，render 时跳过避免提前显示。 */
    private flyingTileIds: Set<TileId> = new Set();
    private capacity: number = GAME_CONFIG.slotCapacity;
    /** v1.5.3：锁死最右 N 个槽位（不可放牌） */
    private lockedRight = 0;
    /** v1.6: 已挂载到节点上的 SlotItem (key=tileId), 增量更新用 */
    private itemNodes: Map<TileId, Node> = new Map();
    private configuredWidth = 0;
    private configuredHeight = 134;
    private tileBasePath: string | undefined;
    private mechanicsTheme: MechanicEffectConfig | undefined;
    private shakeConfig: HubShakeEffectConfig | undefined;

    configureLayout(width: number, height: number): void {
        this.configuredWidth = Math.max(0, width);
        this.configuredHeight = Math.max(1, height);
        this.clearRuntimeChildren();
        this.itemNodes.clear();
        this.staticBuilt = false;
        this.render();
    }

    configureTheme(tileBasePath: string | undefined, mechanicsTheme?: MechanicEffectConfig, shakeConfig?: HubShakeEffectConfig): void {
        this.tileBasePath = tileBasePath;
        this.mechanicsTheme = mechanicsTheme;
        this.shakeConfig = shakeConfig;
    }

    configureTileBase(tileBasePath: string | undefined): void {
        this.configureTheme(tileBasePath, this.mechanicsTheme, this.shakeConfig);
    }

    configureForLevel(capacity: number, lockedRight = 0): void {
        this.capacity = Math.max(3, Math.min(10, capacity || GAME_CONFIG.slotCapacity));
        this.lockedRight = Math.max(0, Math.min(this.capacity - 3, lockedRight));
        // 容量变化必须重建静态背景，但保留 Cocos 中的 SlotAnchor 调整点
        this.clearRuntimeChildren();
        this.itemNodes.clear();
        this.staticBuilt = false;
        this.render();
    }

    getCapacity(): number {
        return this.capacity;
    }

    getEffectiveCapacity(): number {
        return Math.max(0, this.capacity - this.lockedRight);
    }

    reset(): void {
        this.tiles = [];
        this.undoStack = [];
        this.pendingRemoveCount = 0;
        this.pendingRemoveIds.clear();
        this.flyingTileIds.clear();
        this.itemNodes.clear();
        this.clearRuntimeChildren();
        this.staticBuilt = false;
        this.render();
    }

    addTile(tile: TileRuntimeModel): SlotAddResult {
        return this.addTileInternal(tile, true);
    }

    /**
     * 数据层立即判定，但延迟视觉渲染。
     * 用于"点击时即判定消除/满载，飞行结束后再渲染托盘"的流程。
     * 调用后必须在飞行回调里调用 commitRender() 触发视觉更新。
     */
    addTileEager(tile: TileRuntimeModel): SlotAddResult {
        return this.addTileInternal(tile, false);
    }

    /** 触发上一次 addTileEager 跳过的视觉渲染。 */
    commitRender(): void {
        this.render();
    }

    private addTileInternal(tile: TileRuntimeModel, renderNow: boolean): SlotAddResult {
        const item = { ...tile };

        // 同类聚拢：找到最后一个同类牌的位置，插入其后
        // v1.6: 记录是否触发了重排 (插入位置不是末尾 → 后面的瓷砖会被挤后)
        const lastSameIndex = this.findLastIndexOfMatchKey(item.matchKey);
        const isAppendToEnd = lastSameIndex < 0 || lastSameIndex === this.tiles.length - 1;
        if (lastSameIndex >= 0) {
            this.tiles.splice(lastSameIndex + 1, 0, item);
        } else {
            this.tiles.push(item);
        }

        const countBeforeMatch = this.tiles.length;

        const sameTypeTiles = this.tiles.filter((slotTile) => slotTile.matchKey === item.matchKey && !this.pendingRemoveIds.has(slotTile.id));
        let matchedTileIds: TileId[] = [];
        let matchedSlotPositions: Vec3[] = [];
        let matchedSlotIndices: number[] = [];
        if (sameTypeTiles.length >= GAME_CONFIG.matchCount) {
            matchedTileIds = sameTypeTiles.slice(0, GAME_CONFIG.matchCount).map((slotTile) => slotTile.id);
            matchedSlotIndices = matchedTileIds.map((id) => this.tiles.findIndex((t) => t.id === id));
            matchedSlotPositions = matchedSlotIndices.map((idx) => this.computeSlotWorldPos(idx));
            this.removeUndoIds(matchedTileIds);
        } else {
            this.undoStack.push(item.id);
        }

        if (renderNow) this.render();
        const matched = matchedTileIds.length === GAME_CONFIG.matchCount;
        return {
            matched,
            matchedTileIds,
            matchedSlotPositions,
            matchedSlotIndices,
            full: !matched && (this.tiles.length - this.pendingRemoveCount) >= this.getEffectiveCapacity(),
            rearranged: !isAppendToEnd,
            countBeforeMatch,
        };
    }

    /** v1.5.3：黑乌鸦 / 程序化将一张 tile 直接加入槽 */
    pushTilePreloaded(tile: TileRuntimeModel): SlotAddResult {
        return this.addTile(tile);
    }

    private clearRuntimeChildren(): void {
        this.node.children
            .filter((child) => child.name !== 'SlotBg' && !child.name.startsWith('SlotAnchor_'))
            .forEach((child) => child.destroy());
    }

    private getSlotAnchor(index: number): Node | null {
        const anchor = this.node.getChildByName(`SlotAnchor_${index}`);
        return anchor?.activeInHierarchy ? anchor : null;
    }

    private hasSlotAnchors(): boolean {
        return !!this.getSlotAnchor(0);
    }

    private getAnchorCellSize(anchor: Node, fallback: number): number {
        const transform = anchor.getComponent(UITransform);
        const width = transform?.contentSize.width ?? fallback;
        const height = transform?.contentSize.height ?? fallback;
        const authoredSize = Math.min(width * Math.abs(anchor.scale.x), height * Math.abs(anchor.scale.y));
        const minVisualSize = UI_LAYOUT.game.slot.cellSizeMax * 0.48;
        return Math.max(1, authoredSize, fallback, minVisualSize);
    }

    private computeSlotPlacement(index: number, fallback: { cellSize: number; step: number; startX: number }): { x: number; y: number; cellSize: number } {
        const anchor = this.getSlotAnchor(index);
        if (anchor) {
            return {
                x: anchor.position.x,
                y: anchor.position.y,
                cellSize: this.getAnchorCellSize(anchor, fallback.cellSize),
            };
        }
        return {
            x: fallback.startX + index * fallback.step,
            y: UI_LAYOUT.game.slot.itemOffsetY,
            cellSize: fallback.cellSize,
        };
    }

    private computeLayout(): { cellSize: number; step: number; startX: number; slotWidth: number } {
        const cap = this.capacity;
        const cfg = UI_LAYOUT.game.slot;
        const visibleW = view.getVisibleSize().width;
        const baseWidth = this.configuredWidth > 0 ? this.configuredWidth : Math.min(GAME_CONFIG.designWidth, visibleW);
        const slotWidth = baseWidth * cfg.widthRatio;
        const startX = slotWidth * (SLOT_CELL_CENTER_X - SLOT_ASSET_CENTER_X) / SLOT_ASSET_WIDTH;
        let step: number;
        if (cap === 7) {
            step = slotWidth * SLOT_CELL_STEP_X / SLOT_ASSET_WIDTH;
        } else {
            // slot_custom 是同一张横向槽图；非 7 槽时沿素材左右内边界等分，保证锁槽/瓷砖仍落在黑色槽区内。
            const assetRightCenterX = SLOT_ASSET_WIDTH - SLOT_CELL_CENTER_X;
            step = cap > 1 ? slotWidth * (assetRightCenterX - SLOT_CELL_CENTER_X) / SLOT_ASSET_WIDTH / (cap - 1) : 0;
        }
        const cellSize = Math.min(
            slotWidth * SLOT_CELL_SIZE / SLOT_ASSET_WIDTH,
            this.configuredHeight * SLOT_CELL_SIZE / SLOT_ASSET_HEIGHT,
            step > 0 ? step * 0.92 : Number.POSITIVE_INFINITY,
            cfg.cellSizeMax,
        );
        return { cellSize, step, startX, slotWidth };
    }

    private computeSlotWorldPos(slotIndex: number): Vec3 {
        const anchor = this.getSlotAnchor(slotIndex);
        if (anchor) return anchor.getWorldPosition().clone();
        const { startX, step } = this.computeLayout();
        const worldPos = this.node.getWorldPosition().clone();
        worldPos.x += startX + slotIndex * step;
        worldPos.y += UI_LAYOUT.game.slot.itemOffsetY;
        return worldPos;
    }

    private findLastIndexOfMatchKey(matchKey: string): number {
        for (let i = this.tiles.length - 1; i >= 0; i -= 1) {
            if (this.tiles[i].matchKey === matchKey) return i;
        }
        return -1;
    }

    undoLast(): TileRuntimeModel | null {
        while (this.undoStack.length > 0) {
            const tileId = this.undoStack.pop();
            const index = this.tiles.findIndex((tile) => tile.id === tileId);
            if (index < 0) continue;
            const [tile] = this.tiles.splice(index, 1);
            this.render();
            return tile;
        }
        return null;
    }

    private removeUndoIds(tileIds: TileId[]): void {
        if (tileIds.length === 0 || this.undoStack.length === 0) return;
        const removeSet = new Set(tileIds);
        this.undoStack = this.undoStack.filter((id) => !removeSet.has(id));
    }

    getTileIds(): TileId[] {
        return this.tiles.map((tile) => tile.id);
    }

    /** 按 id 查找槽内 tile 的 runtime model（用于 Hint/Clear3 凑牌统计） */
    getTileById(tileId: TileId): TileRuntimeModel | null {
        return this.tiles.find((tile) => tile.id === tileId) ?? null;
    }

    getCurrentTypes(): TileTypeId[] {
        return this.tiles.map((tile) => tile.type);
    }

    /** 返回槽内所有砖块的运行时数据（含 iconAsset 主题皮肤信息） */
    getTiles(): TileRuntimeModel[] {
        return this.tiles;
    }

    getCurrentMatchKeys(): string[] {
        return this.tiles.map((tile) => tile.matchKey);
    }

    removeTilesByPredicate(predicate: (tile: TileRuntimeModel) => boolean): TileRuntimeModel[] {
        const removed: TileRuntimeModel[] = [];
        this.tiles = this.tiles.filter((tile) => {
            if (predicate(tile)) {
                removed.push(tile);
                return false;
            }
            return true;
        });
        if (removed.length > 0) {
            this.removeUndoIds(removed.map((tile) => tile.id));
            this.render();
        }
        return removed;
    }

    /** 破碎开始时先把对应槽内砖块视觉删掉，等碎片快结束时再重排数据。 */
    hideTileVisual(tileId: TileId): void {
        const node = this.itemNodes.get(tileId);
        if (!node) return;
        this.itemNodes.delete(tileId);
        if (node.isValid) node.destroy();
    }

    /** 消除动画开始时标记待移除数，full 判定时扣除，避免动画期间误判死亡。 */
    /** 标记砖块进入飞入动画，render 时跳过。 */
    markFlying(tileId: TileId): void {
        this.flyingTileIds.add(tileId);
    }

    /** 砖块飞入完成，允许渲染。 */
    clearFlying(tileId: TileId): void {
        this.flyingTileIds.delete(tileId);
    }

    markPendingRemove(count: number, tileIds?: TileId[]): void {
        this.pendingRemoveCount += count;
        if (tileIds) tileIds.forEach((id) => this.pendingRemoveIds.add(id));
    }

    /** 碎片快结束时真正移除匹配砖块并触发槽位重排。 */
    finalizeMatchedTiles(tileIds: TileId[]): void {
        if (!tileIds || tileIds.length === 0) return;
        const idSet = new Set(tileIds);
        this.pendingRemoveCount = Math.max(0, this.pendingRemoveCount - idSet.size);
        tileIds.forEach((id) => this.pendingRemoveIds.delete(id));
        this.tiles = this.tiles.filter((tile) => !idSet.has(tile.id));
        this.removeUndoIds(tileIds);
        this.render();
    }

    getNeighborTypeOfTile(tileId: TileId): TileTypeId | null {
        const idx = this.tiles.findIndex((tile) => tile.id === tileId);
        if (idx < 0) return null;
        const right = this.tiles[idx + 1];
        if (right) return right.type;
        const left = this.tiles[idx - 1];
        return left ? left.type : null;
    }

    getNeighborMatchKeyOfTile(tileId: TileId): string | null {
        const idx = this.tiles.findIndex((tile) => tile.id === tileId);
        if (idx < 0) return null;
        const right = this.tiles[idx + 1];
        if (right) return right.matchKey;
        const left = this.tiles[idx - 1];
        return left ? left.matchKey : null;
    }

    getCount(): number {
        return this.tiles.length;
    }

    /** 扣除消除动画中待移除的砖块，反映槽的真实占用数，用于死亡判定。 */
    getActiveCount(): number {
        return Math.max(0, this.tiles.length - this.pendingRemoveCount);
    }

    /**
     * v1.5.2：给定 slot 索引返回该格子的世界坐标（公开版，给飞入动画用）。
     * 槽内已有 N 张 → 下一张飞入位置 index = N。
     */
    getSlotWorldPosition(index: number): Vec3 {
        return this.computeSlotWorldPos(index);
    }

    /**
     * v1.6: 整条 hub 槽抖动 (放大→缩小→恢复, 1s 完成)
     * v1.5.5：幅度大幅收敛（旧版最大 +15%/-10% 会让 980 宽槽在窄屏出屏）
     * - small : ±2%
     * - medium: ±3%
     * - large : ±5%
     */
    public playShake(level: ShakeLevel): void {
        if (this.shakeConfig?.enabled === false) return;
        const fallback: Record<ShakeLevel, { up: number; down: number; upDuration: number; holdDuration: number; recoverDuration: number }> = {
            small:  { up: 0.02, down: 0.02, upDuration: 0.18, holdDuration: 0.40, recoverDuration: 0.22 },
            medium: { up: 0.03, down: 0.02, upDuration: 0.18, holdDuration: 0.40, recoverDuration: 0.22 },
            large:  { up: 0.05, down: 0.03, upDuration: 0.18, holdDuration: 0.40, recoverDuration: 0.22 },
        };
        const cfg = this.shakeConfig?.levels?.[level] ?? fallback[level];
        const up = cfg.up;
        const down = cfg.down;
        const target = this.node;
        target.setScale(new Vec3(1, 1, 1));
        tween(target)
            .to(cfg.upDuration ?? fallback[level].upDuration, { scale: new Vec3(1 + up, 1 + up, 1) })
            .to(cfg.holdDuration ?? fallback[level].holdDuration, { scale: new Vec3(1 - down, 1 - down, 1) })
            .to(cfg.recoverDuration ?? fallback[level].recoverDuration, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    // -------- 内部渲染 --------
    /** v1.6: 静态背景节点 (slot 长条+holders) 是否已构建 */
    private staticBuilt = false;

    /** 第一次 render: 构建静态背景 + holders (锁格也在这里画) */
    private buildStatic(): void {
        if (this.staticBuilt) return;
        const { cellSize, step, startX, slotWidth } = this.computeLayout();

        const existingBg = this.node.getChildByName('SlotBg');
        const bg = existingBg ?? createNode(this.node, 'SlotBg', 0, 0, slotWidth, this.configuredHeight);
        bg.setSiblingIndex(0);
        if (!existingBg || !this.hasSlotAnchors()) {
            bg.setPosition(0, 0, 0);
            const bgTransform = bg.getComponent(UITransform) ?? bg.addComponent(UITransform);
            bgTransform.setContentSize(slotWidth, this.configuredHeight);
            const bgSprite = bg.getComponent(Sprite) ?? bg.addComponent(Sprite);
            bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            loadSpriteFrameFromResources(SLOT_ASSET_PATH, (frame) => {
                if (frame && bgSprite.isValid) bgSprite.spriteFrame = frame;
            });
        }

        for (let i = 0; i < this.capacity; i += 1) {
            const isLocked = i >= this.capacity - this.lockedRight;
            if (this.hasSlotAnchors() && !isLocked) continue;
            const placement = this.computeSlotPlacement(i, { cellSize, step, startX });
            const holder = createNode(this.node, `SlotHolder_${i}`, placement.x, placement.y, placement.cellSize, placement.cellSize);
            holder.setSiblingIndex(1 + i);
            if (isLocked) {
                drawRect(holder, placement.cellSize, placement.cellSize, colorFromHex('#000000', 140), colorFromHex('#FFB3B3', 220), 3, Math.round(placement.cellSize * 0.18));
                const lockSize = Math.round(placement.cellSize * 0.56);
                createLabel(holder, 'lock', '🔒', 0, 0, Math.round(lockSize * 0.72), colorFromHex('#FFFFFF'), lockSize, lockSize);
            }
        }
        this.staticBuilt = true;
    }

    /**
     * v1.6 增量渲染:
     * - 静态背景只画一次
     * - 已有节点 → 移到新位置 (tween 滑动)
     * - 新加的节点 → 入场缩放
     * - 不在 this.tiles 里的旧节点 → 销毁 (例如被 match 消除/undo 拿走)
     */
    private render(): void {
        this.buildStatic();

        const layout = this.computeLayout();

        // 1. 找出旧节点中已不在 tiles 数组里的 → 销毁 (match 消除或 undo)
        const currentIds = new Set(this.tiles.map((t) => t.id));
        for (const [id, node] of this.itemNodes) {
            if (!currentIds.has(id)) {
                if (node.isValid) {
                    tween(node)
                        .to(0.12, { scale: new Vec3(0.2, 0.2, 1) })
                        .call(() => { if (node.isValid) node.destroy(); })
                        .start();
                }
                this.itemNodes.delete(id);
            }
        }

        // 2. 遍历 tiles 数组, 对每个 tile 创建/复用节点并定位（跳过飞行中和待消除的砖块）
        this.tiles.forEach((tile, index) => {
            if (this.flyingTileIds.has(tile.id) || this.pendingRemoveIds.has(tile.id)) return;
            const placement = this.computeSlotPlacement(index, layout);
            const targetX = placement.x;
            const targetY = placement.y;
            const cellSize = placement.cellSize;
            let node = this.itemNodes.get(tile.id);
            if (!node) {
                // 新建节点 (新加的瓷砖)
                node = new Node(`SlotItem_${tile.id}`);
                node.layer = this.node.layer;
                this.node.addChild(node);
                node.addComponent(SlotItemView).setup(tile, cellSize, this.tileBasePath, this.mechanicsTheme);
                node.setPosition(new Vec3(targetX, targetY, 0));
                this.itemNodes.set(tile.id, node);
                // 入场动画
                node.setScale(new Vec3(0.2, 0.2, 1));
                tween(node)
                    .to(0.10, { scale: new Vec3(1.08, 1.08, 1) })
                    .to(0.06, { scale: new Vec3(1, 1, 1) })
                    .start();
            } else {
                // 已有节点: 检查是否需要移动 (排序导致位置变化)
                const curX = node.position.x;
                const curY = node.position.y;
                if (Math.abs(curX - targetX) > 0.5 || Math.abs(curY - targetY) > 0.5) {
                    // v1.6: 明确的"交换"动画 — 滑动到新位置
                    tween(node)
                        .to(0.14, { position: new Vec3(targetX, targetY, 0) })
                        .start();
                }
            }
        });
    }
}
