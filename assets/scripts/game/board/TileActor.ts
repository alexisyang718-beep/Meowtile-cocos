import { _decorator, Component, Graphics, Label, Node, Sprite, SpriteFrame, tween, Vec3 } from 'cc';
import { GAME_CONFIG } from '../../core/Constants';
import { MechanicEffectConfig } from '../../data/models/LevelThemeModel';
import { TileRuntimeModel } from '../../data/models/TileModel';
import { colorFromHex, createLabel, createNode, drawRect, ensureTransform, loadSpriteFrameFromResources } from '../../ui/common/UiFactory';

const { ccclass } = _decorator;

const TILE_BASE_SOURCE_WIDTH = 136;
const TILE_BASE_SOURCE_HEIGHT = 151;
const TILE_MAIN_SOURCE_SIZE = 136;
const TILE_VISUAL_HEIGHT_SCALE = TILE_BASE_SOURCE_HEIGHT / TILE_BASE_SOURCE_WIDTH;
const TILE_MAIN_CENTER_OFFSET_SCALE = (TILE_BASE_SOURCE_HEIGHT - TILE_MAIN_SOURCE_SIZE) / TILE_BASE_SOURCE_WIDTH / 2;
/** 普通图标相对 tile 尺寸的收纳比例：底座内圆角面板可用区约 0.62，保证图标完全装进底座内 */
const TILE_ICON_CONTAIN_SCALE = 0.62;

@ccclass('TileActor')
export class TileActor extends Component {
    private tile: TileRuntimeModel | null = null;
    private label: Label | null = null;
    private iconSprite: Sprite | null = null;
    private baseSprite: Sprite | null = null;
    private fallbackBg: Graphics | null = null;
    private faceNode: Node | null = null;
    private currentMainSize = GAME_CONFIG.tileWidth;
    private currentMainCenterY = 0;
    /** v1.5.3: 覆盖遮罩节点（covered=true 时显示 ?） */
    private coverNode: Node | null = null;
    /** v1.5.3: 金色光晕节点 */
    private goldenAura: Node | null = null;
    private mechanicsTheme: MechanicEffectConfig | null = null;
    /**
     * v1.5.5：是否处于飞行动效中。
     * 飞行 0.35s 期间，BoardManager 可能因其他 tile 被点而调用 refreshActors，
     * 进而调用本 actor 的 refreshView()，把 selected=true 的本 tile 节点 active 设为 false，
     * 导致玩家看到"前一个 tile 没飞完就消失"。
     * 飞行中跳过 refreshView 的状态切换，飞行结束后再统一刷一次。
     */
    private flying = false;

    setup(tile: TileRuntimeModel, onTap?: (tile: TileRuntimeModel) => void, tileBasePath?: string, tileSize?: number, mechanicsTheme?: MechanicEffectConfig): void {
        this.tile = tile;
        this.mechanicsTheme = mechanicsTheme ?? null;
        this.node.removeAllChildren();
        const size = tileSize ?? GAME_CONFIG.tileWidth;
        const visualHeight = size * TILE_VISUAL_HEIGHT_SCALE;
        const baseCenterY = -size * TILE_MAIN_CENTER_OFFSET_SCALE;
        this.currentMainSize = size;
        this.currentMainCenterY = 0;
        ensureTransform(this.node, size + 16, visualHeight + 16);

        // faceNode 容器：底图按 136×151 显示，主体交互/图标区域仍按 136×136 对齐
        this.faceNode = createNode(this.node, 'Face', 0, 0, size, visualHeight);

        // 兜底白底（base sprite 没加载前显示，加载成功后销毁）
        const fbNode = createNode(this.faceNode, 'FallbackBg', 0, 0, size, size);
        this.fallbackBg = fbNode.getComponent(Graphics) ?? fbNode.addComponent(Graphics);
        const goldenCfg = mechanicsTheme?.golden;
        const bgFill = tile.golden ? colorFromHex(goldenCfg?.fallbackFill ?? '#FFD700') : colorFromHex('#FFFDF8');
        const bgStroke = tile.golden ? colorFromHex(goldenCfg?.fallbackStroke ?? '#FF6F00', 255) : colorFromHex('#687189', 150);
        const bgStrokeW = tile.golden ? 5 : 2;
        drawRect(fbNode, size, size, bgFill, bgStroke, bgStrokeW, Math.round(size * 0.2));

        // 底板 sprite：保持素材 136×151 原比例，不再压成正方形
        const baseNode = createNode(this.faceNode, 'BaseSprite', 0, baseCenterY, size, visualHeight);
        this.baseSprite = baseNode.addComponent(Sprite);
        this.baseSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        // v7.17：金色 tile 也加载普通底板贴图，统一视觉大小（保留 goldenAura 星星作为唯一标识）
        this.loadBase(tileBasePath, fbNode);

        // 图标：普通瓷砖显示内部 icon；金色星星瓷砖使用整张固定样式图。
        const iconSize = Math.round(tile.golden ? size + 4 : size * TILE_ICON_CONTAIN_SCALE);
        const iconNode = createNode(this.faceNode, 'IconSprite', 0, tile.golden ? this.currentMainCenterY : 2, iconSize, iconSize);
        this.iconSprite = iconNode.addComponent(Sprite);
        this.iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;

        // 文字兜底
        const labelSize = Math.round(size * 0.43);
        this.label = createLabel(this.faceNode, 'IconFallback', tile.icon, 0, 2, labelSize, colorFromHex('#24313A'), size, size);
        this.label.node.active = false;

        this.loadIcon(tile);

        // v1.5.3: 金色光晕（小星标）；使用固定星星素材时可通过 star='' 关闭角标。
        const goldenStar = goldenCfg?.star ?? '⭐';
        const starScale = goldenCfg?.starScale ?? 0.32;
        if (tile.golden && goldenStar && starScale > 0) {
            this.goldenAura = createNode(this.faceNode, 'GoldenStar',
                size * 0.32, size * 0.32, Math.round(size * 0.35), Math.round(size * 0.35));
            createLabel(this.goldenAura, 'star', goldenStar, 0, 0, Math.round(size * starScale),
                colorFromHex('#FFFFFF'), size * 0.4, size * 0.4);
        }

        // v1.5.3: 覆盖遮罩（covered=true 时盖一层 "?" ）
        if (tile.covered) {
            this.buildCoverMask(size);
        }

        this.refreshView();

        // 关键: 注册 Cocos 原生 Touch 事件作为主输入源
        // 之前 _onTap 参数被忽略导致从未注册, 玩家只能依赖 DOM canvas pointerup fallback,
        // 后者在 preview iframe 中会因 focus/pointer-capture 偶尔丢失 → 表现为"点了几下卡死"
        if (onTap) {
            this.node.on(Node.EventType.TOUCH_END, () => {
                if (this.tile && this.tile.clickable && !this.tile.removed && !this.tile.selected) {
                    onTap(this.tile);
                }
            });
        }
    }

    /** v1.5.3: 创建覆盖遮罩 —— 必须 100% 不透明，不能透出底下图标 */
    private buildCoverMask(size: number): void {
        if (!this.faceNode) return;
        if (this.coverNode && this.coverNode.isValid) return;
        this.applyCoverVisibility(true);
        const coverSize = size + 4;
        const coverCfg = this.mechanicsTheme?.cover;
        this.coverNode = createNode(this.faceNode, 'CoverMask', 0, this.currentMainCenterY, coverSize, coverSize);

        const coverSprite = this.coverNode.addComponent(Sprite);
        coverSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const coverPath = coverCfg?.iconAsset ?? 'art/tile/question';
        loadSpriteFrameFromResources(coverPath, (frame) => {
            if (!frame || !this.coverNode?.isValid) return;
            this.applySpriteFrameContain(coverSprite, frame, coverSize, coverSize);
        });
        this.coverNode.setSiblingIndex(99);
    }

    private applyCoverVisibility(covered: boolean): void {
        if (this.iconSprite) this.iconSprite.node.active = !covered && Boolean(this.iconSprite.spriteFrame);
        if (this.label) this.label.node.active = false;
        if (this.goldenAura) this.goldenAura.active = !covered;
    }

    /** v1.5.3: 揭开/重盖覆盖遮罩 */
    setCovered(covered: boolean): void {
        if (!this.tile) return;
        this.tile.covered = covered;
        if (covered) {
            this.buildCoverMask(this.currentMainSize);
        } else if (this.coverNode && this.coverNode.isValid) {
            const oldCover = this.coverNode;
            this.coverNode = null;
            tween(oldCover).to(0.18, { scale: new Vec3(1.15, 1.15, 1) })
                .to(0.14, { scale: new Vec3(0, 0, 1) })
                .call(() => {
                    oldCover.destroy();
                    this.applyCoverVisibility(false);
                }).start();
        } else {
            this.applyCoverVisibility(false);
        }
    }

    setClickable(clickable: boolean): void {
        if (!this.tile) return;
        this.tile.clickable = clickable;
    }

    playPickFeedback(onDone: () => void): void {
        tween(this.node)
            .to(0.06, { scale: new Vec3(1.08, 1.08, 1) })
            .to(0.12, { scale: new Vec3(0.18, 0.18, 1) })
            .call(onDone)
            .start();
    }

    /**
     * v1.5.2：卡牌飞入槽位贝塞尔动画（来自同事 feat/ui，源自 TileTripGameReal.flyToSlot）
     * - 起点：tile 当前世界坐标
     * - 中点：起终点连线中点 + 上升 120px（抛物线）
     * - 终点：目标槽位世界坐标
     * - 时长 0.35s，旋转 180° + 缩放过渡到 0.78（≈槽内尺寸）
     */
    playFlyToSlot(endWorld: Vec3, onDone: () => void): void {
        const startWorld = this.node.getWorldPosition().clone();
        if (Number.isNaN(startWorld.x) || Number.isNaN(endWorld.x)) {
            onDone();
            return;
        }
        // v1.5.5：进入飞行态，期间不接受 refreshView 的 active/scale 状态切换
        this.flying = true;
        // v1.5.5：飞入过程置顶层级，避免被棋盘上其他 tile 遮挡
        this.node.setSiblingIndex(99999);
        const startScale = this.node.scale.x;
        const targetScale = 0.78;
        const startRot = this.node.angle;
        const duration = 0.22;
        const midX = (startWorld.x + endWorld.x) / 2;
        const midY = Math.max(startWorld.y, endWorld.y) + 120;
        let t = 0;
        const updater = (dt: number) => {
            if (!this.node || !this.node.isValid) {
                this.unschedule(updater);
                return;
            }
            t += dt / duration;
            if (t > 1) t = 1;
            const x = (1 - t) * (1 - t) * startWorld.x + 2 * (1 - t) * t * midX + t * t * endWorld.x;
            const y = (1 - t) * (1 - t) * startWorld.y + 2 * (1 - t) * t * midY + t * t * endWorld.y;
            this.node.setWorldPosition(x, y, 0);
            this.node.angle = startRot + t * 180;
            const s = startScale + (targetScale - startScale) * t;
            this.node.setScale(s, s, 1);
            if (t >= 1) {
                this.node.angle = 0;
                this.node.setWorldPosition(endWorld);
                this.node.setScale(targetScale, targetScale, 1);
                this.unschedule(updater);
                this.flying = false;  // v1.5.5：退出飞行态，恢复 refreshView 控制
                onDone();
            }
        };
        this.schedule(updater, 0);
    }

    refreshView(): void {
        if (!this.tile) return;
        // v1.5.5：飞行中跳过状态切换，避免在贝塞尔过程中被其他 tile 的 refreshActors 误切 active/scale
        if (this.flying) return;
        this.node.active = !this.tile.removed && !this.tile.selected;
        if (!this.node.active) return;
        if (this.label) this.label.string = this.tile.icon;
        this.applyCoverVisibility(this.tile.covered === true);
        this.node.setScale(1, 1, 1);
    }

    private loadBase(basePath: string | undefined, fallbackNode: Node): void {
        if (!basePath || !this.baseSprite) return;
        loadSpriteFrameFromResources(basePath, (frame) => {
            if (!frame || !this.baseSprite) return;
            this.baseSprite.spriteFrame = frame;
            // base 加载成功 → 销毁白底兜底，避免透明边露出白色
            if (fallbackNode && fallbackNode.isValid) {
                fallbackNode.destroy();
            }
        });
    }

    private applySpriteFrameContain(sprite: Sprite, frame: SpriteFrame, maxWidth: number, maxHeight: number): void {
        sprite.spriteFrame = frame;
        const original = frame.originalSize;
        const sourceWidth = Math.max(1, original.width || maxWidth);
        const sourceHeight = Math.max(1, original.height || maxHeight);
        const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
        ensureTransform(sprite.node, sourceWidth * scale, sourceHeight * scale);
    }

    /** v5：shuffle 后调用，重新加载图标 + 更新 label */
    reloadAfterShuffle(tile: TileRuntimeModel): void {
        this.tile = tile;
        if (this.label) this.label.string = tile.icon;
        // 先清空旧 spriteFrame，新加载完成后再赋值（避免新 icon 加载慢时显示旧图）
        if (this.iconSprite) {
            this.iconSprite.spriteFrame = null;
            this.iconSprite.node.active = false;
            if (this.label) this.label.node.active = false;
        }
        this.loadIcon(tile);
    }

    private loadIcon(tile: TileRuntimeModel): void {
        const iconAsset = tile.golden ? this.mechanicsTheme?.golden?.iconAsset ?? tile.iconAsset : tile.iconAsset;
        if (!iconAsset || !this.iconSprite) return;
        loadSpriteFrameFromResources(iconAsset, (frame) => {
            if (!frame || !this.iconSprite) return;
            const maxIconSize = tile.golden ? this.currentMainSize + 4 : this.currentMainSize * TILE_ICON_CONTAIN_SCALE;
            this.applySpriteFrameContain(this.iconSprite, frame, maxIconSize, maxIconSize);
            this.iconSprite.node.active = this.tile?.covered !== true;
            if (this.label) this.label.node.active = false;
        });
    }
}
