import { _decorator, Button, Component, Node, Sprite, tween, UIOpacity, Vec3 } from 'cc';
import { ScreenAdapter } from './ScreenAdapter';
import { UI_LAYOUT } from './UILayoutConfig';
import { APP_VERSION } from '../../core/Constants';
import {
    bindPressScale,
    colorFromHex,
    createLabel,
    createNode,
    drawRect,
    loadSpriteFrameFromResources,
} from './UiFactory';

const { ccclass } = _decorator;

const SETTINGS_KEY = 'tile-explorer:settings:v1';

export interface SettingsState {
    music: boolean;
    sfx: boolean;
    voice: boolean;
    vibrate: boolean;
}

const DEFAULT_SETTINGS: SettingsState = {
    music: true,
    sfx: true,
    voice: false,
    vibrate: true,
};

export class SettingsStore {
    private static cache: SettingsState | null = null;

    static load(): SettingsState {
        if (this.cache) return this.cache;
        try {
            const g = globalThis as unknown as { localStorage?: Storage };
            const raw = g.localStorage?.getItem(SETTINGS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<SettingsState>;
                this.cache = { ...DEFAULT_SETTINGS, ...parsed };
                return this.cache;
            }
        } catch (_e) {
            // ignore
        }
        this.cache = { ...DEFAULT_SETTINGS };
        return this.cache;
    }

    static save(state: SettingsState): void {
        this.cache = { ...state };
        try {
            const g = globalThis as unknown as { localStorage?: Storage };
            g.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(state));
        } catch (_e) {
            // ignore
        }
    }
}

export interface SettingsModalHandlers {
    onClose: () => void;
}

interface ToggleButtonRefs {
    iconOpacity: UIOpacity;
    /** 状态字段名 */
    field: keyof SettingsState;
}

/**
 * 设置弹窗（v1.5）。
 * 视觉：奶油色圆角弹窗，顶部蓝色"设置"标题胶囊，5 个开关按钮（音乐/音效/语音/震动/通知占位），
 * 下方语言/客服按钮，最底部隐私政策/服务条款 + 版本号。
 *
 * 真实工作：音乐/音效/震动开关存 localStorage（暂未接入 AudioFeedback，先做 UI）。
 * 占位：语言/客服/通知 toast。
 */
@ccclass('SettingsModal')
export class SettingsModal extends Component {
    private handlers: SettingsModalHandlers | null = null;
    private state: SettingsState = SettingsStore.load();
    private toggleRefs: ToggleButtonRefs[] = [];

    show(handlers: SettingsModalHandlers): void {
        this.handlers = handlers;
        this.state = SettingsStore.load();
        this.node.active = true;
        this.node.removeAllChildren();
        this.toggleRefs = [];
        this.buildMask();
        this.buildPanel();

        // 弹出动画
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

    private createSpriteNode(parent: Node, name: string, path: string, x: number, y: number, width: number, height: number): Node {
        const node = createNode(parent, name, x, y, width, height);
        if (!path) {
            drawRect(node, width, height, colorFromHex('#FFF6E5'), colorFromHex('#A57833', 160), 2, Math.round(Math.min(width, height) * 0.16));
            return node;
        }
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources(path, (frame) => {
            if (frame) sprite.spriteFrame = frame;
        });
        return node;
    }

    private buildMask(): void {
        const size = ScreenAdapter.fullSize();
        const mask = createNode(this.node, 'SettingsMask', 0, 0, size.width, size.height);
        drawRect(mask, size.width, size.height, colorFromHex('#000000', 150), undefined, 0, 0);
        // 点击遮罩 = 关闭
        mask.addComponent(Button);
        mask.on(Node.EventType.TOUCH_END, () => this.handlers?.onClose());
    }

    private buildPanel(): void {
        const cfg = UI_LAYOUT.modal.settings;
        const w = cfg.width;
        const h = cfg.height;
        const panel = createNode(this.node, 'SettingsPanel', 0, 0, w, h);
        const fitScale = Math.min(
            ScreenAdapter.contentWidth(cfg.horizontalMargin, w, 1) / w,
            ScreenAdapter.contentHeight(cfg.verticalMargin, h, 1) / h,
        );
        const panelScale = fitScale * cfg.scale;
        panel.setScale(new Vec3(panelScale, panelScale, 1));
        // 拦截透传：阻止点击穿到 mask
        panel.addComponent(Button);
        panel.on(Node.EventType.TOUCH_END, () => { /* swallow */ });

        this.createSpriteNode(panel, 'SettingsBackground', cfg.backgroundPath, 0, 0, w, h);

        const titleCfg = cfg.title;
        createLabel(panel, 'TitleText', 'Settings', 0, h / 2 - titleCfg.yFromTop, titleCfg.fontSize, colorFromHex('#FFFFFF'), titleCfg.width, titleCfg.height);

        const closeCfg = cfg.close;
        const close = this.createSpriteNode(panel, 'CloseBtn', 'newtheme/close', w / 2 - closeCfg.xInset, h / 2 - closeCfg.yFromTop, closeCfg.size, closeCfg.size);
        close.addComponent(Button);
        bindPressScale(close, 0.9);
        close.on(Node.EventType.TOUCH_END, () => this.handlers?.onClose());

        const togglesY = h / 2 - cfg.toggles.yFromTop;
        this.buildToggleRow(panel, 0, togglesY);

        const socialY = togglesY - cfg.social.yGapFromToggles;
        this.buildSocialRow(panel, 0, socialY);

        const langY = socialY - cfg.actions.yGapFromSocial;
        this.buildLanguageRow(panel, 0, langY);

        const linkCfg = cfg.links;
        const linkY = -h / 2 + linkCfg.yFromBottom;
        createLabel(panel, 'PrivacyLink', 'Privacy Policy', linkCfg.policyX, linkY, linkCfg.linkFontSize, colorFromHex('#515766'), linkCfg.linkWidth, linkCfg.linkHeight);
        createLabel(panel, 'TermsLink', 'Terms of Service', linkCfg.termsX, linkY, linkCfg.linkFontSize, colorFromHex('#515766'), linkCfg.linkWidth, linkCfg.linkHeight);

        createLabel(panel, 'Version', APP_VERSION, 0, -h / 2 + linkCfg.versionYFromBottom, linkCfg.versionFontSize, colorFromHex('#B8AD9C'), 400, 40);
    }

    private buildToggleRow(parent: Node, x: number, y: number): void {
        const cfg = UI_LAYOUT.modal.settings.toggles;
        const items: Array<{ field: keyof SettingsState | null; path: string; tip?: string }> = [
            { field: 'music', path: cfg.paths.music },
            { field: 'sfx', path: cfg.paths.sfx },
            { field: 'voice', path: cfg.paths.voice },
            { field: 'vibrate', path: cfg.paths.vibrate },
            { field: null, path: cfg.paths.notice, tip: 'Notifications coming soon' },
        ];
        const btnSize = cfg.buttonSize;
        const gap = cfg.gap;
        const totalW = items.length * btnSize + (items.length - 1) * gap;
        const startX = x - totalW / 2 + btnSize / 2;
        items.forEach((item, idx) => {
            const bx = startX + idx * (btnSize + gap);
            const node = this.createSpriteNode(parent, `Toggle_${item.field ?? `n${idx}`}`, item.path, bx, y, btnSize, btnSize);
            node.addComponent(Button);
            bindPressScale(node, 0.92);
            const opacity = node.addComponent(UIOpacity);
            opacity.opacity = item.field && !this.state[item.field] ? cfg.offOpacity : 255;

            if (item.field) {
                const ref: ToggleButtonRefs = { iconOpacity: opacity, field: item.field };
                this.toggleRefs.push(ref);
                const fieldName = item.field;
                node.on(Node.EventType.TOUCH_END, () => {
                    this.state[fieldName] = !this.state[fieldName];
                    SettingsStore.save(this.state);
                    this.refreshToggle(ref);
                });
            } else {
                node.on(Node.EventType.TOUCH_END, () => this.toast(item.tip ?? ''));
            }
        });
    }

    private refreshToggle(ref: ToggleButtonRefs): void {
        const isOn = this.state[ref.field];
        ref.iconOpacity.opacity = isOn ? 255 : UI_LAYOUT.modal.settings.toggles.offOpacity;
    }

    private buildSocialRow(parent: Node, x: number, y: number): void {
        const cfg = UI_LAYOUT.modal.settings.social;
        createLabel(parent, 'SocialTitle', 'Join us!', x + cfg.labelX, y + cfg.labelY, cfg.labelFontSize, colorFromHex('#515766'), cfg.labelWidth, cfg.labelHeight);

        const fb = this.createSpriteNode(parent, 'FbBtn', cfg.fbPath, x + cfg.fbX, y + cfg.iconY, cfg.buttonSize, cfg.buttonSize);
        fb.addComponent(Button);
        bindPressScale(fb, 0.92);
        fb.on(Node.EventType.TOUCH_END, () => this.toast('Facebook coming soon'));

        const friend = this.createSpriteNode(parent, 'FriendBtn', cfg.friendPath, x + cfg.friendX, y + cfg.iconY, cfg.buttonSize, cfg.buttonSize);
        friend.addComponent(Button);
        bindPressScale(friend, 0.92);
        friend.on(Node.EventType.TOUCH_END, () => this.toast('Friends coming soon'));
    }

    private buildLanguageRow(parent: Node, x: number, y: number): void {
        const cfg = UI_LAYOUT.modal.settings.actions;

        const langBtn = createNode(parent, 'LangBtn', x, y + cfg.languageOffsetY, cfg.labelWidth, cfg.labelHeight);
        langBtn.addComponent(Button);
        bindPressScale(langBtn, 0.95);
        createLabel(langBtn, 'LangText', 'LANGUAGE', 0, 2, cfg.fontSize, colorFromHex('#FFFFFF'), cfg.labelWidth, cfg.labelHeight);
        langBtn.on(Node.EventType.TOUCH_END, () => this.toast('Language coming soon'));

        const supportBtn = createNode(parent, 'SupportBtn', x, y + cfg.supportOffsetY, cfg.labelWidth, cfg.labelHeight);
        supportBtn.addComponent(Button);
        bindPressScale(supportBtn, 0.95);
        createLabel(supportBtn, 'SupportText', 'SUPPORT', 0, 2, cfg.fontSize, colorFromHex('#FFFFFF'), cfg.labelWidth, cfg.labelHeight);
        supportBtn.on(Node.EventType.TOUCH_END, () => this.toast('Support coming soon'));
    }

    private toast(text: string): void {
        if (!text) return;
        const cfg = UI_LAYOUT.modal.settings.toast;
        const node = createNode(this.node, 'SettingsToast', 0, cfg.y, cfg.width, cfg.height);
        drawRect(node, cfg.width, cfg.height, colorFromHex('#1F2A50', 220), colorFromHex('#FFFFFF', 200), 2, cfg.radius);
        createLabel(node, 'Text', text, 0, 0, cfg.fontSize, colorFromHex('#FFFFFF'), cfg.width, cfg.height);
        setTimeout(() => {
            if (node.isValid) node.destroy();
        }, 1500);
    }
}
