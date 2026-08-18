import { _decorator, AudioClip, AudioSource, Component, Label, LabelOutline, Node, Sprite, SpriteFrame, Tween, UITransform, UIOpacity, Vec3, director, easing, resources, tween } from 'cc';
import { EventKeys } from '../../core/EventKeys';
import { ComboEffectConfig } from '../../data/models/LevelThemeModel';
import { DEFAULT_LEVEL_THEME } from '../../config/level-themes';
import { colorFromHex, GAME_FONT_FAMILY } from '../common/UiFactory';
import { spawnSpineAnim } from './SpineAnimRegistry';
import { Haptic } from '../../core/HapticManager';
const { ccclass } = _decorator;
const COMBO_VOICE_PATH = 'audio/sfx/great_unbelievable';
const COMBO_VOICE_VOLUME = 0.78;
const GREAT_SEGMENT = { start: 0, duration: 0.95 };
const UNBELIEVABLE_SEGMENT = { start: 1.0, duration: 1.35 };

type ComboVoiceSegment = { start: number; duration: number };

/**
 * Combo 反馈：配置来自 level-themes/defaultTheme.ts 或单关 level-XXX.ts。
 */
@ccclass('ComboFeedback')
export class ComboFeedback extends Component {
    private frames = new Map<number, SpriteFrame>();
    /** 累计三消次数：用于 combo 文案；连续 3 次非三消点击后清零。 */
    private cumulativeMatchCount = 0;
    /** 连续三消次数：用于 randomAnimations，中间有非三消点击就清零。 */
    private consecutiveMatchCount = 0;
    /** 累计文案阶段内固定使用的文案。 */
    private currentCelebrationText: string | null = null;
    /** 累计三消后连续未三消的点击次数。 */
    private noMatchAfterCumulativeCount = 0;
    /** 当前文案预计结束时间，用于最终结算页避让。 */
    private celebrationHideAt = 0;
    private config: ComboEffectConfig = DEFAULT_LEVEL_THEME.effects?.combo ?? {};
    /** 上次播放的 randomAnim 索引，用于 noRepeat */
    private lastAnimIndex = -1;
    /** 当前连续 combo 文案节点，保证同一时间只显示一个 */
    private activeCelebration: Node | null = null;
    private comboVoiceSource: AudioSource | null = null;
    private comboVoiceClip: AudioClip | null = null;
    private pendingComboVoice: ComboVoiceSegment | null = null;
    private comboVoiceLoading = false;
    private comboVoicePlaying = false;
    private comboVoiceEndsAt = 0;
    private stopComboVoiceTask: (() => void) | null = null;

    onLoad(): void {
        this.configure(this.config);
        director.on(EventKeys.TileMatched, this.handleMatched, this);
        director.on(EventKeys.TileSelected, this.handlePickedWithoutMatch, this);
        director.on(EventKeys.LevelLoaded, this.resetComboRuntimeState, this);
        director.on(EventKeys.LevelWin, this.clearActiveCelebration, this);
        director.on(EventKeys.LevelLose, this.clearActiveCelebration, this);
    }

    onDestroy(): void {
        director.off(EventKeys.TileMatched, this.handleMatched, this);
        director.off(EventKeys.TileSelected, this.handlePickedWithoutMatch, this);
        director.off(EventKeys.LevelLoaded, this.resetComboRuntimeState, this);
        director.off(EventKeys.LevelWin, this.clearActiveCelebration, this);
        director.off(EventKeys.LevelLose, this.clearActiveCelebration, this);
        this.stopComboVoice();
        this.clearActiveCelebration();
    }

    onDisable(): void {
        this.stopComboVoice();
        this.clearActiveCelebration();
    }

    configure(config?: ComboEffectConfig): void {
        this.config = config ?? DEFAULT_LEVEL_THEME.effects?.combo ?? {};
        this.cumulativeMatchCount = 0;
        this.consecutiveMatchCount = 0;
        this.currentCelebrationText = null;
        this.noMatchAfterCumulativeCount = 0;
        this.celebrationHideAt = 0;
        this.frames.clear();
        this.stopComboVoice();
        this.clearActiveCelebration();
        this.preload();
    }

    private preload(): void {
        const paths = this.config.labelPaths ?? {};
        for (const [lvl, path] of Object.entries(paths)) {
            resources.load(path, SpriteFrame, (err, frame) => {
                if (!err && frame) this.frames.set(Number(lvl), frame);
            });
        }
        this.ensureComboVoiceClip();
    }

    public getCelebrationRemainingSec(): number {
        if (!this.activeCelebration?.isValid) return 0;
        return Math.max(0, this.celebrationHideAt - director.getTotalTime() / 1000);
    }

    public prepareComboVoiceForResult(maxWaitSec: number): number {
        const now = director.getTotalTime() / 1000;
        const current = this.comboVoicePlaying ? Math.max(0, this.comboVoiceEndsAt - now) : 0;
        if (this.pendingComboVoice && current + this.pendingComboVoice.duration > maxWaitSec) {
            this.pendingComboVoice = null;
        }
        return current + (this.pendingComboVoice?.duration ?? 0);
    }

    private resetComboRuntimeState(): void {
        this.cumulativeMatchCount = 0;
        this.consecutiveMatchCount = 0;
        this.currentCelebrationText = null;
        this.noMatchAfterCumulativeCount = 0;
        this.stopComboRuntimeFeedback();
    }

    private stopComboRuntimeFeedback(): void {
        this.stopComboVoice();
        this.clearActiveCelebration();
    }

    private handleMatched(): void {
        if (!this.node.activeInHierarchy || this.config.enabled === false) return;
        this.cumulativeMatchCount += 1;
        this.consecutiveMatchCount += 1;
        this.noMatchAfterCumulativeCount = 0;

        // randomAnimations 改为严格连续 combo：连续次数达到 interval 才触发。
        // 命中时先播特效并跳过文案，保证同一轮只出现一种反馈。
        if (this.tryPlayConsecutiveRandomAnimation()) return;

        // combo 文案改为累计次数：中间有非三消点击也不清零，所以会更常出现。
        if (this.tryPlayComboTextCelebration(this.cumulativeMatchCount)) return;

        if (this.config.labelEnabled === false || this.cumulativeMatchCount < 2) return;

        const labelLevels = Object.keys(this.config.labelPaths ?? {}).map((k) => Number(k)).sort((a, b) => a - b);
        const maxLevel = labelLevels.length > 0 ? labelLevels[labelLevels.length - 1] : 6;
        const lvl = Math.min(this.cumulativeMatchCount, maxLevel);
        const frame = this.frames.get(lvl);
        if (!frame) return;
        this.spawnLabel(frame);
    }

    private handlePickedWithoutMatch(): void {
        if (!this.node.activeInHierarchy) return;
        this.consecutiveMatchCount = 0;
        if (this.cumulativeMatchCount <= 0) return;

        this.noMatchAfterCumulativeCount += 1;
        if (this.noMatchAfterCumulativeCount >= 3) {
            this.cumulativeMatchCount = 0;
            this.currentCelebrationText = null;
            this.noMatchAfterCumulativeCount = 0;
        }
    }

    private tryPlayConsecutiveRandomAnimation(): boolean {
        if (this.config.randomAnimationEnabled === false) return false;
        const interval = Math.max(1, this.config.randomAnimationInterval ?? 1);
        if (this.consecutiveMatchCount < interval || this.consecutiveMatchCount % interval !== 0) return false;
        this.playRandomSpineCombo();
        return true;
    }

    private tryPlayComboTextCelebration(comboCount: number): boolean {
        const cfg = this.config.comboTextCelebration;
        if (!cfg || cfg.enabled === false) return false;
        const minComboCount = cfg.minComboCount ?? 2;
        if (comboCount < minComboCount) return false;

        const texts = cfg.texts && cfg.texts.length > 0 ? cfg.texts : ['Unbelievable!', 'Great!', 'Excellent!'];
        if (!this.currentCelebrationText) {
            this.currentCelebrationText = texts[Math.floor(Math.random() * texts.length)];
        }
        const comboMultiplier = comboCount - 1;
        const multiplier = comboMultiplier >= 2 ? ` x${comboMultiplier}` : '';
        const text = `${this.currentCelebrationText}${multiplier}`;
        this.playComboVoice(text);
        this.spawnComboTextCelebration(text);
        return true;
    }

    private getComboVoiceSource(): AudioSource {
        if (this.comboVoiceSource?.node?.isValid) return this.comboVoiceSource;
        const node = this.node.getChildByName('ComboVoiceSource') ?? new Node('ComboVoiceSource');
        if (!node.parent) {
            node.layer = this.node.layer;
            this.node.addChild(node);
        }
        this.comboVoiceSource = node.getComponent(AudioSource) ?? node.addComponent(AudioSource);
        return this.comboVoiceSource;
    }

    private playComboVoice(text: string): void {
        const lower = text.toLowerCase();
        const segment = lower.includes('unbelievable')
            ? UNBELIEVABLE_SEGMENT
            : lower.includes('great')
                ? GREAT_SEGMENT
                : null;
        if (!segment) return;

        if (this.comboVoicePlaying) {
            this.pendingComboVoice = segment;
        } else {
            this.pendingComboVoice = segment;
            this.ensureComboVoiceClip();
            this.playNextComboVoice();
        }
    }

    private ensureComboVoiceClip(): void {
        if (this.comboVoiceClip || this.comboVoiceLoading) return;
        this.comboVoiceLoading = true;
        resources.load(COMBO_VOICE_PATH, AudioClip, (err, clip) => {
            this.comboVoiceLoading = false;
            if (err || !clip || !this.node.isValid) return;
            this.comboVoiceClip = clip;
            this.playNextComboVoice();
        });
    }

    private playNextComboVoice(): void {
        if (this.comboVoicePlaying || !this.comboVoiceClip || !this.pendingComboVoice) return;
        const segment = this.pendingComboVoice;
        this.pendingComboVoice = null;
        const clip = this.comboVoiceClip;
        const source = this.getComboVoiceSource();
        source.clip = clip;
        source.loop = false;
        source.volume = COMBO_VOICE_VOLUME;
        source.currentTime = Math.min(segment.start, Math.max(0, clip.getDuration() - 0.05));
        source.play();
        this.comboVoicePlaying = true;
        const duration = Math.min(segment.duration, Math.max(0.05, clip.getDuration() - segment.start));
        this.comboVoiceEndsAt = director.getTotalTime() / 1000 + duration;
        this.stopComboVoiceTask = () => {
            source.stop();
            this.stopComboVoiceTask = null;
            this.comboVoicePlaying = false;
            this.comboVoiceEndsAt = 0;
            this.playNextComboVoice();
        };
        this.scheduleOnce(this.stopComboVoiceTask, duration);
    }

    private stopComboVoice(): void {
        this.pendingComboVoice = null;
        this.comboVoicePlaying = false;
        this.comboVoiceEndsAt = 0;
        if (this.stopComboVoiceTask) {
            this.unschedule(this.stopComboVoiceTask);
            this.stopComboVoiceTask = null;
        }
        this.comboVoiceSource?.stop();
    }

    private playRandomSpineCombo(): void {
        const animations = this.config.randomAnimations ?? [];
        if (animations.length === 0) return;

        let choice: number;
        const noRepeat = this.config.randomAnimationNoRepeat ?? false;
        if (noRepeat && animations.length > 1 && this.lastAnimIndex >= 0) {
            // 随机但不与上次重复
            const pool = Array.from({ length: animations.length }, (_, i) => i).filter(i => i !== this.lastAnimIndex);
            choice = pool[Math.floor(Math.random() * pool.length)];
        } else {
            choice = Math.floor(Math.random() * animations.length);
        }
        this.lastAnimIndex = choice;

        const layer = this.node;
        const speedScale = this.config.randomAnimationSpeedScale ?? 1;
        // combo 随机动画：震动时长与动画播放时长近似一致（speedScale 越大动画越短）
        Haptic.pulse(1.0 / Math.max(0.1, speedScale));
        animations[choice].spawns.forEach((spawn) => {
            spawnSpineAnim(layer, spawn.entry, spawn.x, spawn.y, spawn.size, {
                autoDestroy: true,
                flipX: spawn.flipX,
                scale: spawn.scale,
                speedScale,
                name: `Combo_${animations[choice].name}_${spawn.entry.resource}`,
            });
        });
    }

    private spawnComboTextCelebration(text: string): void {
        const cfg = this.config.comboTextCelebration ?? {};
        this.clearActiveCelebration();

        const width = cfg.width ?? 620;
        const height = cfg.height ?? 110;
        const root = new Node(`ComboText_${Date.now()}`);
        root.layer = this.node.layer;
        root.addComponent(UITransform).setContentSize(width, height);
        const opacity = root.addComponent(UIOpacity);
        opacity.opacity = 255;
        this.node.addChild(root);
        root.setPosition(new Vec3(cfg.x ?? 0, cfg.y ?? 490, 0));
        const enterScale = cfg.enterScale ?? 0.45;
        root.setScale(new Vec3(enterScale, enterScale, 1));
        this.activeCelebration = root;

        const fontSize = cfg.fontSize ?? 54;
        const enterDuration = cfg.enterDuration ?? 0.08;
        const holdDuration = cfg.holdDuration ?? 0.86;
        const exitDuration = cfg.exitDuration ?? 0.14;
        const settleDuration = 0.08;
        const settleScale = cfg.settleScale ?? 1;
        const exitScale = cfg.exitScale ?? 0.12;
        this.celebrationHideAt = director.getTotalTime() / 1000 + enterDuration + settleDuration + holdDuration + exitDuration;
        // combo 文案动画：震动时间与动画总时长一致
        Haptic.pulse(enterDuration + settleDuration + holdDuration + exitDuration);
        const shadowX = cfg.shadowOffsetX ?? 5;
        const shadowY = cfg.shadowOffsetY ?? -7;
        this.createCelebrationLabel(root, 'Shadow', text, shadowX, shadowY, fontSize, width, height, cfg.shadowColor ?? '#4422AA', cfg.outlineColor ?? '#6534E8', 4);
        this.createCelebrationLabel(root, 'Text', text, 0, 0, fontSize, width, height, cfg.textColor ?? '#FFE934', cfg.outlineColor ?? '#6534E8', cfg.outlineWidth ?? 8);
        this.spawnCelebrationStars(root, text, cfg.starCount ?? 4, cfg.starSize ?? 30, fontSize, width, height, enterDuration, holdDuration, exitDuration);

        tween(root)
            .to(enterDuration, { scale: new Vec3(settleScale * 1.08, settleScale * 1.08, 1) }, { easing: easing.backOut })
            .to(settleDuration, { scale: new Vec3(settleScale, settleScale, 1) })
            .delay(holdDuration)
            .to(exitDuration, { scale: new Vec3(exitScale, exitScale, 1) }, { easing: easing.cubicIn })
            .call(() => {
                if (root.isValid) root.destroy();
                if (this.activeCelebration === root) {
                    this.activeCelebration = null;
                    this.celebrationHideAt = 0;
                }
            })
            .start();

        tween(opacity)
            .delay(enterDuration + holdDuration)
            .to(exitDuration, { opacity: 0 })
            .start();
    }

    private clearActiveCelebration(): void {
        if (this.activeCelebration?.isValid) {
            Tween.stopAllByTarget(this.activeCelebration);
            this.activeCelebration.destroy();
        }
        this.activeCelebration = null;
        this.celebrationHideAt = 0;
    }

    private createCelebrationLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, width: number, height: number, colorHex: string, outlineHex: string, outlineWidth: number): Label {
        const node = new Node(`Combo${name}`);
        node.layer = parent.layer;
        parent.addChild(node);
        node.setPosition(new Vec3(x, y, 0));
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.fontFamily = GAME_FONT_FAMILY;
        label.lineHeight = Math.round(fontSize * 1.15);
        label.color = colorFromHex(colorHex);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.enableWrapText = false;
        (label as unknown as { isBold?: boolean }).isBold = true;
        if (outlineWidth > 0) {
            const outline = node.addComponent(LabelOutline);
            outline.color = colorFromHex(outlineHex);
            outline.width = outlineWidth;
        }
        return label;
    }

    private spawnCelebrationStars(parent: Node, text: string, count: number, size: number, fontSize: number, width: number, height: number, enterDuration: number, holdDuration: number, exitDuration: number): void {
        const textWidth = Math.min(width * 0.88, Math.max(fontSize * 2.2, text.length * fontSize * 0.58));
        const sideGap = size * 0.85;
        const leftX = -textWidth / 2 - sideGap;
        const rightX = textWidth / 2 + sideGap;
        const positions = [
            { x: leftX, y: height * 0.10 },
            { x: leftX + size * 0.35, y: height * 0.36 },
            { x: rightX, y: height * 0.32 },
            { x: rightX - size * 0.25, y: height * 0.02 },
            { x: rightX - size * 0.85, y: -height * 0.24 },
        ];
        const shrinkDelay = Math.max(0.18, enterDuration + holdDuration - 0.16);
        const shrinkDuration = Math.min(0.18, Math.max(0.08, exitDuration));
        for (let i = 0; i < Math.max(0, count); i += 1) {
            const pos = positions[i % positions.length];
            const star = this.createCelebrationLabel(parent, `Star${i}`, i % 2 === 0 ? '✦' : '★', pos.x, pos.y, size * (i % 2 === 0 ? 1 : 0.78), size * 2, size * 2, '#FFF56A', '#FFFFFF', 2);
            const node = star.node;
            const targetScale = i % 2 === 0 ? 1 : 0.86;
            node.setScale(new Vec3(0.1, 0.1, 1));
            tween(node)
                .delay(i * 0.03)
                .to(0.12, { scale: new Vec3(targetScale * 1.22, targetScale * 1.22, 1) }, { easing: easing.backOut })
                .to(0.08, { scale: new Vec3(targetScale, targetScale, 1) })
                .delay(shrinkDelay)
                .to(shrinkDuration, { scale: new Vec3(0.08, 0.08, 1) }, { easing: easing.cubicIn })
                .start();
        }
    }

    private spawnLabel(frame: SpriteFrame): void {
        const style = this.config.labelStyle ?? {};
        const node = new Node(`Combo_${Date.now()}`);
        node.layer = this.node.layer;
        const sp = node.addComponent(Sprite);
        sp.spriteFrame = frame;
        sp.sizeMode = Sprite.SizeMode.TRIMMED;
        const ut = node.addComponent(UITransform);
        const maxW = style.maxWidth ?? 560;
        const origW = frame.rect.width;
        const origH = frame.rect.height;
        const ratio = Math.min(1, maxW / origW);
        ut.setContentSize(origW * ratio, origH * ratio);
        this.node.addChild(node);
        const startX = style.startX ?? 0;
        const startY = style.startY ?? -50;
        const enterY = style.enterY ?? 30;
        const endY = style.endY ?? 80;
        const enterDuration = style.enterDuration ?? 0.18;
        const settleDuration = style.settleDuration ?? 0.10;
        const holdDuration = style.holdDuration ?? 0.45;
        const exitDuration = style.exitDuration ?? 0.30;
        // combo 数字标签动画：震动时间与动画总时长一致
        Haptic.pulse(enterDuration + settleDuration + holdDuration + exitDuration);
        node.setPosition(new Vec3(startX, startY, 0));
        node.setScale(new Vec3(0, 0, 1));
        sp.color.set(255, 255, 255, 0);

        tween(node)
            .to(enterDuration, { scale: new Vec3(style.enterScale ?? 1.2, style.enterScale ?? 1.2, 1), position: new Vec3(startX, enterY, 0) }, { easing: easing.backOut })
            .to(settleDuration, { scale: new Vec3(style.settleScale ?? 1, style.settleScale ?? 1, 1) })
            .delay(holdDuration)
            .to(exitDuration, { scale: new Vec3(style.exitScale ?? 1.15, style.exitScale ?? 1.15, 1), position: new Vec3(startX, endY, 0) })
            .call(() => { if (node.isValid) node.destroy(); })
            .start();

        const startMs = Date.now();
        const hold = enterDuration + settleDuration + holdDuration;
        const total = hold + exitDuration;
        const tick = () => {
            if (!node.isValid) return;
            const t = (Date.now() - startMs) / 1000;
            let alpha = 255;
            if (t < enterDuration) alpha = (t / enterDuration) * 255;
            else if (t > hold) alpha = Math.max(0, (1 - (t - hold) / exitDuration)) * 255;
            sp.color.set(255, 255, 255, alpha);
            sp.markForUpdateRenderData();
            if (t < total) requestAnimationFrame(tick);
        };
        tick();
    }
}
