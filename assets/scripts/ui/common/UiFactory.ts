import { Button, Color, Graphics, ImageAsset, Label, Node, Rect, resources, Size, SpriteFrame, Texture2D, Tween, tween, UITransform, Vec3 } from 'cc';
import { Haptic } from '../../core/HapticManager';

export function colorFromHex(hex: string, alpha = 255): Color {
    const raw = hex.replace('#', '').trim();
    const value = (raw.length === 3 ? raw.split('').map((item) => item + item).join('') : raw).padEnd(6, '0').slice(0, 6);
    return new Color(
        parseInt(value.slice(0, 2), 16),
        parseInt(value.slice(2, 4), 16),
        parseInt(value.slice(4, 6), 16),
        alpha,
    );
}

export function ensureTransform(node: Node, width: number, height: number): UITransform {
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setContentSize(width, height);
    return transform;
}

export function createNode(parent: Node, name: string, x: number, y: number, width = 0, height = 0): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(new Vec3(x, y, 0));
    if (width > 0 || height > 0) ensureTransform(node, width, height);
    return node;
}

export function drawRect(node: Node, width: number, height: number, fill: Color, stroke?: Color, lineWidth = 0, radius = 18): Graphics {
    ensureTransform(node, width, height);
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = fill;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    if (stroke && lineWidth > 0) {
        graphics.strokeColor = stroke;
        graphics.lineWidth = lineWidth;
        graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        graphics.stroke();
    }
    return graphics;
}

export function drawCircle(node: Node, radius: number, fill: Color, stroke?: Color, lineWidth = 0): Graphics {
    ensureTransform(node, radius * 2, radius * 2);
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = fill;
    graphics.circle(0, 0, radius);
    graphics.fill();
    if (stroke && lineWidth > 0) {
        graphics.strokeColor = stroke;
        graphics.lineWidth = lineWidth;
        graphics.circle(0, 0, radius);
        graphics.stroke();
    }
    return graphics;
}

export function drawTriangle(node: Node, points: Array<{ x: number; y: number }>, fill: Color): Graphics {
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = fill;
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) graphics.lineTo(points[i].x, points[i].y);
    graphics.close();
    graphics.fill();
    return graphics;
}

export const GAME_FONT_FAMILY = 'Chalkboard SE, "Comic Sans MS", "Marker Felt", "PingFang SC", sans-serif';
export const FREDOKA_ONE_FONT_FAMILY = '"Fredoka One", "Fredoka", "Chalkboard SE", "Comic Sans MS", sans-serif';

export function applyFredokaOneFont(label: Label): void {
    label.fontFamily = FREDOKA_ONE_FONT_FAMILY;
}

export function createLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, width: number, height: number): Label {
    const node = createNode(parent, name, x, y, width, height);
    const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.fontFamily = GAME_FONT_FAMILY;
        label.lineHeight = Math.round(fontSize * 1.22);
        label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    return label;
}

export function createButton(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, onClick: () => void): Node {
    const node = createNode(parent, name, x, y, width, height);
    drawRect(node, width, height, colorFromHex('#2F6BFF'), colorFromHex('#FFFFFF', 210), 2, 22);
    node.addComponent(Button);
    bindPressScale(node);
    createLabel(node, `${name}Label`, text, 0, 0, 28, colorFromHex('#FFFFFF'), width, height);
    node.on(Node.EventType.TOUCH_END, onClick);
    return node;
}

export function createRoundButton(parent: Node, name: string, icon: string, x: number, y: number, radius: number, onClick: () => void): Node {
    const node = createNode(parent, name, x, y, radius * 2, radius * 2);
    drawCircle(node, radius, colorFromHex('#415374', 225), colorFromHex('#FFFFFF', 210), 3);
    node.addComponent(Button);
    bindPressScale(node);
    createLabel(node, `${name}Icon`, icon, 0, 8, 44, colorFromHex('#FFFFFF'), radius * 2, radius * 2);
    node.on(Node.EventType.TOUCH_END, onClick);
    return node;
}

export function bindPressScale(node: Node, pressedScale = 0.92): void {
    const baseScale = node.scale.clone();
    node.on(Node.EventType.TOUCH_START, () => {
        Tween.stopAllByTarget(node);
        tween(node).to(0.06, { scale: new Vec3(baseScale.x * pressedScale, baseScale.y * pressedScale, baseScale.z) }).start();
    });
    // 按住不弹起（移出按钮被取消）→ 不震
    node.on(Node.EventType.TOUCH_CANCEL, () => tween(node).to(0.08, { scale: baseScale }).start());
    // 正常释放（在按钮上抬起）→ 轻震一次
    node.on(Node.EventType.TOUCH_END, () => {
        Haptic.tick();
        tween(node).to(0.08, { scale: baseScale }).start();
    });
}

export function imageAssetToSpriteFrame(image: ImageAsset): SpriteFrame {
    const texture = new Texture2D();
    texture.image = image;
    const frame = new SpriteFrame();
    frame.texture = texture;
    // 首次加载（贴图未进缓存）时，SpriteFrame 不显式指定尺寸会出现首帧空白/尺寸错乱。
    // 用贴图真实宽高显式初始化 rect + originalSize，保证第一帧即正确渲染。
    const w = image.width;
    const h = image.height;
    if (w > 0 && h > 0) {
        frame.rect = new Rect(0, 0, w, h);
        frame.originalSize = new Size(w, h);
    }
    return frame;
}

const spriteFrameCache = new Map<string, SpriteFrame>();
const spriteFramePendingCallbacks = new Map<string, Array<(frame: SpriteFrame | null) => void>>();

export function loadSpriteFrameFromResources(path: string, callback: (frame: SpriteFrame | null) => void): void {
    const safeCallback = (frame: SpriteFrame | null): void => {
        try {
            callback(frame);
        } catch (error) {
            console.warn(`[UiFactory] ignore stale sprite callback: ${path}`, error);
        }
    };

    const cached = spriteFrameCache.get(path);
    if (cached) {
        safeCallback(cached);
        return;
    }

    const pending = spriteFramePendingCallbacks.get(path);
    if (pending) {
        pending.push(safeCallback);
        return;
    }

    spriteFramePendingCallbacks.set(path, [safeCallback]);
    resources.load(path, ImageAsset, (error, image) => {
        const callbacks = spriteFramePendingCallbacks.get(path) ?? [];
        spriteFramePendingCallbacks.delete(path);
        if (error || !image) {
            callbacks.forEach((item) => item(null));
            return;
        }
        const frame = imageAssetToSpriteFrame(image);
        spriteFrameCache.set(path, frame);
        callbacks.forEach((item) => item(frame));
    });
}

/**
 * 三连爆破动画: 1.4× 放大 -> 缩到 0 -> 隐藏。来源: demo TileTripGameReal.playBreakAnim。
 * 上线前消除特效用,B 在 BoardManager.markMatched 后调即可。
 */
export function playBurstAnim(node: Node, onDone?: () => void): void {
    tween(node)
        .to(0.08, { scale: new Vec3(1.4, 1.4, 1) })
        .to(0.14, { scale: new Vec3(0, 0, 1) })
        .call(() => { node.active = false; onDone?.(); })
        .start();
}

/**
 * 屏幕抖动 (失败反馈)。来源: demo onGameOver ±40px 抖屏。
 * 用法: shakeNode(canvasNode, 40, 0.5)
 */
export function shakeNode(node: Node, amplitude = 32, duration = 0.4): void {
    const original = node.position.clone();
    const steps = Math.max(4, Math.floor(duration / 0.05));
    let t = tween(node);
    for (let i = 0; i < steps; i += 1) {
        const decay = 1 - i / steps;
        const dx = (Math.random() * 2 - 1) * amplitude * decay;
        const dy = (Math.random() * 2 - 1) * amplitude * decay;
        t = t.to(0.05, { position: new Vec3(original.x + dx, original.y + dy, original.z) });
    }
    t.to(0.06, { position: original }).start();
}

/**
 * Combo Label 弹跳: backOut 弹出 + 0.6s 后淡出消失。来源: demo comboLabel 反馈。
 */
export function playComboLabel(label: Label, text: string): void {
    label.string = text;
    label.node.active = true;
    label.node.setScale(new Vec3(0.2, 0.2, 1));
    tween(label.node)
        .to(0.18, { scale: new Vec3(1.18, 1.18, 1) })
        .to(0.08, { scale: new Vec3(1, 1, 1) })
        .delay(0.5)
        .to(0.2, { scale: new Vec3(0.4, 0.4, 1) })
        .call(() => { label.node.active = false; })
        .start();
}
