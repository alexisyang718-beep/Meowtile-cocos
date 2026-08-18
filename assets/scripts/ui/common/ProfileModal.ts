import { _decorator, Button, Component, Node, Sprite, tween, Vec3 } from 'cc';
import { ScreenAdapter } from './ScreenAdapter';
import { UI_LAYOUT } from './UILayoutConfig';
import {
    bindPressScale,
    colorFromHex,
    createLabel,
    createNode,
    drawCircle,
    drawRect,
    GAME_FONT_FAMILY,
    loadSpriteFrameFromResources,
} from './UiFactory';

const { ccclass } = _decorator;

const PROFILE_KEY = 'tile-explorer:profile:v1';
const PROFILE_FONT_FAMILY = GAME_FONT_FAMILY;

export interface ProfileState {
    nickname: string;
    /** 头像资源相对路径（不带扩展名） */
    avatar: string;
    /** 头像框样式 id */
    avatarFrame: string;
    /** 联赛阶级 */
    league: string;
}

const DEFAULT_PROFILE: ProfileState = {
    nickname: 'allenwei',
    avatar: 'art/ui/home/avatar_cat',
    avatarFrame: 'none',
    league: 'bronze',
};

export class ProfileStore {
    private static cache: ProfileState | null = null;

    static load(): ProfileState {
        if (this.cache) return this.cache;
        try {
            const g = globalThis as unknown as { localStorage?: Storage };
            const raw = g.localStorage?.getItem(PROFILE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<ProfileState>;
                this.cache = { ...DEFAULT_PROFILE, ...parsed };
                return this.cache;
            }
        } catch (_e) {
            // ignore
        }
        this.cache = { ...DEFAULT_PROFILE };
        return this.cache;
    }

    static save(state: ProfileState): void {
        this.cache = { ...state };
        try {
            const g = globalThis as unknown as { localStorage?: Storage };
            g.localStorage?.setItem(PROFILE_KEY, JSON.stringify(state));
        } catch (_e) {
            // ignore
        }
    }
}

export interface ProfileModalHandlers {
    onClose: (state: ProfileState) => void;
}

type TabId = 'avatar' | 'frame' | 'league';

const AVATAR_OPTIONS = [
    'art/ui/home/avatar_cat',
    'art/ui/home/avatar_default',
];

const FRAME_OPTIONS: { id: string; ringColor: string; locked?: boolean; deco?: 'flowers' }[] = [
    { id: 'flowers', ringColor: '#5DBE3F', deco: 'flowers' },
    { id: 'silver', ringColor: '#A6B4D6', locked: true },
    { id: 'gold', ringColor: '#FFB840', locked: true },
    { id: 'red', ringColor: '#E94457', locked: true },
    { id: 'blue', ringColor: '#4A82CC', locked: true },
    { id: 'green', ringColor: '#5DBE3F', locked: true },
    { id: 'purple', ringColor: '#9C66E0', locked: true },
    { id: 'wood', ringColor: '#A57833', locked: true },
];

const LEAGUE_TIERS = [
    { id: 'bronze', name: '青铜', color: '#A57833', current: true },
];

/**
 * 个人信息弹窗（v1.5）。
 * 来自录屏：左下橘猫头像 → 弹出 3 个 tab（头像/头像框/联赛）+ 确认按钮
 * 视觉与 SettingsModal 同款（奶油色面板 + 蓝色顶部胶囊 + 红 X 关闭）
 */
@ccclass('ProfileModal')
export class ProfileModal extends Component {
    private handlers: ProfileModalHandlers | null = null;
    private state: ProfileState = ProfileStore.load();
    private currentTab: TabId = 'avatar';
    private contentArea: Node | null = null;
    private tabButtons: Record<TabId, Node | null> = { avatar: null, frame: null, league: null };
    private avatarPreview: Sprite | null = null;

    show(handlers: ProfileModalHandlers): void {
        this.handlers = handlers;
        this.state = ProfileStore.load();
        this.currentTab = 'avatar';
        this.node.active = true;
        this.node.removeAllChildren();
        this.tabButtons = { avatar: null, frame: null, league: null };
        this.buildMask();
        this.buildPanel();

        this.node.setScale(new Vec3(0.6, 0.6, 1));
        tween(this.node)
            .to(0.18, { scale: new Vec3(1.05, 1.05, 1) })
            .to(0.08, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    hide(): void {
        this.node.active = false;
        this.node.removeAllChildren();
    }

    private buildMask(): void {
        const size = ScreenAdapter.fullSize();
        const mask = createNode(this.node, 'ProfileMask', 0, 0, size.width, size.height);
        drawRect(mask, size.width, size.height, colorFromHex('#000000', 150), undefined, 0, 0);
        mask.addComponent(Button);
        mask.on(Node.EventType.TOUCH_END, () => this.commit());
    }

    private buildPanel(): void {
        const cfg = UI_LAYOUT.modal.profile;
        const w = cfg.width;
        const h = cfg.height;
        const panel = createNode(this.node, 'ProfilePanel', 0, 0, w, h);
        const fitScale = Math.min(
            ScreenAdapter.contentWidth(cfg.horizontalMargin, w, 1) / w,
            ScreenAdapter.contentHeight(cfg.verticalMargin, h, 1) / h,
            1,
        );
        panel.setScale(new Vec3(fitScale, fitScale, 1));
        panel.addComponent(Button);
        panel.on(Node.EventType.TOUCH_END, () => { /* swallow */ });

        drawRect(panel, w, h, colorFromHex('#FFF6E5'), colorFromHex('#A57833'), 4, 36);

        // 顶部蓝色标题胶囊
        const titleCap = createNode(panel, 'TitleCap', 0, h / 2 - 30, 360, 110);
        drawRect(titleCap, 360, 110, colorFromHex('#4A82CC'), colorFromHex('#FFFFFF', 220), 4, 50);
        const title = createLabel(titleCap, 'TitleText', '个人信息', 0, 0, 44, colorFromHex('#FFFFFF'), 360, 110);
        title.fontFamily = PROFILE_FONT_FAMILY;

        // 关闭按钮
        const close = createNode(panel, 'CloseBtn', w / 2 - 50, h / 2 - 30, 80, 80);
        close.addComponent(Button);
        bindPressScale(close, 0.9);
        close.on(Node.EventType.TOUCH_END, () => this.commit());
        const closeSprite = close.addComponent(Sprite);
        closeSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources('newtheme/close', (frame) => {
            if (frame && closeSprite.isValid) closeSprite.spriteFrame = frame;
        });

        // 用户名行
        this.buildNicknameRow(panel, 0, h / 2 - 220);

        // Tab 切换
        this.buildTabBar(panel, 0, h / 2 - 380);

        // 内容区（动态根据 tab 重建）
        this.contentArea = createNode(panel, 'ProfileContent', 0, -50, w - 60, 700);
        drawRect(this.contentArea, w - 60, 700, colorFromHex('#FAEDC9'), colorFromHex('#A57833', 120), 2, 24);
        this.rebuildContent();

        // 底部确认按钮
        const confirm = createNode(panel, 'ConfirmBtn', 0, -h / 2 + 130, 460, 130);
        confirm.addComponent(Button);
        bindPressScale(confirm, 0.94);
        confirm.on(Node.EventType.TOUCH_END, () => this.commit());
        const confirmBg = createNode(confirm, 'Bg', 0, 0, 460, 130);
        const confirmSp = confirmBg.addComponent(Sprite);
        confirmSp.sizeMode = Sprite.SizeMode.CUSTOM;
        confirmSp.type = Sprite.Type.SIMPLE;
        loadSpriteFrameFromResources('art/ui/home/btn_play_clean_v4', (frame) => {
            if (frame) confirmSp.spriteFrame = frame;
        });
        const confirmLabel = createLabel(confirm, 'ConfirmText', 'CONFIRM', 0, 4, 48, colorFromHex('#FFFFFF'), 460, 130);
        confirmLabel.fontFamily = PROFILE_FONT_FAMILY;
    }

    private buildNicknameRow(parent: Node, x: number, y: number): void {
        const w = 720;
        const h = 110;
        const row = createNode(parent, 'NicknameRow', x, y, w, h);
        drawRect(row, w, h, colorFromHex('#FFFFFF', 240), colorFromHex('#A57833', 160), 2, 56);

        // 头像
        const avatarBg = createNode(row, 'AvatarBg', -w / 2 + 60, 0, 96, 96);
        drawCircle(avatarBg, 46, colorFromHex('#FFFFFF'), colorFromHex('#A57833'), 2);
        const avatarSp = createNode(avatarBg, 'Avatar', 0, 0, 86, 86);
        const sp = avatarSp.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        this.avatarPreview = sp;
        loadSpriteFrameFromResources(this.state.avatar, (frame) => {
            if (frame) sp.spriteFrame = frame;
        });

        // 名字
        const nick = createLabel(row, 'NickName', this.state.nickname, 30, 0, 36, colorFromHex('#7A4A1E'), w - 200, h);
        nick.fontFamily = PROFILE_FONT_FAMILY;
    }

    private buildTabBar(parent: Node, x: number, y: number): void {
        const tabs: { id: TabId; label: string }[] = [
            { id: 'avatar', label: '头像' },
            { id: 'frame', label: '头像框' },
            { id: 'league', label: '联赛' },
        ];
        const btnW = 200;
        const gap = 30;
        const totalW = btnW * tabs.length + gap * (tabs.length - 1);
        const startX = x - totalW / 2 + btnW / 2;
        tabs.forEach((t, idx) => {
            const bx = startX + idx * (btnW + gap);
            const node = createNode(parent, `Tab_${t.id}`, bx, y, btnW, 80);
            node.addComponent(Button);
            bindPressScale(node, 0.96);
            this.tabButtons[t.id] = node;
            node.on(Node.EventType.TOUCH_END, () => {
                this.currentTab = t.id;
                this.refreshTabBar();
                this.rebuildContent();
            });
        });
        this.refreshTabBar();
    }

    private refreshTabBar(): void {
        (Object.keys(this.tabButtons) as TabId[]).forEach((id) => {
            const node = this.tabButtons[id];
            if (!node) return;
            node.removeAllChildren();
            // graphics 由父节点的 addComponent(Graphics) 控制，需 clear
            const isActive = id === this.currentTab;
            if (isActive) {
                drawRect(node, 200, 80, colorFromHex('#4A82CC'), colorFromHex('#FFFFFF', 200), 3, 20);
            } else {
                drawRect(node, 200, 80, colorFromHex('#FFF6E5'), colorFromHex('#A57833', 120), 2, 20);
            }
            const label = id === 'avatar' ? '头像' : id === 'frame' ? '头像框' : '联赛';
            const tabLabel = createLabel(node, 'Label', label, 0, 0, 32, colorFromHex(isActive ? '#FFFFFF' : '#7A4A1E'), 200, 80);
            tabLabel.fontFamily = PROFILE_FONT_FAMILY;
        });
    }

    private rebuildContent(): void {
        if (!this.contentArea) return;
        this.contentArea.removeAllChildren();
        // 重新绘背景（被 removeAllChildren 清除子节点但 graphics 在自己身上不丢）
        if (this.currentTab === 'avatar') {
            this.buildAvatarTab();
        } else if (this.currentTab === 'frame') {
            this.buildFrameTab();
        } else {
            this.buildLeagueTab();
        }
    }

    private buildAvatarTab(): void {
        if (!this.contentArea) return;
        // 4 列 × 3 行 共 12 个
        const cols = 4;
        const cell = 160;
        const gap = 24;
        const totalW = cols * cell + (cols - 1) * gap;
        const startX = -totalW / 2 + cell / 2;
        const startY = 220;
        AVATAR_OPTIONS.forEach((path, idx) => {
            const c = idx % cols;
            const r = Math.floor(idx / cols);
            const x = startX + c * (cell + gap);
            const y = startY - r * (cell + gap);
            const node = createNode(this.contentArea!, `AvatarOpt_${idx}`, x, y, cell, cell);
            node.addComponent(Button);
            bindPressScale(node, 0.93);
            drawCircle(node, cell / 2 - 4, colorFromHex('#FFFFFF'), colorFromHex('#A57833', 160), 3);
            const inner = createNode(node, 'Inner', 0, 0, cell - 16, cell - 16);
            const sp = inner.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            loadSpriteFrameFromResources(path, (frame) => {
                if (frame) sp.spriteFrame = frame;
            });
            // 选中态：右下绿色 ✓
            if (this.state.avatar === path) {
                const check = createNode(node, 'Check', cell / 2 - 24, -cell / 2 + 24, 44, 44);
                drawCircle(check, 20, colorFromHex('#5DBE3F'), colorFromHex('#FFFFFF'), 3);
                const checkLabel = createLabel(check, 'X', '✓', 0, 2, 28, colorFromHex('#FFFFFF'), 44, 44);
                checkLabel.fontFamily = PROFILE_FONT_FAMILY;
            }
            node.on(Node.EventType.TOUCH_END, () => {
                this.state.avatar = path;
                this.rebuildContent();
                if (this.avatarPreview) {
                    loadSpriteFrameFromResources(path, (frame) => {
                        if (frame && this.avatarPreview) this.avatarPreview.spriteFrame = frame;
                    });
                }
            });
        });
    }

    private buildFrameTab(): void {
        if (!this.contentArea) return;
        // 4 列 × 2 行 共 8 个圆环
        const cols = 4;
        const cell = 160;
        const gap = 30;
        const totalW = cols * cell + (cols - 1) * gap;
        const startX = -totalW / 2 + cell / 2;
        const startY = 140;
        FRAME_OPTIONS.forEach((opt, idx) => {
            const c = idx % cols;
            const r = Math.floor(idx / cols);
            const x = startX + c * (cell + gap);
            const y = startY - r * (cell + gap);
            const node = createNode(this.contentArea!, `Frame_${opt.id}`, x, y, cell, cell);
            node.addComponent(Button);
            bindPressScale(node, 0.93);
            // 圆环（空心）
            drawCircle(node, cell / 2 - 6, colorFromHex('#FFFFFF', 0), colorFromHex(opt.ringColor), 6);
            // 中央椰树占位（暗示头像位）
            const glyph = createLabel(node, 'Glyph', '🌴', 0, 0, 56, colorFromHex('#A57833', 120), cell, cell);
            glyph.fontFamily = PROFILE_FONT_FAMILY;
            // 装饰：第一个有花藤
            if (opt.deco === 'flowers') {
                const flowers = createLabel(node, 'Flowers', '🌸', -cell / 2 + 24, -cell / 2 + 28, 28, colorFromHex('#FFFFFF'), 40, 40);
                flowers.fontFamily = PROFILE_FONT_FAMILY;
            }
            // 锁
            if (opt.locked) {
                const lock = createNode(node, 'Lock', cell / 2 - 30, -cell / 2 + 30, 44, 44);
                drawCircle(lock, 20, colorFromHex('#FFB840'), colorFromHex('#7A4A1E'), 2);
                const lockLabel = createLabel(lock, 'L', '🔒', 0, 0, 22, colorFromHex('#FFFFFF'), 44, 44);
                lockLabel.fontFamily = PROFILE_FONT_FAMILY;
            }
            if (this.state.avatarFrame === opt.id) {
                const check = createNode(node, 'Check', cell / 2 - 24, -cell / 2 + 24, 44, 44);
                drawCircle(check, 20, colorFromHex('#5DBE3F'), colorFromHex('#FFFFFF'), 3);
                const checkLabel = createLabel(check, 'X', '✓', 0, 2, 28, colorFromHex('#FFFFFF'), 44, 44);
                checkLabel.fontFamily = PROFILE_FONT_FAMILY;
            }
            node.on(Node.EventType.TOUCH_END, () => {
                if (opt.locked) return;
                this.state.avatarFrame = opt.id;
                this.rebuildContent();
            });
        });
    }

    private buildLeagueTab(): void {
        if (!this.contentArea) return;
        // 中央展示当前联赛卡片
        const card = createNode(this.contentArea!, 'LeagueCard', 0, 60, 280, 360);
        drawRect(card, 280, 360, colorFromHex('#FFFFFF', 240), colorFromHex('#A57833'), 3, 20);

        // 红色舞台幕布背景
        const stage = createNode(card, 'Stage', 0, 30, 240, 260);
        drawRect(stage, 240, 260, colorFromHex('#7B2430'), colorFromHex('#E94457'), 3, 16);
        // 中央猫头鹰（用奖杯/或猫头鹰 emoji）
        const owl = createLabel(stage, 'Owl', '🦉', 0, 30, 100, colorFromHex('#FFFFFF'), 240, 260);
        owl.fontFamily = PROFILE_FONT_FAMILY;
        // "青铜"标签
        const tierTag = createNode(card, 'TierTag', 0, -110, 180, 50);
        drawRect(tierTag, 180, 50, colorFromHex('#FFE9B0'), colorFromHex('#A57833'), 2, 24);
        const tier = createLabel(tierTag, 'TierText', '青铜', 0, 0, 32, colorFromHex('#A57833'), 180, 50);
        tier.fontFamily = PROFILE_FONT_FAMILY;
        // "当前排名"小字
        const rank = createLabel(this.contentArea!, 'CurrentRank', '当前排名', 0, -150, 26, colorFromHex('#E94457'), 300, 40);
        rank.fontFamily = PROFILE_FONT_FAMILY;
    }

    private commit(): void {
        ProfileStore.save(this.state);
        this.handlers?.onClose(this.state);
    }
}
