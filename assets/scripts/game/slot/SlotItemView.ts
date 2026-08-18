import { _decorator, Component, Sprite, SpriteFrame } from 'cc';
import { GAME_CONFIG } from '../../core/Constants';
import { MechanicEffectConfig } from '../../data/models/LevelThemeModel';
import { TileRuntimeModel } from '../../data/models/TileModel';
import { UI_LAYOUT } from '../../ui/common/UILayoutConfig';
import { colorFromHex, createLabel, createNode, drawRect, ensureTransform, loadSpriteFrameFromResources } from '../../ui/common/UiFactory';

const { ccclass } = _decorator;

const SLOT_TILE_BASE_WIDTH = 1295;
const SLOT_TILE_BASE_HEIGHT = 1383;
const SLOT_TILE_VISUAL_HEIGHT_SCALE = SLOT_TILE_BASE_HEIGHT / SLOT_TILE_BASE_WIDTH;
const SLOT_ICON_CONTAIN_SCALE = 0.78;

@ccclass('SlotItemView')
export class SlotItemView extends Component {
    setup(tile: TileRuntimeModel, cellSize?: number, tileBasePath?: string, mechanicsTheme?: MechanicEffectConfig): void {
        this.node.removeAllChildren();
        const size = cellSize !== undefined ? cellSize : GAME_CONFIG.tileWidth;
        const visualHeight = Math.round(size * SLOT_TILE_VISUAL_HEIGHT_SCALE);
        ensureTransform(this.node, size, visualHeight);
        const isGolden = tile.golden === true;
        const goldenCfg = mechanicsTheme?.golden;

        const fallbackFace = createNode(this.node, 'FallbackFace', 0, 0, size, visualHeight);
        const bgFill = isGolden ? colorFromHex(goldenCfg?.fallbackFill ?? '#FFE082') : colorFromHex('#FFFDF8');
        const bgStroke = isGolden ? colorFromHex(goldenCfg?.fallbackStroke ?? '#FF9800', 220) : colorFromHex('#687189', 140);
        const strokeW = isGolden ? 4 : 2;
        drawRect(fallbackFace, size, visualHeight, bgFill, bgStroke, strokeW, Math.round(size * 0.18));

        if (!isGolden && tileBasePath) {
            const baseNode = createNode(this.node, 'BaseSprite', 0, 0, size, visualHeight);
            const baseSprite = baseNode.addComponent(Sprite);
            baseSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            loadSpriteFrameFromResources(tileBasePath, (frame) => {
                if (!frame || !baseSprite.isValid) return;
                baseSprite.spriteFrame = frame;
                if (fallbackFace.isValid) fallbackFace.destroy();
            });
        }

        const iconSize = Math.round(size * SLOT_ICON_CONTAIN_SCALE);
        const iconNode = createNode(this.node, 'IconSprite', 0, 2, iconSize, iconSize);
        const sprite = iconNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const fallback = createLabel(this.node, 'IconFallback', tile.icon, 0, 0, Math.round(size * 0.4),
            colorFromHex('#24313A'), size, size);
        fallback.node.active = false;
        if (tile.iconAsset) {
            loadSpriteFrameFromResources(tile.iconAsset, (frame) => {
                if (!frame) return;
                this.applySpriteFrameContain(sprite, frame, iconSize, iconSize);
                sprite.node.active = true;
                fallback.node.active = false;
            });
        }
    }

    private applySpriteFrameContain(sprite: Sprite, frame: SpriteFrame, maxWidth: number, maxHeight: number): void {
        sprite.spriteFrame = frame;
        const original = frame.originalSize;
        const sourceWidth = Math.max(1, original.width || maxWidth);
        const sourceHeight = Math.max(1, original.height || maxHeight);
        const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
        ensureTransform(sprite.node, sourceWidth * scale, sourceHeight * scale);
    }
}
