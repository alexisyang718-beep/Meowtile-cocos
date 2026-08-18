import { _decorator, Component, Label, Node, Sprite, Vec3 } from 'cc';
import { TileId } from '../../core/Types';
import { ConveyorConfig } from '../../data/models/LevelModel';
import { MechanicEffectConfig } from '../../data/models/LevelThemeModel';
import { TileRuntimeModel } from '../../data/models/TileModel';
import { colorFromHex, createNode, drawRect, loadSpriteFrameFromResources } from '../../ui/common/UiFactory';

const { ccclass } = _decorator;

/**
 * v2.8 传送带管理器 —— 真循环轨道（竖版 / 横版）。
 *
 * 形态：
 * - 棋盘侧一条胶囊轨道，长度 windowSize 个格；
 * - 一队 tile 绑定在循环轨道的槽位上，按 cellSpeedSec 秒/格 匀速持续转动；
 * - 玩家 tap 点走一个 tile 后该槽位【永久留空】，不补位（onTapTile，游戏内消除逻辑不变）；
 * - 未被点击、自然流到出口的 tile ★不再永久丢弃——回收排到当前队尾（所有仍在带上的
 *   tile 之后），从入口重新进入，实现真正的循环运输（v2.8 起，见 update() 回收逻辑）；
 * - 入口显示阈值：tile 与传送带背景重叠 ≥90% 才建节点刷新出现（layoutBelt 的 enterThreshold），
 *   避免刚沾到边缘就突然冒出来；
 * - 竖版 orientation='vertical'（direction down/up）；横版 'horizontal'（direction left/right）。
 *
 * 实现：tile 有连续行进位置 pos（入口 0 → 出口 windowSize-1，超出后回收）；
 * 只有落在显示阈值内的 tile 建节点且可点，其余（含尚在带外排队的回收 tile）不显示。
 */
@ccclass('ConveyorManager')
export class ConveyorManager extends Component {
    private belts: BeltRuntime[] = [];
    private onPick: ((tile: TileRuntimeModel, fromWorld: Vec3) => void) | null = null;
    private tileBasePath: string | undefined;
    private mechTheme: MechanicEffectConfig | undefined;
    /** v2.7：本关棋盘实际 tile 尺寸，传送带格子尺寸与其保持一致（不再固定用主题 cellSize）。 */
    private boardTileSize: number | undefined;

    private bandTop = 500;
    private bandBottom = -500;
    private availableWidth = 980;
    private bandLeft = -490;
    private bandRight = 490;

    configureLayout(bandTop: number, bandBottom: number, availableWidth: number): void {
        this.bandTop = bandTop;
        this.bandBottom = bandBottom;
        this.availableWidth = Math.max(1, availableWidth);
        this.bandLeft = -this.availableWidth / 2;
        this.bandRight = this.availableWidth / 2;
    }

    /**
     * @param boardTileSize v2.7：本关 BoardManager.getCurrentTileSize() 的结果。
     *   传入后传送带格子尺寸（含轨道整体宽度）与棋盘 tile 保持一致；不传则回退主题 cellSize（默认 96）。
     */
    configureTheme(tileBasePath: string | undefined, mechTheme?: MechanicEffectConfig, boardTileSize?: number): void {
        this.tileBasePath = tileBasePath;
        this.mechTheme = mechTheme;
        this.boardTileSize = boardTileSize;
    }

    setup(
        conveyors: ConveyorConfig[],
        resolveTile: (type: string, id: string) => TileRuntimeModel,
        onPick: (tile: TileRuntimeModel, fromWorld: Vec3) => void,
    ): void {
        this.onPick = onPick;
        this.node.removeAllChildren();
        this.belts = [];
        if (!conveyors || conveyors.length === 0) return;
        const idx = { left: 0, right: 0, top: 0, bottom: 0 };
        conveyors.forEach((cfg) => {
            const horiz = cfg.orientation === 'horizontal';
            const edge = horiz ? (cfg.edge === 'bottom' ? 'bottom' : 'top') : (cfg.edge === 'right' ? 'right' : 'left');
            this.buildBelt(cfg, resolveTile, horiz, edge, idx[edge]);
            idx[edge] += 1;
        });
    }

    /**
     * 传送带上剩余（尚未被玩家点走）的实体 tile 总数——用于通关判定。
     * v2.8：tile 不再因自然流出而丢弃（回收循环），此计数只会因玩家 tap 拾取而减少，
     *   不会随时间自然归零——通关必须真正点完带上所有 tile。
     */
    getRemainingCount(): number {
        return this.belts.reduce((sum, b) => sum + b.slots.filter((s) => s.tile !== null).length, 0);
    }

    hasConveyors(): boolean {
        return this.belts.length > 0;
    }

    protected update(dt: number): void {
        for (const belt of this.belts) {
            const delta = dt / belt.cellSpeedSec;
            // 出口红线在 pos = windowSize-0.5；tile 前沿超红线 10%（遮盖率跌破90%）即离开可视区。
            const exitLimit = belt.windowSize - 0.9;   // pos 超过此值 → 边缘超出红线 10%
            for (const slot of belt.slots) {
                if (slot.tile) slot.pos += delta;
            }
            // v2.8：真循环——未被玩家点击、自然抵达出口的 tile ★不再永久丢弃，
            //   回收排到当前队尾（比所有仍留在带上 tile 的 pos 都更小，间隔 1 格），从入口重新进入继续绕圈。
            //   （玩家 tap 拾取仍走 onTapTile，slot.tile 置 null 永久留空——三消玩法不受影响。）
            //   队尾基准只取「本帧不出局」的 tile（pos <= exitLimit），避免把刚出局的自己算进最小值。
            const stayingPositions = belt.slots.filter((s) => s.tile && s.pos <= exitLimit).map((s) => s.pos);
            let tailPos = stayingPositions.length > 0 ? Math.min(...stayingPositions) : 0;
            for (const slot of belt.slots) {
                if (slot.tile && slot.pos > exitLimit) {
                    const node = belt.tileNodes.get(slot.tile.id);
                    if (node && node.isValid) node.destroy();
                    belt.tileNodes.delete(slot.tile.id);
                    belt.clickable.delete(slot.tile.id);
                    tailPos -= 1;
                    slot.pos = tailPos;            // 排到队尾，从入口重新进入（tile 引用保留，不清空）
                }
            }
            this.layoutBelt(belt);
        }
    }

    // ────────────────────────── 内部 ──────────────────────────

    private step(belt: BeltRuntime): number {
        return belt.cellSize + belt.gap;
    }

    /** 连续位置 p（从入口 0 到出口 windowSize-1 的行进进度）→ 相对轨道中心坐标。 */
    private posToCoord(belt: BeltRuntime, p: number): number {
        const half = (belt.windowSize - 1) * this.step(belt) / 2;
        if (belt.horiz) {
            // 横版：left 从右往左流（入口在右）；right 反之
            return belt.direction === 'right' ? (-half + p * this.step(belt)) : (half - p * this.step(belt));
        }
        // 竖版：down 从上往下（入口在顶）；up 反之
        return belt.direction === 'up' ? (-half + p * this.step(belt)) : (half - p * this.step(belt));
    }

    private buildBelt(
        cfg: ConveyorConfig,
        resolveTile: (type: string, id: string) => TileRuntimeModel,
        horiz: boolean,
        edge: 'left' | 'right' | 'top' | 'bottom',
        index: number,
    ): void {
        const themeCfg = this.mechTheme?.conveyor;
        // v2.7：格子尺寸优先与棋盘 tile 保持一致（视觉统一），主题 cellSize 仅作无棋盘尺寸时的兜底；
        //   轨道整体宽度 trackThick = cellSize + gap 会随之自动变宽。
        const cellSize = this.boardTileSize ?? themeCfg?.cellSize ?? 96;
        const gap = themeCfg?.gap ?? 12;
        const windowSize = Math.max(1, cfg.windowSize || 7);
        const cellSpeedSec = Math.max(0.2, cfg.cellSpeedSec ?? 2);
        const dir = cfg.direction ?? (horiz ? 'left' : 'down');
        const inset = themeCfg?.leftInset ?? 18;

        // slots：一列 tile，各自带连续行进位置 pos（0=入口端，windowSize-1=出口端）。
        // tile 沿 pos 增大方向匀速前进，越过出口边缘后回收排到队尾、从入口重新进入（真循环，v2.8）。
        // 初始铺满可见窗口：第 0 个 tile 在出口端(pos=windowSize-1)，后续依次往入口排；
        // 超出窗口的 tile pos<0，排在入口外等待进入。
        const tiles: TileRuntimeModel[] = (cfg.types ?? []).map((type, i) =>
            resolveTile(type, `${cfg.id}_T${String(i + 1).padStart(3, '0')}`),
        );
        const slots: BeltSlot[] = tiles.map((t, i) => ({ tile: t, pos: (windowSize - 1 - i) }));

        // 轨道节点：竖版宽=cell、高=window*step；横版反之
        const trackThick = cellSize + gap;
        const trackLong = windowSize * (cellSize + gap) + gap;
        let trackX: number, trackY: number, w: number, h: number;
        const centerCross = (this.bandTop + this.bandBottom) / 2;         // 竖版横向无关；横版 y
        const centerMain = 0;                                             // 棋盘水平中心
        if (horiz) {
            w = trackLong; h = trackThick;
            trackX = centerMain;
            trackY = edge === 'top' ? (this.bandTop - trackThick / 2 - inset - index * (trackThick + 20))
                : (this.bandBottom + trackThick / 2 + inset + index * (trackThick + 20));
        } else {
            w = trackThick; h = trackLong;
            trackY = centerCross;
            trackX = edge === 'right' ? (this.bandRight - trackThick / 2 - inset - index * (trackThick + 28))
                : (this.bandLeft + trackThick / 2 + inset + index * (trackThick + 28));
        }
        const trackNode = createNode(this.node, `Belt_${cfg.id}`, trackX, trackY, w, h);
        trackNode.setSiblingIndex(60);

        const belt: BeltRuntime = {
            cfg, node: trackNode, horiz, edge, slots, windowSize, cellSize, gap,
            direction: dir, cellSpeedSec, tileNodes: new Map(), clickable: new Map(),
            w, h,
        };
        this.belts.push(belt);
        this.drawTrack(belt);
        this.layoutBelt(belt);
    }

    private drawTrack(belt: BeltRuntime): void {
        const themeCfg = this.mechTheme?.conveyor;
        drawRect(
            belt.node, belt.w, belt.h,
            colorFromHex(themeCfg?.beltColor ?? '#8C93A8', themeCfg?.beltAlpha ?? 255),
            colorFromHex(themeCfg?.beltStroke ?? '#5A6178', 255),
            themeCfg?.beltStrokeWidth ?? 4,
            Math.round(Math.min(belt.w, belt.h) / 2),
        );
    }

    /**
     * 每帧：slots 中落在显示区间的实体 tile 定位、可点；其余（含入口外排队/已回收到队尾）不建节点。
     * v2.8：入口显示阈值改为「与传送带背景重叠 ≥90%」才刷新出现——
     *   tile 覆盖入口格的比例 = 1+pos（pos∈[-1,0]时），要求 ≥0.9 即 pos ≥ -0.1
     *   （比旧版「重叠≥50%即显示」的 pos > -0.5 更晚出现，视觉上完全"埋"进背景才冒出来）。
     *   出口侧沿用对称的 90% 阈值（重叠跌破 10% 才消失，即 update() 里的 exitLimit=windowSize-0.9），
     *   故这里上限维持 win-0.5 即可（实际不会有 tile 停留在 [win-0.9, win-0.5) 区间被本函数看到，
     *   因为 update() 的回收判断先于本函数执行，一旦越过 exitLimit 就已被送去队尾）。
     */
    private layoutBelt(belt: BeltRuntime): void {
        const win = belt.windowSize;
        const present = new Set<string>();
        for (const slot of belt.slots) {
            const tile = slot.tile;
            if (!tile) continue;
            const p = slot.pos;
            if (p >= -0.1 && p < win - 0.5) {
                present.add(tile.id);
                let node = belt.tileNodes.get(tile.id);
                if (!node) { node = this.buildTileNode(belt, tile); belt.tileNodes.set(tile.id, node); }
                const c = this.posToCoord(belt, p);
                node.setPosition(belt.horiz ? new Vec3(c, 0, 0) : new Vec3(0, c, 0));
                belt.clickable.set(tile.id, true);
            }
        }
        belt.tileNodes.forEach((node, id) => {
            if (!present.has(id)) {
                if (node.isValid) node.destroy();
                belt.tileNodes.delete(id);
                belt.clickable.delete(id);
            }
        });
    }

    private buildTileNode(belt: BeltRuntime, tile: TileRuntimeModel): Node {
        const cellSize = belt.cellSize;
        const node = createNode(belt.node, `CTile_${tile.id}`, 0, 0, cellSize, cellSize);
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
        node.on(Node.EventType.TOUCH_END, () => this.onTapTile(belt, tile));
        return node;
    }

    private onTapTile(belt: BeltRuntime, tile: TileRuntimeModel): void {
        if (!belt.clickable.get(tile.id)) return;
        const slot = belt.slots.find((s) => s.tile?.id === tile.id);
        if (!slot) return;
        const node = belt.tileNodes.get(tile.id);
        if (!node || !node.isValid) return;
        const fromWorld = node.getWorldPosition();
        slot.tile = null;                      // ★该槽留空，不补位（其余 tile 继续朝出口流动）
        node.destroy();
        belt.tileNodes.delete(tile.id);
        belt.clickable.delete(tile.id);
        this.onPick?.(tile, fromWorld);
    }
}

interface BeltSlot {
    tile: TileRuntimeModel | null;
    /** 连续行进位置：0=入口端，windowSize-1=出口端。v2.8：超过出口后不丢弃，回收为负值排到队尾重新进入；
     *  tile 变 null 仅在玩家 tap 拾取时发生（onTapTile），代表永久移出传送带。 */
    pos: number;
}

interface BeltRuntime {
    cfg: ConveyorConfig;
    node: Node;
    horiz: boolean;
    edge: 'left' | 'right' | 'top' | 'bottom';
    slots: BeltSlot[];
    windowSize: number;
    cellSize: number;
    gap: number;
    direction: 'down' | 'up' | 'left' | 'right';
    cellSpeedSec: number;
    tileNodes: Map<TileId, Node>;
    clickable: Map<TileId, boolean>;
    w: number;
    h: number;
}
