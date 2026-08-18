import { _decorator, Button, Component, Label, Node, Sprite, UITransform, Vec3 } from 'cc';
import { LevelId } from '../../core/Types';
import { ProfileStore } from '../common/ProfileModal';
import { getMeowtileLevelBackground } from '../../config/level-themes/levelIconThemes';
import { ScreenAdapter } from '../common/ScreenAdapter';
import { UI_LAYOUT } from '../common/UILayoutConfig';
import {
    applyFredokaOneFont,
    bindPressScale,
    colorFromHex,
    createLabel,
    createNode,
    drawCircle,
    drawRect,
    loadSpriteFrameFromResources,
} from '../common/UiFactory';

const { ccclass } = _decorator;
const HOME_BACKGROUND_FALLBACK = 'newtheme/bg/chapter1/1';
const HOME_BG_WIDTH = 1242;
const HOME_BG_HEIGHT = 2340;
const HOME_LOGO = 'newtheme/logo';
const HOME_BUTTON = 'newtheme/button';
const HOME_STATUS_PAW = 'newtheme/status_paw';
const HOME_SETTINGS = 'newtheme/settings';
const HOME_ENTER_CHALLENGES = 'newtheme/enter_challenges';
const HOME_ENTER_COLLECTIONS = 'newtheme/enter_collections';
const HOME_PLAY_BUTTON_TEXT = 'START';
const HOME_PLAY_BUTTON_TEXT_FONT_SIZE = 54;
const HOME_PLAY_BUTTON_TEXT_LINE_HEIGHT = 60;
const HOME_PAWS_TEXT = 'Paws';
const HOME_PAWS_NUMBER_TEXT = '0';
export interface HomeHandlers {
    /** 点击地图按钮（左上） */
    onOpenMap: () => void;
    /** 点击设置齿轮（左上） */
    onOpenSettings: () => void;
    /** 点击中央大关卡按钮 */
    onPlay: (levelId: LevelId) => void;
    /** 点击 Collection，进入局外拼豆 meta 页 */
    onOpenCollections?: () => void;
    /** 点击商城（已从首页隐藏，保留接口兼容旧流程） */
    onShop?: () => void;
    /** v1.5：点击左下头像，打开个人信息弹窗 */
    onOpenProfile?: () => void;
}

/**
 * 首页视图（v1.5 必做 80%）：
 * 顶部：设置 / 地图
 * 中上：TILE EXPLORER 大 LOGO
 * 中下：大关卡按钮，显示当前关
 * 左下：玩家头像占位
 *
 * 0529 合并版：侧边卡片、每日种子暂不在首页展示。
 */
@ccclass('HomeView')
export class HomeView extends Component {
    private handlers: HomeHandlers | null = null;
    private currentLevelId: LevelId = 1;
    private homeBgSprite: Sprite | null = null;

    protected onEnable(): void {
        ScreenAdapter.onResize(this.handleResize, this);
    }

    protected onDisable(): void {
        ScreenAdapter.offResize(this.handleResize, this);
    }

    private editableLayoutBound = false;

    bind(handlers: HomeHandlers): void {
        this.handlers = handlers;
        this.node.active = true;
        if (this.hasEditableLayout()) {
            this.bindEditableLayout();
            return;
        }
        this.rebuild();
    }

    private handleResize = (): void => {
        if (!this.handlers || !this.node.activeInHierarchy) return;
        if (this.hasEditableLayout()) {
            this.applyHomeBackground(this.findEditableNode('HomeBg'));
            return;
        }
        this.rebuild();
    };

    private rebuild(): void {
        this.node.removeAllChildren();
        this.homeBgSprite = null;
        this.buildBackground();
        this.ensureHomeVisualLayers(false);
        this.bindDynamicHomeButtons();
        this.removeMapBookHotspot();
        this.buildVersion();
    }

    show(currentLevelId: LevelId): void {
        this.currentLevelId = Math.max(1, currentLevelId);
        this.node.active = true;
        this.applyHomeBackground(this.findEditableNode('HomeBg'));
    }

    hide(): void {
        this.node.active = false;
    }

    private hasEditableLayout(): boolean {
        return !!this.node.getChildByName('HomeBg')
            && !!this.node.getChildByName('PlayButton');
    }

    private findEditableNode(path: string): Node | null {
        return path.split('/').reduce<Node | null>((parent, name) => parent?.getChildByName(name) ?? null, this.node);
    }

    private bindEditableButton(path: string, onClick: () => void, pressedScale = 0.92): void {
        const node = this.findEditableNode(path);
        if (!node) return;
        if (!node.getComponent(Button)) node.addComponent(Button);
        if (!this.editableLayoutBound) {
            bindPressScale(node, pressedScale);
            node.on(Node.EventType.TOUCH_END, onClick);
        }
    }

    private bindEditableLayout(): void {
        this.homeBgSprite = this.findEditableNode('HomeBg')?.getComponent(Sprite) ?? null;
        this.applyHomeBackground(this.findEditableNode('HomeBg'));
        this.ensureHomeVisualLayers(true);
        this.bindEditableButton('PlayButton', () => this.handlers?.onPlay(this.currentLevelId), 0.94);
        this.bindEditableButton('HomeSettings', () => this.handlers?.onOpenSettings(), 0.9);
        this.bindEditableButton('EnterCollections', () => this.handlers?.onOpenCollections?.(), 0.92);
        this.bindEditableButton('EnterChallenges', () => this.toast('Challenges coming soon'), 0.92);
        this.bindEditableButton('StatusPaw', () => this.handlers?.onOpenProfile?.(), 0.92);
        this.removeMapBookHotspot();
        this.editableLayoutBound = true;
    }

    private removeMapBookHotspot(): void {
        this.findEditableNode('MapBookHotspot')?.destroy();
    }

    private applyHomeBackground(node: Node | null): void {
        if (!node) return;
        const size = ScreenAdapter.fullSize();
        const aspect = HOME_BG_WIDTH / HOME_BG_HEIGHT;
        const coverWidth = Math.max(size.width, size.height * aspect);
        const coverHeight = Math.max(size.height, size.width / aspect);
        const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
        transform.setContentSize(coverWidth, coverHeight);
        const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.homeBgSprite = sprite;
        const bgPath = getMeowtileLevelBackground(this.currentLevelId) ?? HOME_BACKGROUND_FALLBACK;
        loadSpriteFrameFromResources(bgPath, (frame) => {
            if (frame && sprite.node.isValid) sprite.spriteFrame = frame;
        });
    }

    private ensureImageLayer(name: string, path: string, x: number, y: number, width: number, height: number, preserveExisting = true): Node {
        let node = this.findEditableNode(name);
        const created = !node;
        if (!node) {
            node = createNode(this.node, name, x, y, width, height);
        }
        node.active = true;
        if (created || !preserveExisting) {
            node.setPosition(x, y, 0);
            const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
            transform.setContentSize(width, height);
        }
        const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;
        loadSpriteFrameFromResources(path, (frame) => {
            if (frame && sprite.node.isValid) sprite.spriteFrame = frame;
        });
        return node;
    }

    private ensureHomeVisualLayers(preserveExisting = true): void {
        this.ensureImageLayer('HomeLogo', HOME_LOGO, 0, 820, 700, 126, preserveExisting);
        this.ensureImageLayer('StatusPaw', HOME_STATUS_PAW, -275, 950, 300, 98, preserveExisting);
        this.ensurePawsTextLayers(preserveExisting);
        this.ensureImageLayer('HomeSettings', HOME_SETTINGS, UI_LAYOUT.shared.settingsIcon.x, UI_LAYOUT.shared.settingsIcon.y, UI_LAYOUT.shared.settingsIcon.size, UI_LAYOUT.shared.settingsIcon.size, preserveExisting);
        this.ensureImageLayer('PlayButton', HOME_BUTTON, 0, -730, 500, 171, preserveExisting);
        this.ensurePlayButtonText(preserveExisting);
        this.ensureImageLayer('EnterChallenges', HOME_ENTER_CHALLENGES, -250, -255, 220, 222, preserveExisting);
        this.ensureImageLayer('EnterCollections', HOME_ENTER_COLLECTIONS, 250, -255, 220, 222, preserveExisting);
    }

    private ensureTextLayer(name: string, text: string, x: number, y: number, width: number, height: number, fontSize: number, lineHeight: number, preserveExisting = true): void {
        let node = this.findEditableNode(name);
        const created = !node;
        if (!node) {
            node = createNode(this.node, name, x, y, width, height);
        }
        node.active = true;
        if (created || !preserveExisting) {
            node.setPosition(x, y, 0);
            const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
            transform.setContentSize(width, height);
        }
        const label = node.getComponent(Label) ?? node.addComponent(Label);
        if (created || !preserveExisting) {
            label.string = text;
            applyFredokaOneFont(label);
            label.fontSize = fontSize;
            label.lineHeight = lineHeight;
            label.color = colorFromHex('#7A4A2A');
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            label.overflow = Label.Overflow.CLAMP;
            label.enableWrapText = false;
            label.isBold = true;
        }
    }

    private ensurePawsTextLayers(preserveExisting = true): void {
        this.ensureTextLayer('pawstext', HOME_PAWS_TEXT, -255, 965, 170, 38, 28, 34, preserveExisting);
        this.ensureTextLayer('pawsnumbers', HOME_PAWS_NUMBER_TEXT, -255, 928, 170, 38, 30, 36, preserveExisting);
    }

    private ensurePlayButtonText(preserveExisting = true): void {
        const playButton = this.findEditableNode('PlayButton');
        const playTransform = playButton?.getComponent(UITransform) ?? null;
        const width = Math.max(1, playTransform?.contentSize.width ?? 500);
        const height = Math.max(1, playTransform?.contentSize.height ?? 171);
        let node = this.findEditableNode('PlayButtonText');
        const created = !node;
        if (!node) {
            node = createNode(this.node, 'PlayButtonText', playButton?.position.x ?? 0, playButton?.position.y ?? -730, Math.round(width * 0.72), Math.round(height * 0.56));
        }
        node.active = true;
        if (created || !preserveExisting) {
            node.setPosition(playButton?.position.x ?? 0, playButton?.position.y ?? -730, 0);
            const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
            transform.setContentSize(Math.round(width * 0.72), Math.round(height * 0.56));
        }
        const label = node.getComponent(Label) ?? node.addComponent(Label);
        if (created || !preserveExisting) {
            label.string = HOME_PLAY_BUTTON_TEXT;
            applyFredokaOneFont(label);
            label.fontSize = HOME_PLAY_BUTTON_TEXT_FONT_SIZE;
            label.lineHeight = HOME_PLAY_BUTTON_TEXT_LINE_HEIGHT;
            label.color = colorFromHex('#FFF8E8');
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
            label.overflow = Label.Overflow.CLAMP;
            label.isBold = true;
        }
    }

    private bindDynamicHomeButtons(): void {
        this.bindEditableButton('PlayButton', () => this.handlers?.onPlay(this.currentLevelId), 0.94);
        this.bindEditableButton('HomeSettings', () => this.handlers?.onOpenSettings(), 0.9);
        this.bindEditableButton('EnterCollections', () => this.handlers?.onOpenCollections?.(), 0.92);
        this.bindEditableButton('EnterChallenges', () => this.toast('Challenges coming soon'), 0.92);
        this.bindEditableButton('StatusPaw', () => this.handlers?.onOpenProfile?.(), 0.92);
    }

    private refreshEditableAvatar(): boolean {
        const sprite = this.findEditableNode('PlayerAvatar/AvatarInner')?.getComponent(Sprite);
        if (!sprite) return false;
        const profile = ProfileStore.load();
        loadSpriteFrameFromResources(profile.avatar, (frame) => {
            if (frame && sprite.node.isValid) sprite.spriteFrame = frame;
        });
        return true;
    }

    /** 新主题首页不再展示头像；保留接口兼容 Profile 弹窗关闭回调。 */
    refreshAvatar(): void {
        // no-op
    }

    // ----- 背景：按当前关卡切换 backgrounds/chapterX/Y.png -----
    private buildBackground(): void {
        const bg = createNode(this.node, 'HomeBg', 0, 0, 1, 1);
        bg.setSiblingIndex(0);
        this.applyHomeBackground(bg);
    }

    // ----- 左下：玩家头像（默认鹦鹉，可在 Profile 弹窗切换）-----
    private buildAvatar(): void {
        const cfg = UI_LAYOUT.home.avatar;
        const node = createNode(this.node, 'PlayerAvatar', ScreenAdapter.leftX(cfg.leftInset), ScreenAdapter.bottomY(cfg.bottomInset), cfg.width, cfg.height);
        node.setScale(new Vec3(cfg.scale, cfg.scale, 1));
        node.addComponent(Button);
        bindPressScale(node, 0.92);
        node.on(Node.EventType.TOUCH_END, () => {
            this.handlers?.onOpenProfile?.() ?? this.toast('个人信息功能开发中');
        });
        const radius = cfg.width * 0.45;
        drawCircle(createNode(node, 'AvatarShadow', 0, -Math.max(1, Math.round(cfg.height * 0.03))), radius, colorFromHex('#1F2A50', 130));
        drawCircle(node, radius, colorFromHex('#FFFFFF', 240), colorFromHex('#A6B4D6'), Math.max(1, Math.round(cfg.width * 0.03)));
        const innerSize = cfg.width * 0.82;
        const inner = createNode(node, 'AvatarInner', 0, 0, innerSize, innerSize);
        const sp = inner.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        const profile = ProfileStore.load();
        loadSpriteFrameFromResources(profile.avatar, (frame) => {
            if (frame) sp.spriteFrame = frame;
        });
    }

    // ----- 左下：版本号 -----
    private buildVersion(): void {
        // 版本号+帧率已移至 AppFlowController 全局浮层
    }

    // ----- 首页顶部图片按钮 -----
    private makeRoundIconButton(name: string, x: number, y: number, iconPath: string, onClick: () => void, scale = 1): Node {
        const size = UI_LAYOUT.home.topBar.buttonSize;
        const node = createNode(this.node, name, x, y, size, size);
        node.setScale(new Vec3(scale, scale, 1));
        node.addComponent(Button);
        bindPressScale(node, 0.9);
        node.on(Node.EventType.TOUCH_END, onClick);

        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources(iconPath, (frame) => {
            if (frame) sprite.spriteFrame = frame;
        });
        return node;
    }

    private toast(text: string): void {
        const node = createNode(this.node, 'HomeToast', 0, 200, 600, 100);
        drawRect(node, 600, 100, colorFromHex('#1F2A50', 220), colorFromHex('#FFFFFF', 200), 2, 24);
        createLabel(node, 'Text', text, 0, 0, 36, colorFromHex('#FFFFFF'), 600, 100);
        setTimeout(() => {
            if (node.isValid) node.destroy();
        }, 1500);
    }
}
