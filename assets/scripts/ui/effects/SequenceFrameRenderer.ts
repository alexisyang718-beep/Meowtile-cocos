// SequenceFrameRenderer
//
// PNG 序列帧动画渲染器 — 取代之前失败的 spine 自渲染方案。
//
// 资源结构 (assets/resources/spine_seq/):
//   <name>/
//     resource_meta.json          - 资源 meta (animations 列表 + bounds)
//     <animation_name>/
//       sequence_meta.json        - 动画 meta (fps, frames, duration, width, height)
//       <animation_name>_000.png  - 第 0 帧
//       <animation_name>_001.png
//       ...
//
// 用法:
//   const renderer = node.addComponent(SequenceFrameRenderer);
//   renderer.load('wellDone3Bird', () => {
//     renderer.play('WellDone', { loop: true });
//   });
//
// 性能注意:
//   - 每帧切 sprite.spriteFrame, 不是创建新节点
//   - PNG 在 load 时一次性预加载, 播放时 0 等待
//   - 大量同时播放的资源建议用对象池

import { _decorator, Component, Sprite, SpriteFrame, UITransform, resources, JsonAsset } from 'cc';
import { loadSpriteFrameFromResources } from '../common/UiFactory';
const { ccclass, property } = _decorator;

interface SequenceMeta {
    name: string;
    duration: number;
    fps: number;
    frames: number;
    frameDuration: number;
    width: number;
    height: number;
}

interface ResourceMeta {
    name: string;
    width: number;
    height: number;
    bounds: { x: number; y: number; w: number; h: number };
    animations: SequenceMeta[];
}

interface Sequence {
    meta: SequenceMeta;
    sprites: SpriteFrame[];
}

@ccclass('SequenceFrameRenderer')
export class SequenceFrameRenderer extends Component {
    @property
    assetName: string = '';

    @property
    autoPlay: boolean = false;  // load 完后自动播第一个动画

    @property
    autoLoop: boolean = true;

    private _resourceMeta: ResourceMeta | null = null;
    private _sequences: Map<string, Sequence> = new Map();
    private _sprite: Sprite | null = null;
    private _ut: UITransform | null = null;

    // 当前播放
    private _currentName: string = '';
    private _currentSeq: Sequence | null = null;
    private _currentFrame: number = 0;
    private _accumTime: number = 0;
    private _playing: boolean = false;
    private _loop: boolean = true;
    private _onComplete: (() => void) | null = null;
    private _speedScale: number = 1;

    /**
     * 加载资源 (resource meta + 全部 PNG 帧)
     */
    public load(name: string, onDone?: () => void): void {
        this.assetName = name;
        const metaPath = `spine_seq/${name}/resource_meta`;
        resources.load(metaPath, JsonAsset, (err, asset) => {
            if (err || !asset) {
                console.warn(`[SeqFrame] load resource_meta failed: ${metaPath}`, err);
                onDone?.();
                return;
            }
            this._resourceMeta = asset.json as ResourceMeta;
            // 准备 sprite + UITransform
            this._sprite = this.node.getComponent(Sprite) || this.node.addComponent(Sprite);
            this._sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this._ut = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
            this._ut.setContentSize(this._resourceMeta.width, this._resourceMeta.height);

            // 预加载所有动画的所有帧
            this._preloadAllAnimations(() => {
                if (this.autoPlay && this._resourceMeta && this._resourceMeta.animations.length > 0) {
                    this.play(this._resourceMeta.animations[0].name, { loop: this.autoLoop });
                }
                onDone?.();
            });
        });
    }

    private _preloadAllAnimations(onDone: () => void): void {
        if (!this._resourceMeta) {
            onDone();
            return;
        }
        const anims = this._resourceMeta.animations;
        if (anims.length === 0) {
            onDone();
            return;
        }

        let pendingAnims = anims.length;
        for (const anim of anims) {
            const frames: SpriteFrame[] = new Array(anim.frames).fill(null);
            let pendingFrames = anim.frames;

            for (let i = 0; i < anim.frames; i++) {
                const frameIdx = i;
                const frameName = `${anim.name}_${String(frameIdx).padStart(3, '0')}`;
                const path = `spine_seq/${this.assetName}/${anim.name}/${frameName}`;
                loadSpriteFrameFromResources(path, (sf) => {
                    if (sf) frames[frameIdx] = sf;
                    pendingFrames--;
                    if (pendingFrames === 0) {
                        this._sequences.set(anim.name, { meta: anim, sprites: frames });
                        pendingAnims--;
                        if (pendingAnims === 0) onDone();
                    }
                });
            }
        }
    }

    /**
     * 播放指定动画
     */
    public play(animationName?: string, opts?: { loop?: boolean; speedScale?: number; onComplete?: () => void }): void {
        if (!this._resourceMeta || !this._sprite) {
            console.warn('[SeqFrame] play before load');
            return;
        }
        const name = animationName || (this._resourceMeta.animations[0]?.name);
        if (!name) {
            console.warn('[SeqFrame] no animation to play');
            return;
        }
        const seq = this._sequences.get(name);
        if (!seq) {
            console.warn(`[SeqFrame] animation not loaded: ${name}`);
            return;
        }

        this._currentName = name;
        this._currentSeq = seq;
        this._currentFrame = 0;
        this._accumTime = 0;
        this._playing = true;
        this._loop = opts?.loop ?? true;
        this._speedScale = opts?.speedScale ?? 1;
        this._onComplete = opts?.onComplete || null;

        // UITransform 用动画自己的尺寸 (有些动画大小可能不同)
        // 但如果节点已经有自定义尺寸（如 SpineAnimRegistry 传入的 size），则保留
        if (this._ut) {
            const currentW = this._ut.width;
            const currentH = this._ut.height;
            if (currentW <= 0 || currentH <= 0) {
                this._ut.setContentSize(seq.meta.width, seq.meta.height);
            }
        }
        // 显示第 0 帧
        if (seq.sprites[0]) this._sprite.spriteFrame = seq.sprites[0];
    }

    public stop(): void {
        this._playing = false;
        this._currentSeq = null;
    }

    public pause(): void { this._playing = false; }
    public resume(): void { this._playing = true; }

    update(dt: number): void {
        if (!this._playing || !this._currentSeq || !this._sprite) return;
        this._accumTime += dt * this._speedScale;
        const fd = this._currentSeq.meta.frameDuration;
        while (this._accumTime >= fd) {
            this._accumTime -= fd;
            this._currentFrame++;
            if (this._currentFrame >= this._currentSeq.meta.frames) {
                if (this._loop) {
                    this._currentFrame = 0;
                } else {
                    this._currentFrame = this._currentSeq.meta.frames - 1;
                    this._playing = false;
                    if (this._onComplete) {
                        const cb = this._onComplete;
                        this._onComplete = null;
                        cb();
                    }
                    break;
                }
            }
        }
        const sf = this._currentSeq.sprites[this._currentFrame];
        if (sf) this._sprite.spriteFrame = sf;
    }

    /** 列出已加载的动画名 */
    public listAnimations(): string[] {
        return this._resourceMeta?.animations.map(a => a.name) || [];
    }
}
