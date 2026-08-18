// SpineAnimRegistry — Spine 序列帧动画注册表
//
// 集中管理 SPINE_ANIMATION_IDEAS.md 里所有需求点用到的资源/动画名,
// 解决以下问题:
// 1. 文档里写 "Appear" 但实际目录是 "Appera" (源文件错别字) — 用 alias 兼容
// 2. 各处接入点散落,改名时只需改这一处
// 3. 给业务方简洁的语义化 key 而非裸字符串

import { Node, UITransform } from 'cc';
import { SequenceFrameRenderer } from './SequenceFrameRenderer';
import { createNode } from '../common/UiFactory';

/**
 * 注册表条目
 *  - resource: spine_seq/<resource>/<animation>/...
 *  - animation: 动画目录名 (实际目录名,不是文档名)
 */
export interface SpineAnimEntry {
    resource: string;
    animation: string;
}

export const SpineAnims = {
    // === Combo (6 选 1) ===
    COMBO_SUNSET: { resource: 'SunsetIsland', animation: 'Appera' } as SpineAnimEntry,
    COMBO_BIRD: { resource: 'wellDone3Bird', animation: 'WellDone' } as SpineAnimEntry,
    COMBO_CELEBRATE: { resource: 'ClearCelebrateBottom', animation: 'Celebration' } as SpineAnimEntry,
    COMBO_FLOWER: { resource: 'FlowerInFullBloom', animation: 'Appera' } as SpineAnimEntry,
    COMBO_TWO_BIRDS: { resource: 'NewFinishedCountTwoBirds', animation: 'IdleTwoBirdsShortVer' } as SpineAnimEntry,
    COMBO_PHOTO: { resource: 'TakePhoto', animation: 'Appera' } as SpineAnimEntry,

    // 只保留当前 ComboFeedback 实际使用的序列帧资源，未接入的主页/胜负资源已从 resources 中清理，避免打包体积膨胀。
};

/**
 * 在指定父节点下创建一个序列帧动画节点。
 *
 * @param parent      父节点
 * @param entry       SpineAnims 中的某项
 * @param x,y         相对父节点的本地坐标
 * @param size        宽高 (sprite 渲染大小,会覆盖资源 meta 的 width/height)
 * @param opts        可选: loop / flipX / autoDestroy / scale / onComplete
 * @returns           创建的节点 (可后续操作)
 */
export function spawnSpineAnim(
    parent: Node,
    entry: SpineAnimEntry,
    x: number,
    y: number,
    size: number = 0,
    opts: {
        loop?: boolean;
        flipX?: boolean;
        autoDestroy?: boolean;
        scale?: number;
        speedScale?: number;
        name?: string;
        onComplete?: () => void;
    } = {},
): Node {
    const nodeName = opts.name ?? `Spine_${entry.resource}_${entry.animation}`;
    const node = createNode(parent, nodeName, x, y, size, size);
    if (opts.flipX) node.setScale(-(opts.scale ?? 1), opts.scale ?? 1, 1);
    else if (opts.scale && opts.scale !== 1) node.setScale(opts.scale, opts.scale, 1);

    const renderer = node.addComponent(SequenceFrameRenderer);
    renderer.autoPlay = false;
    renderer.autoLoop = opts.loop ?? false;
    renderer.load(entry.resource, () => {
        // 如果传了 size,覆盖 ut size
        if (size > 0) {
            const ut = node.getComponent(UITransform);
            if (ut) ut.setContentSize(size, size);
        }
        renderer.play(entry.animation, {
            loop: opts.loop ?? false,
            speedScale: opts.speedScale,
            onComplete: () => {
                if (opts.autoDestroy && node.isValid) node.destroy();
                opts.onComplete?.();
            },
        });
    });
    return node;
}
