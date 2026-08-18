import { _decorator, Button, Color, Component, Label, Node, Sprite, UITransform, Vec3, director, game } from 'cc';
import { APP_VERSION } from '../../core/Constants';
import { EventKeys } from '../../core/EventKeys';
import { LevelId } from '../../core/Types';
import { ChapterRepository } from '../../data/repositories/ChapterRepository';
import { ProgressRepository } from '../../data/repositories/ProgressRepository';
import { ChapterModel } from '../../data/models/ChapterModel';
import { HomeView } from '../../ui/home/HomeView';
import { LevelSelectView } from '../../ui/level-select/LevelSelectView';
import { SettingsModal } from '../../ui/common/SettingsModal';
import { ProfileModal } from '../../ui/common/ProfileModal';
import { ScreenAdapter } from '../../ui/common/ScreenAdapter';
import { applyFredokaOneFont, colorFromHex, createLabel, createNode, drawRect, loadSpriteFrameFromResources } from '../../ui/common/UiFactory';
import { ShopView } from '../../ui/shop/ShopView';
import { CollectionsView } from '../../meta/beads/CollectionsView';
import { BeadProgressService } from '../../meta/beads/BeadProgressService';
import { BeadRewardModal } from '../../meta/beads/BeadRewardModal';
import { LevelFlowController } from './LevelFlowController';

const { ccclass } = _decorator;

const CHAPTER_PAGE_ROOT_NAMES = [
    'ParisStartRoot',
    'ElCalafateStartRoot',
    'StockholmStartRoot',
    'NewYorkStartRoot',
    'ParisEndRoot',
    'ElCalafateEndRoot',
    'StockholmEndRoot',
    'NewYorkEndRoot',
] as const;

const LOADING_BG_PATH = 'newtheme/loading';
const LOADING_BG_WIDTH = 1248;
const LOADING_BG_HEIGHT = 2352;
const LOADING_DURATION_MS = 2000;
const LOADING_TEXT_FALLBACK_FONT_SIZE = 30;
const LOADING_TEXT_FALLBACK_LINE_HEIGHT = 38;
const LOADING_TEXTS = [
    'Paws are packing the tiles...',
    'Finding the next cozy corner...',
    'Warming up the MeowTile board...',
    'Sorting cozy memories...',
    'Counting tiny pawprints...',
];

type AppScene = 'loading' | 'home' | 'map' | 'collections' | 'beadStart' | 'game';

/**
 * v1.5：App 顶层流程控制器。
 * 职责：管理 Home / Map / Game 三个场景的切换；持有 SettingsModal 单例。
 *
 * 接管说明：
 * - 旧版 Main.scene 直接挂 LevelFlowController，启动即进游戏。
 * - 新版 Main.scene 改挂 AppFlowController，由它创建 LevelFlow 子节点，并按场景切换。
 *
 * 节点结构：
 *   GameRoot (this.node)
 *     ├── HomeRoot       (HomeView)        — sibling 10
 *     ├── MapRoot        (LevelSelectView) — sibling 20
 *     ├── GameRoot       (LevelFlowController) — sibling 30
 *     └── SettingsRoot   (SettingsModal)   — sibling 50（最上层弹窗）
 */
@ccclass('AppFlowController')
export class AppFlowController extends Component {
    private loadingRoot!: Node;
    private homeRoot!: Node;
    private mapRoot!: Node;
    private collectionsRoot!: Node;
    private beadStartRoot!: Node;
    private gameRoot!: Node;
    private settingsRoot!: Node;

    private homeView!: HomeView;
    private mapView!: LevelSelectView;
    private collectionsView!: CollectionsView;
    private beadStartModal!: BeadRewardModal;
    private gameFlow!: LevelFlowController;
    private settingsModal!: SettingsModal;
    private profileModal!: ProfileModal;
    private profileRoot!: Node;
    private shopRoot!: Node;
    private shopView!: ShopView;
    private currentScene: AppScene = 'home';
    private fpsLabel: Label | null = null;
    private fpsFrames = 0;
    private fpsLastTime = 0;
    private loadingTextIndex = -1;

    protected onEnable(): void {
        ScreenAdapter.onResize(this.handleResize, this);
    }

    protected onDisable(): void {
        ScreenAdapter.offResize(this.handleResize, this);
    }

    protected start(): void {
        ScreenAdapter.applyFullscreen(this.node);
        this.buildSceneRoots();
        this.buildFpsOverlay();
        void this.boot();
    }

    protected update(): void {
        if (!this.fpsLabel || !this.fpsLabel.isValid) return;
        this.fpsFrames++;
        const now = game.totalTime;
        const elapsed = now - this.fpsLastTime;
        if (elapsed >= 1000) {
            const fps = Math.round(this.fpsFrames * 1000 / elapsed);
            this.fpsLabel.string = `${APP_VERSION}  ${fps}fps`;
            this.fpsFrames = 0;
            this.fpsLastTime = now;
        }
    }

    private getUiHost(): Node {
        return this.node.parent ?? this.node;
    }

    private isSceneAuthoredLayoutRoot(root: Node): boolean {
        if (root.name === 'LoadingRoot') {
            return !!root.getChildByName('LoadingBg') && !!root.getChildByName('LoadingText');
        }
        if (root.name === 'HomeRoot') {
            return !!root.getChildByName('HomeBg') && !!root.getChildByName('PlayButton');
        }
        if (root.name === 'MapRoot') {
            return !!root.getChildByName('MapBack') && !!root.getChildByName('ParisBook');
        }
        return false;
    }

    private handleResize = (): void => {
        ScreenAdapter.applyFullscreen(this.node);
        [this.loadingRoot, this.homeRoot, this.mapRoot, this.collectionsRoot, this.beadStartRoot, this.gameRoot, this.settingsRoot, this.profileRoot, this.shopRoot]
            .filter(Boolean)
            .forEach((root) => {
                if (this.isSceneAuthoredLayoutRoot(root)) return;
                ScreenAdapter.applyFullscreen(root);
            });
    };

    private getOrCreateFullscreenRoot(name: string): Node {
        const host = this.getUiHost();
        const existing = host.getChildByName(name);
        if (existing) {
            if (!this.isSceneAuthoredLayoutRoot(existing)) {
                ScreenAdapter.applyFullscreen(existing);
            }
            return existing;
        }
        return ScreenAdapter.createFullscreenNode(host, name);
    }

    private destroyExistingChapterPageRoots(): void {
        const host = this.getUiHost();
        CHAPTER_PAGE_ROOT_NAMES.forEach((rootName) => {
            host.getChildByName(rootName)?.destroy();
        });
    }

    private buildSceneRoots(): void {
        this.loadingRoot = this.getOrCreateFullscreenRoot('LoadingRoot');
        this.loadingRoot.setSiblingIndex(5);
        this.loadingRoot.active = false;

        this.homeRoot = this.getOrCreateFullscreenRoot('HomeRoot');
        this.homeRoot.setSiblingIndex(10);
        this.homeView = this.homeRoot.getComponent(HomeView) ?? this.homeRoot.addComponent(HomeView);

        this.mapRoot = this.getOrCreateFullscreenRoot('MapRoot');
        this.mapRoot.setSiblingIndex(20);
        this.mapView = this.mapRoot.getComponent(LevelSelectView) ?? this.mapRoot.addComponent(LevelSelectView);

        this.collectionsRoot = this.getOrCreateFullscreenRoot('CollectionsRoot');
        this.collectionsRoot.setSiblingIndex(30);
        this.collectionsView = this.collectionsRoot.getComponent(CollectionsView) ?? this.collectionsRoot.addComponent(CollectionsView);
        this.collectionsRoot.active = false;

        this.beadStartRoot = this.getOrCreateFullscreenRoot('BeadStartRoot');
        this.beadStartRoot.setSiblingIndex(45);
        this.beadStartModal = this.beadStartRoot.getComponent(BeadRewardModal) ?? this.beadStartRoot.addComponent(BeadRewardModal);
        this.beadStartRoot.active = false;

        this.destroyExistingChapterPageRoots();

        this.gameRoot = this.getOrCreateFullscreenRoot('GameRoot');
        this.gameRoot.setSiblingIndex(40);
        this.gameFlow = this.gameRoot.getComponent(LevelFlowController) ?? this.gameRoot.addComponent(LevelFlowController);
        this.gameFlow.setAutoBoot(false);
        this.gameFlow.setReturnHomeHandler(() => this.goHome());
        this.gameFlow.setChapterStartHandler((levelId) => { void this.requestStartLevel(levelId); });
        this.gameFlow.setChapterEndHandler((levelId) => { void this.goChapterEndByLevel(levelId); });

        this.settingsRoot = this.getOrCreateFullscreenRoot('SettingsRoot');
        this.settingsRoot.setSiblingIndex(50);
        this.settingsModal = this.settingsRoot.getComponent(SettingsModal) ?? this.settingsRoot.addComponent(SettingsModal);
        this.settingsRoot.active = false;

        this.profileRoot = this.getOrCreateFullscreenRoot('ProfileRoot');
        this.profileRoot.setSiblingIndex(51);
        this.profileModal = this.profileRoot.getComponent(ProfileModal) ?? this.profileRoot.addComponent(ProfileModal);
        this.profileRoot.active = false;

        this.shopRoot = this.getOrCreateFullscreenRoot('ShopRoot');
        this.shopRoot.setSiblingIndex(52);
        this.shopView = this.shopRoot.getComponent(ShopView) ?? this.shopRoot.addComponent(ShopView);
        this.shopRoot.active = false;
    }

    private async boot(): Promise<void> {
        // 预加载章节，避免首次进 Map 时白屏
        await ChapterRepository.loadAll();
        this.bindHome();
        this.bindMap();
        // 监听全局设置/商城入口
        director.on(EventKeys.AppOpenSettings, this.openSettings, this);
        director.on(EventKeys.AppOpenShop, this.openShop, this);
        await this.showLoading();
        await this.goHome();
    }

    private async showLoading(message?: string): Promise<void> {
        this.currentScene = 'loading';
        this.gameFlow.teardown();
        this.homeRoot.active = false;
        this.mapRoot.active = false;
        this.collectionsRoot.active = false;
        this.beadStartRoot.active = false;
        this.gameRoot.active = false;
        this.hideChapterPages();
        this.loadingRoot.active = true;
        if (!this.isSceneAuthoredLayoutRoot(this.loadingRoot)) {
            ScreenAdapter.applyFullscreen(this.loadingRoot);
        }

        this.prepareLoadingBackground();
        const text = message ?? this.nextLoadingText();
        this.prepareLoadingText(text);
        const progress = this.prepareLoadingProgress();
        await this.animateLoadingProgress(progress.fill, progress.width, progress.height);
        if (this.loadingRoot.isValid) {
            this.loadingRoot.active = false;
        }
    }

    private nextLoadingText(): string {
        if (LOADING_TEXTS.length <= 0) return 'Loading...';
        const storage = (globalThis as unknown as { localStorage?: { getItem?: (key: string) => string | null; setItem?: (key: string, value: string) => void } }).localStorage;
        const hasStorage = !!storage?.getItem && !!storage?.setItem;
        const stored = hasStorage ? Number(storage?.getItem?.('meowtile:loading-text-index')) : Number.NaN;
        const previous = Number.isFinite(stored) ? stored : (hasStorage ? 0 : this.loadingTextIndex);
        this.loadingTextIndex = (previous + 1) % LOADING_TEXTS.length;
        storage?.setItem?.('meowtile:loading-text-index', String(this.loadingTextIndex));
        return LOADING_TEXTS[this.loadingTextIndex] ?? 'Loading...';
    }

    private prepareLoadingBackground(): void {
        const size = ScreenAdapter.fullSize();
        const aspect = LOADING_BG_WIDTH / LOADING_BG_HEIGHT;
        const coverWidth = Math.max(size.width, size.height * aspect);
        const coverHeight = Math.max(size.height, size.width / aspect);
        const bg = this.loadingRoot.getChildByName('LoadingBg') ?? createNode(this.loadingRoot, 'LoadingBg', 0, 0, coverWidth, coverHeight);
        bg.active = true;
        bg.setSiblingIndex(0);
        const transform = bg.getComponent(UITransform) ?? bg.addComponent(UITransform);
        transform.setContentSize(coverWidth, coverHeight);
        const sprite = bg.getComponent(Sprite) ?? bg.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources(LOADING_BG_PATH, (frame) => {
            if (frame && sprite.node.isValid) sprite.spriteFrame = frame;
        });
    }

    private prepareLoadingText(text: string): void {
        const node = this.loadingRoot.getChildByName('LoadingText');
        let label = node?.getComponent(Label) ?? null;
        const createdLabel = !label;
        if (!label) {
            label = node?.addComponent(Label) ?? createLabel(this.loadingRoot, 'LoadingText', text, 0, -870, LOADING_TEXT_FALLBACK_FONT_SIZE, new Color(112, 71, 43, 230), 760, 90);
            label.fontSize = LOADING_TEXT_FALLBACK_FONT_SIZE;
            label.lineHeight = LOADING_TEXT_FALLBACK_LINE_HEIGHT;
        }
        label.string = text;
        if (createdLabel) {
            applyFredokaOneFont(label);
            label.color = new Color(112, 71, 43, 230);
            label.overflow = Label.Overflow.CLAMP;
            label.enableWrapText = true;
        }
        label.node.active = true;
    }

    private prepareLoadingProgress(): { fill: Node; width: number; height: number } {
        const track = this.loadingRoot.getChildByName('LoadingProgressTrack') ?? createNode(this.loadingRoot, 'LoadingProgressTrack', 0, -965, 520, 30);
        track.active = true;
        const trackTransform = track.getComponent(UITransform) ?? track.addComponent(UITransform);
        const width = Math.max(1, trackTransform.contentSize.width || 520);
        const height = Math.max(1, trackTransform.contentSize.height || 30);
        trackTransform.setContentSize(width, height);
        drawRect(track, width, height, colorFromHex('#FFFFFF', 145), colorFromHex('#8B5F45', 190), 2, height / 2);

        const fill = track.getChildByName('LoadingProgressFill') ?? createNode(track, 'LoadingProgressFill', -width / 2 + 0.5, 0, 1, height);
        fill.active = true;
        fill.setPosition(-width / 2 + 0.5, 0, 0);
        const fillTransform = fill.getComponent(UITransform) ?? fill.addComponent(UITransform);
        fillTransform.setAnchorPoint(0, 0.5);
        fillTransform.setContentSize(1, height);
        drawRect(fill, 1, height, colorFromHex('#92D75B', 235), colorFromHex('#FFFFFF', 110), 1, height / 2);
        return { fill, width, height };
    }

    private animateLoadingProgress(fill: Node, width: number, height: number): Promise<void> {
        const startTime = Date.now();
        return new Promise<void>((resolve) => {
            const updateProgress = (): void => {
                if (!fill.isValid) {
                    clearInterval(timer);
                    resolve();
                    return;
                }
                const ratio = Math.min(1, (Date.now() - startTime) / LOADING_DURATION_MS);
                const fillWidth = Math.max(1, width * ratio);
                fill.setPosition(-width / 2 + fillWidth / 2, 0, 0);
                const transform = fill.getComponent(UITransform) ?? fill.addComponent(UITransform);
                transform.setContentSize(fillWidth, height);
                drawRect(fill, fillWidth, height, colorFromHex('#92D75B', 235), colorFromHex('#FFFFFF', 110), 1, height / 2);
                if (ratio >= 1) {
                    clearInterval(timer);
                    resolve();
                }
            };
            const timer = setInterval(updateProgress, 16);
            updateProgress();
        });
    }

    protected onDestroy(): void {
        director.off(EventKeys.AppOpenSettings, this.openSettings, this);
        director.off(EventKeys.AppOpenShop, this.openShop, this);
    }

    // ----- 全局 FPS 浮层（所有页面可见） -----
    private buildFpsOverlay(): void {
        const container = new Node('FpsOverlay');
        this.getUiHost().addChild(container);
        container.setSiblingIndex(9999);

        const uiTransform = container.addComponent(UITransform);
        uiTransform.setAnchorPoint(0, 0);

        const label = container.addComponent(Label);
        label.string = `${APP_VERSION}  --fps`;
        label.fontSize = 20;
        label.lineHeight = 24;
        label.fontFamily = 'Comic Sans MS';
        label.isBold = true;
        label.color = new Color(255, 255, 255, 220);
        label.overflow = Label.Overflow.NONE;

        const x = ScreenAdapter.leftX(14);
        const y = ScreenAdapter.bottomY(10);
        container.setPosition(x, y, 0);

        this.fpsLabel = label;
        this.fpsLastTime = game.totalTime;
    }

    private bindHome(): void {
        this.homeView.bind({
            onPlay: (levelId) => { void this.requestStartLevel(levelId); },
            onOpenMap: () => this.goMap(),
            onOpenCollections: () => this.goCollections(),
            onOpenSettings: () => this.openSettings(),
            onShop: () => this.openShop(),
            onOpenProfile: () => this.openProfile(),
        });
    }

    private bindMap(): void {
        this.mapView.bind({
            onBack: () => this.goHome(),
            onSelectLevel: (levelId) => { void this.requestStartLevel(levelId); },
            onOpenChapterStart: (chapterId) => { void this.goChapterStart(chapterId); },
        });
    }

    private hideChapterPages(): void {
        this.destroyExistingChapterPageRoots();
    }

    /**
     * 调试模式 — 首页关卡按钮永远显示「关卡 1」。
     * 上线前置 false，让玩家从已通关的下一关开始。
     */
    private static readonly HOME_DEBUG_FORCE_LEVEL_1 = true;
    /** 关卡已扩到 1-320，首页/进度封顶同步改为 320。 */
    private static readonly HOME_LEVEL_MAX = 320;
    /** v1.5.3：地图章节按 chapters.json 的 unlockAfterLevel 正常解锁。
     *  调试期：true → 所有章节常驻解锁，方便逐关验难度。上线前置 false。 */
    private static readonly DEBUG_UNLOCK_ALL_CHAPTERS = true;

    private async goHome(): Promise<void> {
        this.currentScene = 'home';
        // 销毁 game runtime 释放资源
        this.gameFlow.teardown();
        this.loadingRoot.active = false;
        this.gameRoot.active = false;
        this.mapRoot.active = false;
        this.collectionsRoot.active = false;
        this.beadStartRoot.active = false;
        this.hideChapterPages();
        this.homeRoot.active = true;

        let nextLevelId: LevelId;
        if (AppFlowController.HOME_DEBUG_FORCE_LEVEL_1) {
            nextLevelId = 1;
        } else {
            // 计算"当前应玩"关卡 = maxClearedLevelId + 1，封顶取已配关卡最大值
            const progress = ProgressRepository.load();
            nextLevelId = Math.max(1, Math.min(AppFlowController.HOME_LEVEL_MAX, progress.maxClearedLevelId + 1));
        }
        this.homeView.show(nextLevelId);
    }

    private async goMap(): Promise<void> {
        this.currentScene = 'map';
        this.gameFlow.teardown();
        this.loadingRoot.active = false;
        this.gameRoot.active = false;
        this.homeRoot.active = false;
        this.collectionsRoot.active = false;
        this.beadStartRoot.active = false;
        this.hideChapterPages();
        this.mapRoot.active = true;

        const chapters = await ChapterRepository.loadAll();
        const progress = ProgressRepository.load();
        const cleared = progress.maxClearedLevelId;
        const display = chapters.map((chapter: ChapterModel) => {
            // 章节锁定规则：unlockAfterLevel 配置时，需通关该关后才解锁；开发预览时临时全解锁。
            const locked = !AppFlowController.DEBUG_UNLOCK_ALL_CHAPTERS
                && chapter.unlockAfterLevel != null
                && cleared < chapter.unlockAfterLevel;
            const inChapterCleared = Math.min(chapter.levelRange[1], Math.max(chapter.levelRange[0] - 1, cleared));
            return { chapter, locked, clearedMaxLevel: inChapterCleared };
        });
        this.mapView.setChapters(display);
        this.mapView.show();
    }

    private async goChapterStart(chapterId: string): Promise<void> {
        const chapter = (await ChapterRepository.findById(chapterId)) ?? null;
        if (!chapter) return;
        await this.requestStartLevel(chapter.levelRange[0]);
    }

    private async goChapterEndByLevel(levelId: LevelId): Promise<void> {
        if (levelId >= AppFlowController.HOME_LEVEL_MAX) {
            await this.goMap();
            return;
        }
        await this.requestStartLevel(levelId + 1);
    }

    private async goCollections(): Promise<void> {
        this.currentScene = 'collections';
        this.gameFlow.teardown();
        this.loadingRoot.active = false;
        this.gameRoot.active = false;
        this.mapRoot.active = false;
        this.beadStartRoot.active = false;
        this.hideChapterPages();
        this.homeRoot.active = false;
        this.collectionsRoot.active = true;
        this.collectionsView.show({
            onBack: () => { void this.goHome(); },
            onClose: () => { void this.goHome(); },
        });
    }

    private async requestStartLevel(levelId: LevelId): Promise<void> {
        if (await this.showSubchapterStartIfNeeded(levelId)) return;
        await this.startLevel(levelId);
    }

    private async showSubchapterStartIfNeeded(levelId: LevelId): Promise<boolean> {
        const context = await BeadProgressService.getStartContext(levelId);
        if (!context) return false;
        this.currentScene = 'beadStart';
        this.gameFlow.teardown();
        this.loadingRoot.active = false;
        this.homeRoot.active = false;
        this.mapRoot.active = false;
        this.collectionsRoot.active = false;
        this.gameRoot.active = false;
        this.hideChapterPages();
        this.beadStartRoot.active = true;
        this.beadStartModal.show({
            mode: 'start',
            subchapter: context.subchapter,
            puzzle: context.puzzle,
            visibleGroupIds: [],
            buttonText: 'Start',
            onAction: () => {
                BeadProgressService.markStartSeen(context.subchapter.puzzleId);
                this.beadStartModal.hide();
                this.beadStartRoot.active = false;
                void this.startLevel(levelId);
            },
        });
        return true;
    }

    private async startLevel(levelId: LevelId): Promise<void> {
        this.currentScene = 'game';
        this.loadingRoot.active = false;
        this.homeRoot.active = false;
        this.mapRoot.active = false;
        this.collectionsRoot.active = false;
        this.beadStartRoot.active = false;
        this.hideChapterPages();
        this.gameRoot.active = true;
        this.gameFlow.teardown();
        await this.gameFlow.boot(levelId);
    }

    private openSettings(): void {
        this.settingsRoot.active = true;
        this.settingsModal.show({
            onClose: () => {
                this.settingsModal.hide();
                this.settingsRoot.active = false;
            },
        });
    }

    private openProfile(): void {
        this.profileRoot.active = true;
        this.profileModal.show({
            onClose: () => {
                this.profileModal.hide();
                this.profileRoot.active = false;
                // 关闭后重新刷首页头像（ProfileStore 已在弹窗内 save）
                this.homeView.refreshAvatar();
            },
        });
    }

    private openShop(): void {
        this.shopRoot.active = true;
        this.shopView.show({
            onClose: () => {
                this.shopView.hide();
                this.shopRoot.active = false;
            },
        });
    }
}
