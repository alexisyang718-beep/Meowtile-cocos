import { _decorator, Component, Label, Node, Sprite, Vec3 } from 'cc';
import { TileId } from '../../core/Types';
import { DropChuteConfig } from '../../data/models/LevelModel';
import { MechanicEffectConfig } from '../../data/models/LevelThemeModel';
import { TileRuntimeModel } from '../../data/models/TileModel';
import { colorFromHex, createNode, drawRect, loadSpriteFrameFromResources } from '../../ui/common/UiFactory';

const { ccclass } = _decorator;

/**
 * v2.6 落地道具管理器 —— 竖直料仓，tile 极快掉落堆叠（独立机制，非传送带）。
 *
 * 规则（对齐 Ivan 需求）：
 * - 顶部大号数字 = 框外（未落入可见窗口）的 tile 数量；
 * - 窗口内 tile 紧密堆叠、无空位；点走一个 → 上方 tile 掉落补位、框外的掉入（★补位）；
 * - 剩余数量 < 长度 length 时，整体压缩长度（shrink-to-fit，短仓）；
 * - 掉落速度非常快（dropSpeedSec 默认 0.12 秒/格）。
 */
@ccclass('DropChuteManager')
export class DropChuteManager extends Component {
    private chutes: ChuteRuntime[] = [];
    private onPick: ((tile: TileRuntimeModel, fromWorld: Vec3) => void) | null = null;
    private tileBasePath: string | undefined;
    private mechTheme: MechanicEffectConfig | undefined;
    /** v2.7：本关棋盘实际 tile 尺寸，料仓格子尺寸与其保持一致（复用传送带外观 token 时的默认值改由此覆盖）。 */
    private boardTileSize: number | undefined;

    private bandTop = 500;
    private bandBottom = -500;
    private availableWidth = 980;

    configureLayout(bandTop: number, bandBottom: number, availableWidth: number): void {
        this.bandTop = bandTop;
        this.bandBottom = bandBottom;
        this.availableWidth = Math.max(1, availableWidth);
    }

    /**
     * @param boardTileSize v2.7：本关 BoardManager.getCurrentTileSize() 的结果。
     *   传入后料仓格子尺寸（含整体宽度）与棋盘 tile 保持一致；不传则回退主题 cellSize（默认 96）。
     */
    configureTheme(tileBasePath: string | undefined, mechTheme?: MechanicEffectConfig, boardTileSize?: number): void {
        this.tileBasePath = tileBasePath;
        this.mechTheme = mechTheme;
        this.boardTileSize = boardTileSize;
    }

    setup(
        chutes: DropChuteConfig[],
        resolveTile: (type: string, id: string) => TileRuntimeModel,
        onPick: (tile: TileRuntimeModel, fromWorld: Vec3) => void,
    ): void {
        this.onPick = onPick;
        this.node.removeAllChildren();
        this.chutes = [];
        if (!chutes || chutes.length === 0) return;
        const idx = { left: 0, right: 0 };
        chutes.forEach((cfg) => {
            const side: 'left' | 'right' = cfg.edge === 'right' ? 'right' : 'left';
            this.buildChute(cfg, resolveTile, side, idx[side]);
            idx[side] += 1;
        });
    }

    /** 料仓剩余（框内+框外）未消除 tile 总数——用于通关判定。 */
    getRemainingCount(): number {
        return this.chutes.reduce((sum, c) => sum + c.queue.length, 0);
    }

    hasChutes(): boolean {
        return this.chutes.length > 0;
    }

    /** 逐帧：每个窗口内 tile 朝目标 y 极快趋近（掉落堆叠）。 */
    protected update(dt: number): void {
        for (const c of this.chutes) {
            const speed = this.step(c) / c.dropSpeedSec;   // px/s（极快）
            const maxDelta = speed * dt;
            c.tileNodes.forEach((node, id) => {
                if (!node.isValid) return;
                const ty = c.targetY.get(id);
                if (ty == null) return;
                const y = node.position.y;
                const diff = ty - y;
                if (Math.abs(diff) <= maxDelta) node.setPosition(new Vec3(0, ty, 0));
                else node.setPosition(new Vec3(0, y + Math.sign(diff) * maxDelta, 0));
            });
        }
    }

    // ────────────────────────── 内部 ──────────────────────────

    private step(c: ChuteRuntime): number {
        return c.cellSize + c.gap;
    }

    /** 当前可见长度：min(length, 剩余数)（shrink-to-fit）。 */
    private visibleLen(c: ChuteRuntime): number {
        return Math.min(c.length, c.queue.length);
    }

    /** 窗口内第 i 个（i=0 底部出口）相对料仓中心 y。底部堆叠，向上排。 */
    private slotY(c: ChuteRuntime, i: number, visible: number): number {
        const bottom = -(visible - 1) * this.step(c) / 2;
        return bottom + i * this.step(c);
    }

    private enterY(c: ChuteRuntime, visible: number): number {
        return this.slotY(c, visible, visible) + this.step(c); // 顶端外
    }

    private buildChute(
        cfg: DropChuteConfig,
        resolveTile: (type: string, id: string) => TileRuntimeModel,
        side: 'left' | 'right',
        index: number,
    ): void {
        const themeCfg = this.mechTheme?.conveyor;   // 复用传送带外观 token
        // v2.7：格子尺寸优先与棋盘 tile 保持一致（视觉统一），主题 cellSize 仅作无棋盘尺寸时的兜底。
        const cellSize = this.boardTileSize ?? themeCfg?.cellSize ?? 96;
        const gap = themeCfg?.gap ?? 12;
        const length = Math.max(1, cfg.length || 5);
        const dropSpeedSec = Math.max(0.03, cfg.dropSpeedSec ?? 0.12);
        const inset = themeCfg?.leftInset ?? 18;

        const centerY = (this.bandTop + this.bandBottom) / 2;
        const isRight = side === 'right';
        const baseX = isRight ? (this.availableWidth / 2 - cellSize / 2 - inset)
            : (-this.availableWidth / 2 + cellSize / 2 + inset);
        const chuteX = baseX + (isRight ? -1 : 1) * index * (cellSize + 28);

        const queue: TileRuntimeModel[] = (cfg.types ?? []).map((type, i) =>
            resolveTile(type, `${cfg.id}_T${String(i + 1).padStart(3, '0')}`),
        );

        const node = createNode(this.node, `Chute_${cfg.id}`, chuteX, centerY, cellSize + gap, length * (cellSize + gap) + gap);
        node.setSiblingIndex(62);

        const c: ChuteRuntime = {
            cfg, node, chuteX, centerY, queue, length, cellSize, gap, dropSpeedSec,
            tileNodes: new Map(), targetY: new Map(), clickable: new Map(), countLabel: null,
        };
        this.chutes.push(c);
        this.drawTrack(c);
        this.buildCounter(c);
        this.sync(c, /* animate */ false);
    }

    private drawTrack(c: ChuteRuntime): void {
        const themeCfg = this.mechTheme?.conveyor;
        const visible = Math.max(1, this.visibleLen(c));
        const h = visible * this.step(c) + c.gap;
        drawRect(
            c.node, c.cellSize + c.gap, h,
            colorFromHex(themeCfg?.beltColor ?? '#8C93A8', themeCfg?.beltAlpha ?? 255),
            colorFromHex(themeCfg?.beltStroke ?? '#5A6178', 255),
            themeCfg?.beltStrokeWidth ?? 4,
            Math.round((c.cellSize + c.gap) / 2),
        );
        c.node.setPosition(new Vec3(c.chuteX, c.centerY, 0));
    }

    private offBoxCount(c: ChuteRuntime): number {
        return Math.max(0, c.queue.length - c.length);
    }

    private buildCounter(c: ChuteRuntime): void {
        if (c.cfg.showCount === false) return;
        const themeCfg = this.mechTheme?.conveyor;
        const s = c.cellSize;
        const h = Math.max(1, this.visibleLen(c)) * this.step(c) + c.gap;
        const bubble = createNode(c.node, 'Counter', 0, h / 2 + s * 0.42, s * 0.95, s * 0.62);
        bubble.setSiblingIndex(999);
        drawRect(bubble, s * 0.95, s * 0.62,
            colorFromHex(themeCfg?.beltColor ?? '#8C93A8', 255),
            colorFromHex(themeCfg?.beltStroke ?? '#5A6178', 255), 4, Math.round(s * 0.31));
        const lblNode = createNode(bubble, 'CountText', 0, 0, s * 0.9, s * 0.5);
        const lbl = lblNode.addComponent(Label);
        lbl.string = String(this.offBoxCount(c));
        lbl.fontSize = Math.round(s * 0.42);
        lbl.color = colorFromHex(themeCfg?.countColor ?? '#FFFFFF');
        c.countLabel = lbl;
    }

    private updateCounter(c: ChuteRuntime): void {
        if (c.countLabel && c.countLabel.isValid) c.countLabel.string = String(this.offBoxCount(c));
    }

    /** 同步窗口内 tile；剩余<length 时压缩长度并重绘料仓。 */
    private sync(c: ChuteRuntime, animate: boolean): void {
        const visible = this.visibleLen(c);
        this.drawTrack(c);
        this.repositionCounter(c);
        const present = new Set<string>();
        for (let i = 0; i < visible; i += 1) {
            const tile = c.queue[i];
            present.add(tile.id);
            c.targetY.set(tile.id, this.slotY(c, i, visible));
            c.clickable.set(tile.id, true);
            let node = c.tileNodes.get(tile.id);
            if (!node) {
                const startY = animate ? this.enterY(c, visible) : this.slotY(c, i, visible);
                node = this.buildTileNode(c, tile, startY);
                c.tileNodes.set(tile.id, node);
            }
        }
        c.tileNodes.forEach((node, id) => {
            if (!present.has(id)) {
                if (node.isValid) node.destroy();
                c.tileNodes.delete(id);
                c.targetY.delete(id);
                c.clickable.delete(id);
            }
        });
        this.updateCounter(c);
    }

    private repositionCounter(c: ChuteRuntime): void {
        if (!c.countLabel) return;
        const bubble = c.countLabel.node.parent;
        if (!bubble || !bubble.isValid) return;
        const h = Math.max(1, this.visibleLen(c)) * this.step(c) + c.gap;
        bubble.setPosition(new Vec3(0, h / 2 + c.cellSize * 0.42, 0));
    }

    private buildTileNode(c: ChuteRuntime, tile: TileRuntimeModel, y: number): Node {
        const cellSize = c.cellSize;
        const node = createNode(c.node, `DTile_${tile.id}`, 0, y, cellSize, cellSize);
        const baseNode = createNode(node, 'Base', 0, 0, cellSize, cellSize);
        const baseSprite = baseNode.addComponent(Sprite);
        baseSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        if (this.tileBasePath) loadSpriteFrameFromResources(this.tileBasePath, (f) => { if (f && baseSprite.isValid) baseSprite.spriteFrame = f; });
        else drawRect(baseNode, cellSize, cellSize, colorFromHex('#FFFDF8'), colorFromHex('#687189'), 2, 16);
        const iconSize = Math.round(cellSize * 0.72);
        const iconNode = createNode(node, 'Icon', 0, 0, iconSize, iconSize);
        if (tile.iconAsset) {
            const iconSprite = iconNode.addComponent(Sprite);
            iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            loadSpriteFrameFromResources(tile.iconAsset, (f) => { if (f && iconSprite.isValid) iconSprite.spriteFrame = f; });
        } else {
            const lbl = iconNode.addComponent(Label);
            lbl.string = tile.icon ?? '?';
            lbl.fontSize = Math.round(iconSize * 0.6);
            lbl.color = colorFromHex('#333333');
        }
        node.on(Node.EventType.TOUCH_END, () => this.onTapTile(c, tile));
        return node;
    }

    private onTapTile(c: ChuteRuntime, tile: TileRuntimeModel): void {
        if (!c.clickable.get(tile.id)) return;
        const idx = c.queue.findIndex((t) => t.id === tile.id);
        if (idx < 0) return;
        const node = c.tileNodes.get(tile.id);
        if (!node || !node.isValid) return;
        const fromWorld = node.getWorldPosition();
        c.queue.splice(idx, 1);      // 出队 → 上方掉落补位、框外掉入
        node.destroy();
        c.tileNodes.delete(tile.id);
        c.targetY.delete(tile.id);
        c.clickable.delete(tile.id);
        this.sync(c, /* animate */ true);
        this.onPick?.(tile, fromWorld);
    }
}

interface ChuteRuntime {
    cfg: DropChuteConfig;
    node: Node;
    chuteX: number;
    centerY: number;
    queue: TileRuntimeModel[];
    length: number;
    cellSize: number;
    gap: number;
    dropSpeedSec: number;
    tileNodes: Map<TileId, Node>;
    targetY: Map<TileId, number>;
    clickable: Map<TileId, boolean>;
    countLabel: Label | null;
}
