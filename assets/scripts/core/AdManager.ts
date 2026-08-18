import { NATIVE } from 'cc/env';
import { sys, BlockInputEvents, Node, UITransform, Color, Label, Sprite, UIOpacity, Vec3, view, director } from 'cc';
import { native } from 'cc';

// ─────────────────────────────────────────────────────────────────
// AdManager — 广告统一入口（激励视频 / 插屏 / 横幅）
//
// 设计要点：
//  - 单例，与 HapticManager 同模式。
//  - Web/H5 环境下走 Mock 模式（模拟成功回调 + 视觉遮罩）。
//  - 原生环境（Android/iOS）走 JsbBridge 直接与 AdServiceHub 通信。
//  - 业务层只调 showRewarded / showInterstitial / showBanner，不关心底层实现。
// ─────────────────────────────────────────────────────────────────

/** 广告类型 */
export type AdFormat = 'rewarded' | 'interstitial' | 'banner';

/** 激励视频回调 */
export interface RewardedAdCallbacks {
    onReward: () => void;
    onClose?: () => void;
    onError?: (msg: string) => void;
}

/** 插屏回调 */
export interface InterstitialAdCallbacks {
    onClose?: () => void;
    onError?: (msg: string) => void;
}

/** 横幅回调 */
export interface BannerAdCallbacks {
    onLoaded?: () => void;
    onError?: (msg: string) => void;
}

/** 广告位配置 */
export interface AdUnitConfig {
    rewarded: string;
    interstitial: string;
    banner: string;
}

/** Google 官方测试广告位 ID */
const TEST_AD_UNITS: AdUnitConfig = {
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    banner: 'ca-app-pub-3940256099942544/6300978111',
};

/** Allen 真实 AdMob 广告位 ID（上线前切换） */
const PROD_AD_UNITS: AdUnitConfig = {
    rewarded: 'ca-app-pub-3692744985870171/5125197142',
    interstitial: 'ca-app-pub-3692744985870171/1173354161',
    banner: 'ca-app-pub-3692744985870171/9344173986',
};

/** Allen 真实 AdMob App ID */
const PROD_APP_ID = 'ca-app-pub-3692744985870171~5715389939';

/** Mock 模式下模拟广告观看时长（毫秒） */
const MOCK_AD_DURATION_MS = 2000;

// ────────── Mock 视觉层（Web 预览用） ──────────

class MockAdOverlay {
    private overlayNode: Node | null = null;
    private bannerNode: Node | null = null;

    private getCanvas(): Node | null {
        const scene = director?.getScene?.();
        return scene?.getChildByName('Canvas') ?? scene?.children?.[0] ?? null;
    }

    showFullAd(format: AdFormat, durationMs: number, onComplete: () => void): void {
        const parent = this.getCanvas();
        if (!parent) { onComplete(); return; }

        const visibleSize = view.getVisibleSize();
        const node = new Node('MockAdOverlay');
        const transform = node.addComponent(UITransform);
        transform.setContentSize(visibleSize.width, visibleSize.height);
        node.addComponent(BlockInputEvents);
        node.addComponent(UIOpacity).opacity = 0;

        const bg = new Node('Bg');
        const bgTransform = bg.addComponent(UITransform);
        bgTransform.setContentSize(visibleSize.width, visibleSize.height);
        const bgSprite = bg.addComponent(Sprite);
        bgSprite.type = Sprite.Type.SIMPLE;
        bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        bgSprite.color = new Color(0, 0, 0, 230);
        node.addChild(bg);

        const titleText = format === 'rewarded' ? '📺  Rewarded Ad' : '📢  Interstitial Ad';
        const title = new Node('Title');
        title.addComponent(UITransform).setContentSize(600, 60);
        const titleLbl = title.addComponent(Label);
        titleLbl.string = titleText;
        titleLbl.fontSize = 36;
        titleLbl.color = new Color(255, 255, 255, 255);
        title.setPosition(0, 80, 0);
        node.addChild(title);

        const countdown = new Node('Countdown');
        countdown.addComponent(UITransform).setContentSize(200, 80);
        const countdownLbl = countdown.addComponent(Label);
        countdownLbl.string = `${Math.ceil(durationMs / 1000)}`;
        countdownLbl.fontSize = 60;
        countdownLbl.color = new Color(255, 215, 0, 255);
        countdown.setPosition(0, -20, 0);
        node.addChild(countdown);

        const hint = new Node('Hint');
        hint.addComponent(UITransform).setContentSize(600, 40);
        const hintLbl = hint.addComponent(Label);
        hintLbl.string = 'Web Preview — 非真实广告';
        hintLbl.fontSize = 22;
        hintLbl.color = new Color(180, 180, 180, 200);
        hint.setPosition(0, -100, 0);
        node.addChild(hint);

        parent.addChild(node);
        node.setSiblingIndex(parent.children.length - 1);
        this.overlayNode = node;

        const opacity = node.getComponent(UIOpacity)!;
        let fadeInDone = false;
        const startTime = Date.now();
        const tick = () => {
            if (!this.overlayNode || this.overlayNode !== node) return;
            const elapsed = Date.now() - startTime;
            if (!fadeInDone) {
                opacity.opacity = Math.min(255, (elapsed / 200) * 255);
                if (elapsed >= 200) { fadeInDone = true; opacity.opacity = 255; }
            }
            const remain = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
            countdownLbl.string = `${remain}`;
            if (elapsed >= durationMs) {
                const fadeStart = Date.now();
                const fadeTick = () => {
                    const fadeElapsed = Date.now() - fadeStart;
                    opacity.opacity = Math.max(0, 255 - (fadeElapsed / 300) * 255);
                    if (fadeElapsed >= 300) {
                        node.destroy();
                        if (this.overlayNode === node) this.overlayNode = null;
                        onComplete();
                    } else {
                        requestAnimationFrame(fadeTick);
                    }
                };
                requestAnimationFrame(fadeTick);
                return;
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    showBannerPlaceholder(): void {
        if (this.bannerNode) return;
        const parent = this.getCanvas();
        if (!parent) return;

        const visibleSize = view.getVisibleSize();
        const bannerH = 70;
        const node = new Node('MockBanner');
        const transform = node.addComponent(UITransform);
        transform.setContentSize(visibleSize.width, bannerH);
        node.addComponent(UIOpacity).opacity = 0;

        const bg = new Node('Bg');
        const bgTransform = bg.addComponent(UITransform);
        bgTransform.setContentSize(visibleSize.width, bannerH);
        const bgSprite = bg.addComponent(Sprite);
        bgSprite.type = Sprite.Type.SIMPLE;
        bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        bgSprite.color = new Color(30, 30, 30, 220);
        node.addChild(bg);

        const lbl = new Node('Label');
        lbl.addComponent(UITransform).setContentSize(visibleSize.width, bannerH);
        const label = lbl.addComponent(Label);
        label.string = '📢  Banner Ad Placeholder  —  Web Preview';
        label.fontSize = 22;
        label.color = new Color(200, 200, 200, 220);
        node.addChild(lbl);

        node.setPosition(0, -visibleSize.height / 2 + bannerH / 2, 0);
        parent.addChild(node);
        this.bannerNode = node;

        const opacity = node.getComponent(UIOpacity)!;
        const start = Date.now();
        const tick = () => {
            if (this.bannerNode !== node) return;
            const elapsed = Date.now() - start;
            opacity.opacity = Math.min(220, (elapsed / 300) * 220);
            if (elapsed < 300) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    hideBannerPlaceholder(): void {
        if (!this.bannerNode) return;
        const node = this.bannerNode;
        this.bannerNode = null;
        const opacity = node.getComponent(UIOpacity);
        if (!opacity) { node.destroy(); return; }
        const start = Date.now();
        const tick = () => {
            const elapsed = Date.now() - start;
            opacity.opacity = Math.max(0, 220 - (elapsed / 200) * 220);
            if (elapsed >= 200) { node.destroy(); } else { requestAnimationFrame(tick); }
        };
        requestAnimationFrame(tick);
    }
}

// ────────── Mock Bridge（Web 环境） ──────────

class MockNativeBridge {
    private overlay = new MockAdOverlay();

    init(_appId: string): void {
        console.log('[AdManager] Mock init, appId:', _appId);
    }

    showRewarded(adUnitId: string, callbacks: RewardedAdCallbacks): void {
        console.log('[AdManager] Mock showRewarded');
        this.overlay.showFullAd('rewarded', MOCK_AD_DURATION_MS, () => {
            callbacks.onReward();
            callbacks.onClose?.();
        });
    }

    showInterstitial(adUnitId: string, callbacks: InterstitialAdCallbacks): void {
        console.log('[AdManager] Mock showInterstitial');
        this.overlay.showFullAd('interstitial', MOCK_AD_DURATION_MS, () => {
            callbacks.onClose?.();
        });
    }

    showBanner(adUnitId: string, callbacks: BannerAdCallbacks): void {
        console.log('[AdManager] Mock showBanner');
        this.overlay.showBannerPlaceholder();
        callbacks.onLoaded?.();
    }

    hideBanner(): void {
        console.log('[AdManager] Mock hideBanner');
        this.overlay.hideBannerPlaceholder();
    }
}

// ────────── JsbBridge 原生桥接层 ──────────
// 直接用 native.bridge (JsbBridge) 与 Java AdServiceHub 通信
// 协议：JSON 编码，method 名为 Java proto 类名

/** JsbBridge 消息中的 method 名 */
const METHOD = {
    // Rewarded
    LOAD_REWARDED: 'LoadRewardedAdREQ',
    SHOW_REWARDED: 'ShowRewardedAdREQ',
    REWARDED_LOAD_CB: 'RewardedAdLoadCallbackNTF',
    REWARDED_EARN: 'OnUserEarnedRewardListenerNTF',
    REWARDED_FULLSCREEN_CB: 'RewardedFullScreenContentCallbackNTF',
    // Interstitial
    LOAD_INTERSTITIAL: 'LoadInterstitialAdREQ',
    SHOW_INTERSTITIAL: 'ShowInterstitialAdREQ',
    INTERSTITIAL_LOAD_CB: 'InterstitialAdLoadCalLBackNTF',
    INTERSTITIAL_FULLSCREEN_CB: 'InterstitialFullScreenContentCallbackNTF',
    // Banner
    LOAD_BANNER: 'LoadBannerREQ',
    SHOW_BANNER: 'ShowBannerREQ',
    DESTROY_BANNER: 'DestroyBannerREQ',
    BANNER_LISTENER: 'BannerAdListenerNTF',
};

type NativeCallback = (method: string, data: any) => void;

class NativeAdBridge {
    private bridgeReady = false;
    private callbackMap = new Map<string, NativeCallback[]>();

    constructor() {
        this.setupListener();
    }

    /** 设置 JsbBridge 监听，接收 Java 端回调 */
    private setupListener(): void {
        if (!NATIVE || !native?.bridge) return;

        const origHandler = native.bridge.onNative;
        native.bridge.onNative = (arg0: string, arg1: string) => {
            // 先调原来的 handler（如果有）
            if (origHandler) origHandler(arg0, arg1);
            // 再路由到我们的回调
            this.dispatch(arg0, arg1);
        };
        this.bridgeReady = true;
        console.log('[AdManager] Native bridge listener set up');
    }

    /** 注册某个 method 的回调 */
    on(method: string, cb: NativeCallback): void {
        if (!this.callbackMap.has(method)) {
            this.callbackMap.set(method, []);
        }
        this.callbackMap.get(method)!.push(cb);
    }

    /** 取消注册 */
    off(method: string, cb: NativeCallback): void {
        const arr = this.callbackMap.get(method);
        if (!arr) return;
        const idx = arr.indexOf(cb);
        if (idx >= 0) arr.splice(idx, 1);
    }

    /** 分发 Java → TS 消息 */
    private dispatch(method: string, jsonStr: string): void {
        console.log(`[AdManager] Native callback: ${method} ← ${jsonStr}`);
        let data: any;
        try {
            data = JSON.parse(jsonStr);
        } catch {
            data = { raw: jsonStr };
        }
        const cbs = this.callbackMap.get(method);
        if (cbs) {
            for (const cb of cbs) {
                try { cb(method, data); } catch (e) { console.error('[AdManager] callback error', e); }
            }
        }
    }

    /** 发送 TS → Java 消息 */
    send(method: string, data: Record<string, any>): void {
        if (!NATIVE || !native?.bridge) {
            console.warn('[AdManager] Cannot send to native — not in native environment');
            return;
        }
        const jsonStr = JSON.stringify(data);
        console.log(`[AdManager] Send to native: ${method} → ${jsonStr}`);
        native.bridge.sendToNative(method, jsonStr);
    }
}

// ────────── AdMob 原生 Bridge ──────────

class AdMobNativeBridge {
    private jsb = new NativeAdBridge();
    /** 激励广告是否已预加载就绪 */
    private rewardedReady = false;
    /** 激励广告是否正在加载中 */
    private rewardedLoading = false;
    /** 当前激励广告 unitId */
    private rewardedUnitId = '';

    init(_appId: string): void {
        console.log('[AdManager] AdMob native bridge init — SDK initialized in AppActivity.java');
        // AdServiceHub.init() 在 AppActivity.onCreate 里已调用
        // 不需要 TS 侧再初始化
    }

    /** 预加载激励广告，在游戏开始/关卡开始时调用 */
    preloadRewarded(adUnitId: string): void {
        if (this.rewardedReady || this.rewardedLoading) {
            console.log('[AdManager] Rewarded ad already ready or loading, skip preload');
            return;
        }
        this.rewardedUnitId = adUnitId;
        this.rewardedLoading = true;
        console.log('[AdManager] Preloading rewarded ad, unitId:', adUnitId);

        const onLoadCb = (_method: string, data: any) => {
            if (data.unitId !== adUnitId) return;
            if (data.method === 'onAdLoaded') {
                console.log('[AdManager] Rewarded ad preloaded ✓');
                this.rewardedReady = true;
                this.rewardedLoading = false;
                this.jsb.off(METHOD.REWARDED_LOAD_CB, onLoadCb);
            } else if (data.method === 'onAdFailedToLoad') {
                console.warn('[AdManager] Rewarded ad preload failed:', data.loadAdError);
                this.rewardedLoading = false;
                this.jsb.off(METHOD.REWARDED_LOAD_CB, onLoadCb);
            }
        };
        this.jsb.on(METHOD.REWARDED_LOAD_CB, onLoadCb);
        this.jsb.send(METHOD.LOAD_REWARDED, { unitId: adUnitId });
    }

    /** 激励视频：已预加载则直接 show，否则先 load 再 show */
    showRewarded(adUnitId: string, callbacks: RewardedAdCallbacks): void {
        console.log('[AdManager] Native showRewarded, unitId:', adUnitId, 'ready:', this.rewardedReady);

        let rewarded = false;
        let onLoadCb: NativeCallback | null = null;
        let onFullscreenCb: NativeCallback = () => {};

        const onEarnCb: NativeCallback = (_method, data) => {
            if (data.unitId !== adUnitId) return;
            console.log('[AdManager] User earned reward, type:', data.rewardType, 'amount:', data.rewardAmount);
            rewarded = true;
            callbacks.onReward();
        };

        const cleanup = (): void => {
            if (onLoadCb) this.jsb.off(METHOD.REWARDED_LOAD_CB, onLoadCb);
            this.jsb.off(METHOD.REWARDED_EARN, onEarnCb);
            this.jsb.off(METHOD.REWARDED_FULLSCREEN_CB, onFullscreenCb);
        };

        onFullscreenCb = (_method, data) => {
            if (data.unitId !== adUnitId) return;
            if (data.method === 'onAdDismissedFullScreenContent') {
                console.log('[AdManager] Rewarded ad dismissed');
                cleanup();
                if (!rewarded) {
                    console.warn('[AdManager] Ad dismissed without reward');
                }
                callbacks.onClose?.();
                this.preloadRewarded(adUnitId);
            } else if (data.method === 'onAdFailedToShowFullScreenContent') {
                console.error('[AdManager] Rewarded ad failed to show:', data.adError);
                cleanup();
                callbacks.onError?.(`Show failed: ${data.adError}`);
                this.preloadRewarded(adUnitId);
            }
        };

        this.jsb.on(METHOD.REWARDED_EARN, onEarnCb);
        this.jsb.on(METHOD.REWARDED_FULLSCREEN_CB, onFullscreenCb);

        if (this.rewardedReady) {
            console.log('[AdManager] Rewarded ad preloaded, show immediately');
            this.rewardedReady = false;
            this.jsb.send(METHOD.SHOW_REWARDED, { unitId: adUnitId });
        } else {
            console.log('[AdManager] Rewarded ad not preloaded, load first');
            this.rewardedLoading = true;
            onLoadCb = (_method, data) => {
                if (data.unitId !== adUnitId) return;
                if (data.method === 'onAdLoaded') {
                    console.log('[AdManager] Rewarded ad loaded on demand, showing...');
                    if (onLoadCb) this.jsb.off(METHOD.REWARDED_LOAD_CB, onLoadCb);
                    this.rewardedLoading = false;
                    this.jsb.send(METHOD.SHOW_REWARDED, { unitId: adUnitId });
                } else if (data.method === 'onAdFailedToLoad') {
                    console.warn('[AdManager] Rewarded ad failed to load on demand:', data.loadAdError);
                    this.rewardedLoading = false;
                    cleanup();
                    callbacks.onError?.(`Load failed: ${data.loadAdError}`);
                }
            };
            this.jsb.on(METHOD.REWARDED_LOAD_CB, onLoadCb);
            this.jsb.send(METHOD.LOAD_REWARDED, { unitId: adUnitId });
        }
    }

    /** 插屏广告：先 load → 等 onAdLoaded → show → 等 onDismissed */
    showInterstitial(adUnitId: string, callbacks: InterstitialAdCallbacks): void {
        console.log('[AdManager] Native showInterstitial, unitId:', adUnitId);

        const onLoadCb = (_method: string, data: any) => {
            if (data.unitId !== adUnitId) return;
            if (data.method === 'onAdLoaded') {
                console.log('[AdManager] Interstitial ad loaded, showing...');
                this.jsb.off(METHOD.INTERSTITIAL_LOAD_CB, onLoadCb);
                this.jsb.send(METHOD.SHOW_INTERSTITIAL, { unitId: adUnitId });
            } else if (data.method === 'onAdFailedToLoad') {
                console.error('[AdManager] Interstitial ad failed to load:', data.loadAdError);
                this.jsb.off(METHOD.INTERSTITIAL_LOAD_CB, onLoadCb);
                this.jsb.off(METHOD.INTERSTITIAL_FULLSCREEN_CB, onFullscreenCb);
                callbacks.onError?.(`Load failed: ${data.loadAdError}`);
            }
        };

        const onFullscreenCb = (_method: string, data: any) => {
            if (data.unitId !== adUnitId) return;
            if (data.method === 'onAdDismissedFullScreenContent') {
                console.log('[AdManager] Interstitial ad dismissed');
                this.jsb.off(METHOD.INTERSTITIAL_LOAD_CB, onLoadCb);
                this.jsb.off(METHOD.INTERSTITIAL_FULLSCREEN_CB, onFullscreenCb);
                callbacks.onClose?.();
            } else if (data.method === 'onAdFailedToShowFullScreenContent') {
                console.error('[AdManager] Interstitial ad failed to show:', data.adError);
                this.jsb.off(METHOD.INTERSTITIAL_LOAD_CB, onLoadCb);
                this.jsb.off(METHOD.INTERSTITIAL_FULLSCREEN_CB, onFullscreenCb);
                callbacks.onError?.(`Show failed: ${data.adError}`);
            }
        };

        this.jsb.on(METHOD.INTERSTITIAL_LOAD_CB, onLoadCb);
        this.jsb.on(METHOD.INTERSTITIAL_FULLSCREEN_CB, onFullscreenCb);

        this.jsb.send(METHOD.LOAD_INTERSTITIAL, { unitId: adUnitId });
    }

    /** Banner 广告：load → show */
    showBanner(adUnitId: string, callbacks: BannerAdCallbacks): void {
        console.log('[AdManager] Native showBanner, unitId:', adUnitId);

        const onBannerCb = (_method: string, data: any) => {
            if (data.unitId !== adUnitId) return;
            if (data.method === 'onAdLoaded') {
                console.log('[AdManager] Banner ad loaded');
                this.jsb.off(METHOD.BANNER_LISTENER, onBannerCb);
                // 显示 banner
                this.jsb.send(METHOD.SHOW_BANNER, { unitId: adUnitId, visible: true });
                callbacks.onLoaded?.();
            } else if (data.method === 'onAdFailedToLoad') {
                console.error('[AdManager] Banner ad failed to load:', data.loadAdError);
                this.jsb.off(METHOD.BANNER_LISTENER, onBannerCb);
                callbacks.onError?.(`Load failed: ${data.loadAdError}`);
            }
        };

        this.jsb.on(METHOD.BANNER_LISTENER, onBannerCb);

        // 加载 banner：使用 BANNER 尺寸，底部居中
        this.jsb.send(METHOD.LOAD_BANNER, {
            unitId: adUnitId,
            bannerSizeType: 'Builtin',
            bannerSize: 'BANNER',
            alignments: ['ALIGN_PARENT_BOTTOM', 'CENTER_HORIZONTAL'],
        });
    }

    /** 隐藏 banner（通过 destroy） */
    hideBanner(adUnitId: string): void {
        console.log('[AdManager] Native hideBanner (destroy), unitId:', adUnitId);
        this.jsb.send(METHOD.DESTROY_BANNER, { unitId: adUnitId });
    }
}

// ────────── 主管理类 ──────────

class AdManagerImpl {
    private adUnits: AdUnitConfig = { ...TEST_AD_UNITS };
    private bridge: MockNativeBridge | AdMobNativeBridge;
    private initialized = false;
    private adShowing = false;
    private interstitialLevelCounter = 0;
    private interstitialInterval = 5;
    private bannerVisible = false;

    constructor() {
        if (NATIVE) {
            this.bridge = new AdMobNativeBridge();
            console.log('[AdManager] Native environment — using JsbBridge');
        } else {
            this.bridge = new MockNativeBridge();
            console.log('[AdManager] Web/H5 environment — using Mock bridge');
        }
    }

    /**
     * 初始化广告 SDK。
     * @param config 可选自定义广告位 ID，不传则使用测试 ID
     * @param useProdUnits 是否使用生产广告位 ID（默认 false）
     */
    init(config?: Partial<AdUnitConfig>, useProdUnits = false): void {
        if (this.initialized) return;
        const source = useProdUnits ? PROD_AD_UNITS : TEST_AD_UNITS;
        this.adUnits = { ...source, ...config };
        const appId = NATIVE && useProdUnits ? PROD_APP_ID : this.adUnits.rewarded.split('/')[0];
        this.bridge.init(appId);
        this.initialized = true;
        console.log('[AdManager] Initialized with ad units:', this.adUnits, 'appId:', appId);
        // 初始化后自动预加载激励广告
        if (this.bridge instanceof AdMobNativeBridge) {
            (this.bridge as AdMobNativeBridge).preloadRewarded(this.adUnits.rewarded);
        }
    }

    /** 预加载激励广告（手动触发，通常不需要，init 时已自动预加载） */
    preloadRewarded(): void {
        if (!this.initialized) this.init();
        if (this.bridge instanceof AdMobNativeBridge) {
            (this.bridge as AdMobNativeBridge).preloadRewarded(this.adUnits.rewarded);
        }
    }

    /** 展示激励视频广告（复活等场景） */
    showRewarded(callbacks: RewardedAdCallbacks): void {
        if (this.adShowing) {
            console.warn('[AdManager] Ad already showing, skip');
            callbacks.onError?.('Ad already showing');
            return;
        }
        if (!this.initialized) this.init();
        this.adShowing = true;
        this.bridge.showRewarded(this.adUnits.rewarded, {
            onReward: () => { callbacks.onReward(); },
            onClose: () => { this.adShowing = false; callbacks.onClose?.(); },
            onError: (msg) => { this.adShowing = false; callbacks.onError?.(msg); },
        });
    }

    /** 通关后调用，每 N 关自动弹出插屏广告 */
    onLevelWin(callbacks: InterstitialAdCallbacks): void {
        this.interstitialLevelCounter++;
        if (this.interstitialLevelCounter < this.interstitialInterval) {
            callbacks.onClose?.();
            return;
        }
        this.interstitialLevelCounter = 0;
        this.showInterstitial(callbacks);
    }

    /** 直接展示插屏广告 */
    showInterstitial(callbacks: InterstitialAdCallbacks): void {
        if (this.adShowing) {
            console.warn('[AdManager] Ad already showing, skip interstitial');
            callbacks.onClose?.();
            return;
        }
        if (!this.initialized) this.init();
        this.adShowing = true;
        this.bridge.showInterstitial(this.adUnits.interstitial, {
            onClose: () => { this.adShowing = false; callbacks.onClose?.(); },
            onError: (msg) => { this.adShowing = false; callbacks.onError?.(msg); },
        });
    }

    /** 展示横幅广告（首页底部） */
    showBanner(callbacks?: BannerAdCallbacks): void {
        if (this.bannerVisible) return;
        if (!this.initialized) this.init();
        this.bannerVisible = true;
        this.bridge.showBanner(this.adUnits.banner, {
            onLoaded: () => callbacks?.onLoaded?.(),
            onError: (msg) => { this.bannerVisible = false; callbacks?.onError?.(msg); },
        });
    }

    /** 隐藏横幅广告 */
    hideBanner(): void {
        if (!this.bannerVisible) return;
        this.bannerVisible = false;
        if (this.bridge instanceof AdMobNativeBridge) {
            this.bridge.hideBanner(this.adUnits.banner);
        } else {
            this.bridge.hideBanner();
        }
    }

    /** 设置插屏弹出间隔（关数） */
    setInterstitialInterval(n: number): void {
        this.interstitialInterval = Math.max(1, n);
    }

    /** 重置插屏计数器 */
    resetInterstitialCounter(): void {
        this.interstitialLevelCounter = 0;
    }

    get isBannerVisible(): boolean { return this.bannerVisible; }
    get isAdShowing(): boolean { return this.adShowing; }
}

export const Ad = new AdManagerImpl();
