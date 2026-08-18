import { _decorator, Button, Component, Label, Node, Sprite, UITransform, Vec3 } from 'cc';
import { BoosterType, TileId } from '../../core/Types';
import { ProgressRepository } from '../../data/repositories/ProgressRepository';
import { GameSnapshot } from '../../game/flow/GameSession';
import { ScreenAdapter } from '../common/ScreenAdapter';
import { UI_LAYOUT } from '../common/UILayoutConfig';
import { applyFredokaOneFont, bindPressScale, colorFromHex, createLabel, createNode, drawCircle, drawRect, GAME_FONT_FAMILY, loadSpriteFrameFromResources, playComboLabel } from '../common/UiFactory';

const { ccclass } = _decorator;

const HUD_FONT_FAMILY = GAME_FONT_FAMILY;
const NEW_THEME_BACK_ICON = 'newtheme/back';
const NEW_THEME_SETTINGS_ICON = 'newtheme/settings';

const BOOSTER_ICON_NAMES: Record<BoosterType, string> = {
    undo: 'undo',
    hint: 'hint',
    shuffle: 'shuffle',
};

/**
 * 调试用关卡下拉选择开关。上线前置 false。
 * true 时，点击 HUD 关卡文字打开关卡选择下拉，不再显示左右切关按钮。
 */
const DEBUG_LEVEL_DROPDOWN = false;
/** 调试跳关上界（正式关卡 1-320） */
const DEBUG_LEVEL_MAX = 320;

type LevelChapterGroup = {
    name: string;
    range: [number, number];
    icon: string;
};

const LEVEL_CHAPTER_GROUPS: LevelChapterGroup[] = [
    { name: '窗边出发', range: [1, 12], icon: '🐱' },
    { name: '猫咖停留', range: [13, 80], icon: '☕' },
    { name: '雨后街角', range: [81, 160], icon: '🌧️' },
    { name: '海边旅行', range: [161, 240], icon: '🌊' },
    { name: '雪山小屋', range: [241, 320], icon: '🏔️' },
];

export interface HudHandlers {
    onBack: () => void;
    onRestart: () => void;
    onTileDebugSelect?: (tileId: TileId) => void;
    onBooster: (type: BoosterType) => void;
    /** 调试：从关卡下拉里跳到指定关卡（DEBUG_LEVEL_DROPDOWN=true 时使用） */
    onGotoLevel?: (levelId: number) => void;
    /** v1.5：点击设置齿轮（暂占位，弹"敬请期待"提示） */
    onSetting?: () => void;
}

@ccclass('HudView')
export class HudView extends Component {
    private titleLabel: Label | null = null;
    private comboLabel: Label | null = null;
    private boosterLabels: Partial<Record<BoosterType, Label>> = {};
    private boosterBadgeNodes: Partial<Record<BoosterType, Node>> = {};
    private boosterBadgeModes: Partial<Record<BoosterType, 'count' | 'price'>> = {};
    private boosterButtons: Partial<Record<BoosterType, Node>> = {};
    private boosterIconPaths: Partial<Record<BoosterType, string>> = {};
    private handlers: HudHandlers | null = null;
    private currentLevelId = 1;
    private prevArrow: Node | null = null;
    private nextArrow: Node | null = null;
    private lastSnapshot: GameSnapshot | null = null;
    private editableLayoutBound = false;
    /** 跳关弹窗根节点（打开时存在，关闭时销毁） */
    private levelPickerNode: Node | null = null;
    /** 跳关弹窗当前页（0-based） */
    private pickerPage = 0;
    /** 下拉框当前章节索引 */
    private pickerChapterIndex = 0;

    protected onEnable(): void {
        ScreenAdapter.onResize(this.handleResize, this);
    }

    protected onDisable(): void {
        ScreenAdapter.offResize(this.handleResize, this);
    }

    bind(handlers: HudHandlers): void {
        this.handlers = handlers;
        if (this.hasEditableLayout()) {
            this.bindEditableLayout(handlers);
            return;
        }
        this.rebuild(handlers);
    }

    private handleResize = (): void => {
        if (!this.handlers || !this.node.activeInHierarchy) return;
        if (!this.hasEditableLayout()) {
            this.rebuild(this.handlers);
        }
        if (this.lastSnapshot) this.updateSnapshot(this.lastSnapshot);
    };

    private rebuild(handlers: HudHandlers): void {
        this.node.removeAllChildren();
        this.boosterLabels = {};
        this.boosterBadgeNodes = {};
        this.boosterBadgeModes = {};
        this.boosterButtons = {};
        this.boosterIconPaths = {};
        this.prevArrow = null;
        this.nextArrow = null;
        this.createTopBar(handlers);
        this.createComboLabel();
        this.createBottomBoosters(handlers.onBooster);
    }

    updateSnapshot(snapshot: GameSnapshot): void {
        this.lastSnapshot = snapshot;
        this.currentLevelId = snapshot.levelId ?? 1;
        if (this.titleLabel) this.titleLabel.string = `Level ${this.currentLevelId}`;
        (Object.keys(snapshot.boosters) as BoosterType[]).forEach((type) => {
            const count = snapshot.boosters[type] ?? 0;
            const mode = this.boosterBadgeModes[type];
            const label = this.boosterLabels[type];
            this.updateBoosterIcon(type, count);
            if (count > 0 && mode === 'count' && label) {
                label.string = String(count);
            } else if (count <= 0 && mode === 'price') {
                // 库存为0时保持价格角标，不用每次刷新
            } else {
                this.refreshBoosterBadge(type, count);
            }
        });
        // 切关已改为点击标题打开下拉，不再通过左右箭头切换。
        if (this.prevArrow) this.prevArrow.active = false;
        if (this.nextArrow) this.nextArrow.active = false;
    }

    private hasEditableLayout(): boolean {
        return !!this.node.getChildByName('BackBtn')
            && !!this.node.getChildByName('undoButton')
            && !!this.node.getChildByName('hintButton')
            && !!this.node.getChildByName('shuffleButton');
    }

    private findEditableNode(path: string): Node | null {
        return path.split('/').reduce<Node | null>((parent, name) => parent?.getChildByName(name) ?? null, this.node);
    }

    private bindEditableButton(path: string, onClick: () => void, pressedScale = 0.9): Node | null {
        const node = this.findEditableNode(path);
        if (!node) return null;
        if (!node.getComponent(Button)) node.addComponent(Button);
        if (!this.editableLayoutBound) {
            bindPressScale(node, pressedScale);
            node.on(Node.EventType.TOUCH_END, onClick);
        }
        return node;
    }

    private bindEditableLayout(handlers: HudHandlers): void {
        this.boosterLabels = {};
        this.boosterBadgeNodes = {};
        this.boosterBadgeModes = {};
        this.boosterButtons = {};
        this.boosterIconPaths = {};
        this.titleLabel = this.findEditableNode('Title')?.getComponent(Label) ?? null;
        this.comboLabel = this.findEditableNode('ComboFx/ComboText')?.getComponent(Label) ?? null;

        // 点击关卡标题打开下拉选择（调试开关开启时）
        if (DEBUG_LEVEL_DROPDOWN) {
            this.bindEditableButton('Title', () => this.toggleLevelDropdown(), 0.94);
        }

        this.bindEditableButton('BackBtn', () => handlers.onBack(), 0.9);
        this.bindEditableButton('SettingBtn', () => handlers.onSetting ? handlers.onSetting() : this.showToast('设置功能敬请期待'), 0.9);
        this.prevArrow = this.findEditableNode('LevelPrev');
        this.nextArrow = this.findEditableNode('LevelNext');
        if (this.prevArrow) this.prevArrow.active = false;
        if (this.nextArrow) this.nextArrow.active = false;

        (['undo', 'hint', 'shuffle'] as BoosterType[]).forEach((type) => {
            const button = this.bindEditableButton(`${type}Button`, () => handlers.onBooster(type), 0.9);
            if (button) {
                this.boosterButtons[type] = button;
                this.refreshBoosterBadge(type, this.getCurrentBoosterCount(type));
            }
        });
        this.editableLayoutBound = true;
    }

    /** 屏幕中央 Combo 弹幕 */
    showCombo(text: string): void {
        if (this.comboLabel) playComboLabel(this.comboLabel, text);
    }

    // ----------------- 顶部 HUD -----------------

    private createTopBar(handlers: HudHandlers): void {
        const cfg = UI_LAYOUT.hud.topBar;
        const topY = ScreenAdapter.topY(cfg.topInset);
        const backX = ScreenAdapter.leftX(cfg.leftInset);

        this.createHudIconButton('BackBtn', backX, topY, NEW_THEME_BACK_ICON, () => handlers.onBack(), cfg.iconScale);
        const settings = UI_LAYOUT.shared.settingsIcon;
        this.createHudIconButton('SettingBtn', settings.x, settings.y, NEW_THEME_SETTINGS_ICON,
            () => handlers.onSetting ? handlers.onSetting() : this.showToast('设置功能敬请期待'), 1, settings.size);

        // 中间关卡文字
        this.titleLabel = createLabel(this.node, 'Title', 'Level 1', 0, topY + 2, cfg.titleFontSize, colorFromHex('#7A3B12'), cfg.titleWidth, cfg.titleHeight);
        this.titleLabel.fontFamily = HUD_FONT_FAMILY;

        // 点击关卡标题 → 打开下拉选择；不再创建左右切关箭头。
        if (DEBUG_LEVEL_DROPDOWN) {
            const titleNode = this.titleLabel.node;
            titleNode.addComponent(Button);
            bindPressScale(titleNode, 0.94);
            titleNode.on(Node.EventType.TOUCH_END, () => this.toggleLevelDropdown());
        }
    }

    /** HUD 顶部图片按钮（返回 / 设置等） */
    private createHudIconButton(name: string, x: number, y: number, iconPath: string, onClick: () => void, scale = 1, sizeOverride?: number): Node {
        const size = sizeOverride ?? UI_LAYOUT.hud.topBar.buttonSize;
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

    /**
     * v1.5：屏幕中央临时提示（用于"功能敬请期待"等占位）
     * 1.5s 后自动渐隐消失
     */
    private showToast(text: string): void {
        const node = createNode(this.node, 'Toast', 0, 200, 600, 100);
        drawRect(node, 600, 100, colorFromHex('#1F2A50', 220), colorFromHex('#FFFFFF', 200), 2, 24);
        createLabel(node, 'ToastText', text, 0, 0, 36, colorFromHex('#FFFFFF'), 600, 100);
        // 简单淡入淡出：直接用 setTimeout 模拟（HudView 不引入 tween 复杂逻辑）
        setTimeout(() => {
            if (node.isValid) node.destroy();
        }, 1500);
    }

    private createDebugArrow(name: string, x: number, y: number, glyph: string, onClick: () => void, size: number, radius: number, fontSize: number): Node {
        const node = createNode(this.node, name, x, y, size, size);
        node.addComponent(Button);
        bindPressScale(node, 0.9);
        node.on(Node.EventType.TOUCH_END, onClick);
        drawCircle(node, radius, colorFromHex('#FFFFFF', 90), colorFromHex('#FFFFFF', 180), 2);
        createLabel(node, 'Glyph', glyph, 0, 0, fontSize, colorFromHex('#FFFFFF', 230), size, size);
        return node;
    }

    // ----------------- 跳关网格弹窗 -----------------

    /** 下拉关卡选择网格参数 */
    private static readonly PICKER_COLS = 5;
    private static readonly PICKER_ROWS = 4;
    private get pickerPerPage(): number {
        return HudView.PICKER_COLS * HudView.PICKER_ROWS;
    }
    private get currentPickerChapter(): LevelChapterGroup {
        return LEVEL_CHAPTER_GROUPS[this.pickerChapterIndex] ?? LEVEL_CHAPTER_GROUPS[0];
    }
    private get pickerPageCount(): number {
        const chapter = this.currentPickerChapter;
        const total = chapter.range[1] - chapter.range[0] + 1;
        return Math.max(1, Math.ceil(total / this.pickerPerPage));
    }

    private getChapterIndexByLevel(levelId: number): number {
        const index = LEVEL_CHAPTER_GROUPS.findIndex((chapter) => levelId >= chapter.range[0] && levelId <= chapter.range[1]);
        return Math.max(0, index);
    }

    /** 切换关卡下拉框，默认定位到当前关所在页 */
    private toggleLevelDropdown(): void {
        if (this.levelPickerNode && this.levelPickerNode.isValid) {
            this.closeLevelPicker();
            return;
        }
        this.pickerChapterIndex = this.getChapterIndexByLevel(this.currentLevelId);
        const chapter = this.currentPickerChapter;
        this.pickerPage = Math.floor((this.currentLevelId - chapter.range[0]) / this.pickerPerPage);
        this.buildLevelPicker();
    }

    private closeLevelPicker(): void {
        if (this.levelPickerNode && this.levelPickerNode.isValid) this.levelPickerNode.destroy();
        this.levelPickerNode = null;
    }

    private buildLevelPicker(): void {
        // 透明全屏遮罩：点击空白关闭；选择面板自身呈现为标题下方的下拉框。
        const root = ScreenAdapter.createFullscreenNode(this.node, 'LevelDropdown');
        root.setSiblingIndex(9999);
        this.levelPickerNode = root;

        const full = ScreenAdapter.fullSize();
        const maskBtn = createNode(root, 'Mask', 0, 0, full.width, full.height);
        maskBtn.addComponent(Button);
        maskBtn.on(Node.EventType.TOUCH_END, () => this.closeLevelPicker());

        const panelW = Math.min(660, full.width - 80);
        const panelH = 760;
        const titleY = this.titleLabel?.node.position.y ?? ScreenAdapter.topY(UI_LAYOUT.hud.topBar.topInset);
        const panelY = Math.max(-full.height / 2 + panelH / 2 + 30, titleY - panelH / 2 - 64);
        const panel = createNode(root, 'Panel', 0, panelY, panelW, panelH);
        drawRect(panel, panelW, panelH, colorFromHex('#FFF6E6', 248), colorFromHex('#E0A65A', 255), 4, 28);
        panel.addComponent(Button);
        panel.on(Node.EventType.TOUCH_END, () => {});

        const topY = panelH / 2;
        const chapter = this.currentPickerChapter;
        const title = createLabel(panel, 'PickerTitle', `${chapter.icon} ${chapter.name}`, 0, topY - 40, 36, colorFromHex('#7A3B12'), panelW, 56);
        title.fontFamily = HUD_FONT_FAMILY;
        const subtitle = createLabel(panel, 'PickerSubtitle', `Level ${chapter.range[0]}-${chapter.range[1]}`, 0, topY - 86, 24, colorFromHex('#A36A36'), panelW, 38);
        subtitle.fontFamily = HUD_FONT_FAMILY;

        this.renderChapterTabs(panel, panelW, panelH);
        this.renderPickerGrid(panel, panelW, panelH);
    }

    private renderChapterTabs(panel: Node, panelW: number, panelH: number): void {
        panel.getChildByName('ChapterTabs')?.destroy();
        const tabs = createNode(panel, 'ChapterTabs', 0, panelH / 2 - 150, panelW, 72);
        const gap = 12;
        const tabW = Math.floor((panelW - 72 - gap * (LEVEL_CHAPTER_GROUPS.length - 1)) / LEVEL_CHAPTER_GROUPS.length);
        const startX = -((LEVEL_CHAPTER_GROUPS.length - 1) * (tabW + gap)) / 2;
        LEVEL_CHAPTER_GROUPS.forEach((chapter, index) => {
            const active = index === this.pickerChapterIndex;
            const tab = createNode(tabs, `ChapterTab${index + 1}`, startX + index * (tabW + gap), 0, tabW, 58);
            drawRect(tab, tabW, 58, colorFromHex(active ? '#FFD79A' : '#FFFFFF', active ? 255 : 210), colorFromHex(active ? '#D78732' : '#E0A65A', 230), active ? 4 : 2, 18);
            const label = createLabel(tab, 'Text', `${chapter.icon} ${index + 1}`, 0, 0, 24, colorFromHex(active ? '#7A3B12' : '#9B7652'), tabW, 58);
            label.fontFamily = HUD_FONT_FAMILY;
            tab.addComponent(Button);
            bindPressScale(tab, 0.94);
            tab.on(Node.EventType.TOUCH_END, () => {
                if (this.pickerChapterIndex === index) return;
                this.pickerChapterIndex = index;
                this.pickerPage = 0;
                this.closeLevelPicker();
                this.buildLevelPicker();
            });
        });
    }

    /** 渲染当前章节页的关卡按钮网格 + 底部分页控件 */
    private renderPickerGrid(panel: Node, panelW: number, panelH: number): void {
        // 清掉旧网格/页脚，只保留标题+关闭
        ['Grid', 'Footer'].forEach((n) => panel.getChildByName(n)?.destroy());

        const grid = createNode(panel, 'Grid', 0, -28, panelW, panelH - 270);
        const cols = HudView.PICKER_COLS;
        const rows = HudView.PICKER_ROWS;
        const cell = 86;
        const gapX = Math.max(14, (panelW - 80 - cols * cell) / (cols - 1));
        const gapY = 18;
        const startX = -((cols - 1) * (cell + gapX)) / 2;
        const startY = ((rows - 1) * (cell + gapY)) / 2;

        const chapter = this.currentPickerChapter;
        const base = chapter.range[0] + this.pickerPage * this.pickerPerPage;
        const unlockedMax = this.getUnlockedMaxLevel();

        for (let i = 0; i < this.pickerPerPage; i += 1) {
            const lv = base + i;
            if (lv > chapter.range[1] || lv > DEBUG_LEVEL_MAX) break;
            const r = Math.floor(i / cols);
            const c = i % cols;
            const x = startX + c * (cell + gapX);
            const y = startY - r * (cell + gapY);
            this.createLevelCell(grid, lv, x, y, cell, lv === this.currentLevelId, lv <= unlockedMax);
        }

        // 页脚：翻页只用于下拉内容分页，不再承担左右切关。
        const footer = createNode(panel, 'Footer', 0, -panelH / 2 + 54, panelW, 88);
        const pageText = `${this.pickerPage + 1} / ${this.pickerPageCount}`;
        const label = createLabel(footer, 'Page', pageText, 0, 0, 30, colorFromHex('#7A3B12'), 220, 54);
        label.fontFamily = HUD_FONT_FAMILY;

        const mkPager = (name: string, gx: number, glyph: string, enabled: boolean, onClick: () => void): void => {
            const node = createNode(footer, name, gx, 0, 68, 68);
            drawCircle(node, 32, colorFromHex(enabled ? '#FFD79A' : '#EADCC4', 255), colorFromHex('#E0A65A', enabled ? 255 : 120), 3);
            createLabel(node, 'G', glyph, 0, 1, 32, colorFromHex('#7A3B12', enabled ? 255 : 110), 68, 68);
            if (enabled) {
                node.addComponent(Button);
                bindPressScale(node, 0.88);
                node.on(Node.EventType.TOUCH_END, onClick);
            }
        };
        mkPager('PagePrev', -panelW / 2 + 58, '‹', this.pickerPage > 0, () => {
            this.pickerPage -= 1;
            this.renderPickerGrid(panel, panelW, panelH);
        });
        mkPager('PageNext', panelW / 2 - 58, '›', this.pickerPage < this.pickerPageCount - 1, () => {
            this.pickerPage += 1;
            this.renderPickerGrid(panel, panelW, panelH);
        });
    }

    private createLevelCell(parent: Node, lv: number, x: number, y: number, size: number, isCurrent: boolean, unlocked: boolean): void {
        const node = createNode(parent, `Lv${lv}`, x, y, size, size);
        const fill = isCurrent ? '#FF9E3D' : (unlocked ? '#FFFFFF' : '#EFE3CC');
        const stroke = isCurrent ? '#C86A15' : '#E0A65A';
        drawRect(node, size, size, colorFromHex(fill, 255), colorFromHex(stroke, 255), isCurrent ? 5 : 3, 18);
        const textColor = isCurrent ? '#FFFFFF' : '#7A3B12';
        const label = createLabel(node, 'Num', String(lv), 0, 0, 34, colorFromHex(textColor, 255), size, size);
        label.fontFamily = HUD_FONT_FAMILY;
        node.addComponent(Button);
        bindPressScale(node, 0.9);
        node.on(Node.EventType.TOUCH_END, () => {
            this.closeLevelPicker();
            if (lv !== this.currentLevelId) this.handlers?.onGotoLevel?.(lv);
        });
    }

    /** 已解锁最大关卡（用于视觉区分；调试模式下允许点任意关，不做拦截） */
    private getUnlockedMaxLevel(): number {
        const cleared = ProgressRepository.load().maxClearedLevelId ?? 0;
        return Math.max(this.currentLevelId, cleared + 1);
    }

    // ----------------- Combo 弹幕 -----------------

    private createComboLabel(): void {
        const node = createNode(this.node, 'ComboFx', 0, 380, 420, 120);
        this.comboLabel = createLabel(node, 'ComboText', '', 0, 0, 72, colorFromHex('#FFD93D'), 420, 120);
        node.active = false;
    }

    // ----------------- 底部 Booster -----------------

    private createBottomBoosters(onBooster: (type: BoosterType) => void): void {
        const cfg = UI_LAYOUT.hud.boosters;
        const y = ScreenAdapter.bottomY(cfg.bottomInset);
        const [undoX, hintX, shuffleX] = ScreenAdapter.distributeCentered(3, cfg.span, cfg.sidePadding);
        this.createBoosterButton('undo', undoX, y, onBooster, cfg.scale);
        this.createBoosterButton('hint', hintX, y, onBooster, cfg.scale);
        this.createBoosterButton('shuffle', shuffleX, y, onBooster, cfg.scale);
    }

    private createBoosterButton(type: BoosterType, x: number, y: number, onBooster: (type: BoosterType) => void, scale = 1): void {
        const button = this.createOriginalBoosterButton(`${type}Button`, x, y, () => onBooster(type), scale);
        this.boosterButtons[type] = button;
        this.createSpriteIcon(button, `${type}Icon`, this.getBoosterIconPath(type, ProgressRepository.getBoosters()[type] ?? 0), () => {
            this.refreshBoosterBadge(type);
        });
    }

    private getCurrentBoosterCount(type: BoosterType): number {
        return this.lastSnapshot?.boosters[type] ?? ProgressRepository.getBoosters()[type] ?? 0;
    }

    private getBoosterIconPath(type: BoosterType, _count: number): string {
        return `newtheme/special_items/${BOOSTER_ICON_NAMES[type]}`;
    }

    private updateBoosterIcon(type: BoosterType, count: number): void {
        const button = this.boosterButtons[type];
        if (!button || !button.isValid) return;
        const iconPath = this.getBoosterIconPath(type, count);
        if (this.boosterIconPaths[type] === iconPath) return;

        const iconNode = button.getChildByName(`${type}Icon`) ?? button.getChildByName(`${type.toLowerCase()}Icon`);
        const sprite = iconNode?.getComponent(Sprite) ?? button.getComponent(Sprite);
        if (!sprite) return;
        this.boosterIconPaths[type] = iconPath;
        loadSpriteFrameFromResources(iconPath, (frame) => {
            if (this.boosterIconPaths[type] !== iconPath) return;
            if (frame && sprite.isValid) sprite.spriteFrame = frame;
        });
    }

    private refreshBoosterBadge(type: BoosterType, countOverride?: number): void {
        const button = this.boosterButtons[type];
        if (!button || !button.isValid) return;

        const oldBadge = this.boosterBadgeNodes[type];
        if (oldBadge && oldBadge.isValid) oldBadge.destroy();
        this.boosterLabels[type] = undefined;

        const inventory = countOverride ?? this.getCurrentBoosterCount(type);
        this.updateBoosterIcon(type, inventory);

        const badge = this.createInventoryBadge(button, `${type}Badge`, inventory);
        this.boosterBadgeNodes[type] = badge;
        this.boosterBadgeModes[type] = 'count';

        const labelNode = badge.getChildByName('Count');
        if (labelNode) {
            this.boosterLabels[type] = labelNode.getComponent(Label) ?? undefined;
        }
    }

    private createInventoryBadge(parent: Node, name: string, count: number): Node {
        const cfg = UI_LAYOUT.hud.boosters.badge;
        const boosterName = parent.name.replace('Button', '');
        const anchor = parent.getChildByName(`${boosterName}BadgeAnchor`) ?? parent.getChildByName('BadgeAnchor');
        const anchorTransform = anchor?.getComponent(UITransform);
        const width = anchorTransform?.contentSize.width ?? cfg.width;
        const height = anchorTransform?.contentSize.height ?? cfg.height;
        const x = anchor?.position.x ?? cfg.x;
        const y = anchor?.position.y ?? cfg.y;
        const badge = createNode(parent, name, x, y, width, height);
        const label = createLabel(badge, 'Count', String(count), 0, 0, cfg.fontSize, colorFromHex('#FFFFFF'), width, height);
        applyFredokaOneFont(label);
        (label as unknown as { isBold?: boolean }).isBold = true;
        return badge;
    }

    private createOriginalBoosterButton(name: string, x: number, y: number, onClick: () => void, scale = 1): Node {
        const size = UI_LAYOUT.hud.boosters.buttonSize;
        const node = createNode(this.node, name, x, y, size, size);
        node.setScale(new Vec3(scale, scale, 1));
        node.addComponent(Button);
        bindPressScale(node, 0.9);
        node.on(Node.EventType.TOUCH_END, onClick);
        return node;
    }

    private createSpriteIcon(parent: Node, name: string, iconPath: string, onLoaded?: () => void): void {
        const size = UI_LAYOUT.hud.boosters.buttonSize;
        const iconNode = createNode(parent, name, 0, 0, size, size);
        const sprite = iconNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources(iconPath, (frame) => {
            if (frame) sprite.spriteFrame = frame;
            onLoaded?.();
        });
    }

}
