import { AudioClip, AudioSource, Node, resources } from 'cc';
import type { FeedbackSound, LevelAudioTheme } from '../../data/models/LevelThemeModel';
import { Haptic } from '../../core/HapticManager';

const DEFAULT_SOUND_PATHS: Record<FeedbackSound, string> = {
    click: 'audio/sfx/click_new',
    match: 'audio/sfx/match_new',
    hint: 'audio/sfx/hint_new',
    shuffle: 'audio/sfx/shuffle_new',
    undo: 'audio/sfx/undo_new',
    win: 'audio/sfx/level_complete_new',
    fail: 'audio/sfx/fail_new',
};

const DEFAULT_BGM_PATH = 'audio/bgm/BGM_ingame';
const DEFAULT_BGM_VOLUME = 0.56;
const BGM_START_OFFSET_SECONDS = 1;

export type { FeedbackSound };

export class AudioFeedback {
    private sfxSource: AudioSource;
    private bgmSource: AudioSource;
    private cache = new Map<string, AudioClip>();
    private theme: LevelAudioTheme = {};
    private currentBgmPath = '';
    private bgmRequestId = 0;

    constructor(host: Node) {
        this.sfxSource = host.getComponent(AudioSource) ?? host.addComponent(AudioSource);
        const bgmNodes = host.children.filter((child) => child.name === 'BGMSource');
        const bgmNode = bgmNodes[0] ?? new Node('BGMSource');
        if (!bgmNode.parent) {
            bgmNode.layer = host.layer;
            host.addChild(bgmNode);
        }
        bgmNodes.slice(1).forEach((node) => node.destroy());
        this.bgmSource = bgmNode.getComponent(AudioSource) ?? bgmNode.addComponent(AudioSource);
    }

    configure(theme?: LevelAudioTheme): void {
        this.theme = theme ?? {};
    }

    play(sound: FeedbackSound, volume = 1): void {
        const cfg = this.theme.sfx?.[sound];
        if (cfg?.enabled === false) return;
        // 瓷砖消除统一震动：所有消除路径（普通三消 + 各种 golden 消除）都会播 'match' 音效，
        // 挂在这里可一处覆盖全部消除，且与 combo 动画的脉冲自然叠加。
        // click（点击）不震，避免每点一下都震得太吵；按钮的释放震动另由 UI 层处理。
        if (sound === 'match') {
            Haptic.pulse(0.18);
        }
        const path = cfg?.path ?? DEFAULT_SOUND_PATHS[sound];
        const finalVolume = volume * (cfg?.volume ?? 1);
        const cached = this.cache.get(path);
        if (cached) {
            this.sfxSource.playOneShot(cached, finalVolume);
            return;
        }
        resources.load(path, AudioClip, (error, clip) => {
            if (error || !clip) return;
            this.cache.set(path, clip);
            this.sfxSource.playOneShot(clip, finalVolume);
        });
    }

    playBgm(volume?: number): void {
        const cfg = this.theme.bgm;
        if (cfg?.enabled === false) {
            this.stopBgm();
            return;
        }
        const path = cfg?.path ?? DEFAULT_BGM_PATH;
        const finalVolume = volume ?? cfg?.volume ?? DEFAULT_BGM_VOLUME;
        const requestId = ++this.bgmRequestId;
        if (this.currentBgmPath === path && this.bgmSource.clip) {
            this.bgmSource.volume = finalVolume;
            if (!this.bgmSource.playing) this.bgmSource.play();
            return;
        }
        resources.load(path, AudioClip, (error, clip) => {
            if (error || !clip || requestId !== this.bgmRequestId) return;
            this.currentBgmPath = path;
            this.bgmSource.clip = clip;
            this.bgmSource.loop = true;
            this.bgmSource.volume = finalVolume;
            this.bgmSource.currentTime = Math.min(BGM_START_OFFSET_SECONDS, Math.max(0, clip.getDuration() - 0.1));
            this.bgmSource.play();
        });
    }

    stopBgm(): void {
        this.bgmRequestId++;
        this.bgmSource.stop();
        this.currentBgmPath = '';
    }
}
