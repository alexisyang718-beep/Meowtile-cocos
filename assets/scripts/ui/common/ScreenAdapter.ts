import { Node, UITransform, Vec3, view } from 'cc';
import { GAME_CONFIG } from '../../core/Constants';

export type HorizontalEdge = 'left' | 'right';

export interface ScreenMetrics {
    designWidth: number;
    designHeight: number;
    visibleWidth: number;
    visibleHeight: number;
    safeWidth: number;
    safeHeight: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
}

function ensureFinite(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function ensureTransform(node: Node, width: number, height: number): UITransform {
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setContentSize(width, height);
    return transform;
}

export const ScreenAdapter = {
    metrics(): ScreenMetrics {
        const visible = view.getVisibleSize();
        const visibleWidth = ensureFinite(visible.width, GAME_CONFIG.designWidth);
        const visibleHeight = ensureFinite(visible.height, GAME_CONFIG.designHeight);
        const safeWidth = Math.min(GAME_CONFIG.designWidth, visibleWidth);
        const safeHeight = Math.min(GAME_CONFIG.designHeight, visibleHeight);
        return {
            designWidth: GAME_CONFIG.designWidth,
            designHeight: GAME_CONFIG.designHeight,
            visibleWidth,
            visibleHeight,
            safeWidth,
            safeHeight,
            left: -safeWidth / 2,
            right: safeWidth / 2,
            top: safeHeight / 2,
            bottom: -safeHeight / 2,
        };
    },

    fullSize(): { width: number; height: number } {
        const m = this.metrics();
        return {
            width: Math.max(GAME_CONFIG.designWidth, m.visibleWidth),
            height: Math.max(GAME_CONFIG.designHeight, m.visibleHeight),
        };
    },

    applyFullscreen(node: Node): UITransform {
        const size = this.fullSize();
        return ensureTransform(node, size.width, size.height);
    },

    createFullscreenNode(parent: Node, name: string, x = 0, y = 0): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        parent.addChild(node);
        node.setPosition(new Vec3(x, y, 0));
        this.applyFullscreen(node);
        return node;
    },

    edgeX(edge: HorizontalEdge, centerInset: number): number {
        const m = this.metrics();
        return edge === 'left' ? m.left + centerInset : m.right - centerInset;
    },

    leftX(centerInset: number): number {
        return this.edgeX('left', centerInset);
    },

    rightX(centerInset: number): number {
        return this.edgeX('right', centerInset);
    },

    topY(centerInset: number): number {
        return this.metrics().top - centerInset;
    },

    bottomY(centerInset: number): number {
        return this.metrics().bottom + centerInset;
    },

    contentWidth(padding = 50, maxWidth = GAME_CONFIG.designWidth - padding * 2, minWidth = 320): number {
        const available = this.metrics().safeWidth - padding * 2;
        return Math.max(minWidth, Math.min(maxWidth, available));
    },

    contentHeight(padding = 80, maxHeight = GAME_CONFIG.designHeight - padding * 2, minHeight = 480): number {
        const available = this.metrics().safeHeight - padding * 2;
        return Math.max(minHeight, Math.min(maxHeight, available));
    },

    responsiveWidth(baseWidth: number, padding = 50, minWidth = 240): number {
        return this.contentWidth(padding, baseWidth, Math.min(minWidth, baseWidth));
    },

    distributeCentered(count: number, maxSpan: number, sidePadding = 130): number[] {
        if (count <= 1) return [0];
        const span = this.contentWidth(sidePadding, maxSpan, Math.min(maxSpan, 240));
        const step = span / (count - 1);
        const start = -span / 2;
        return Array.from({ length: count }, (_, index) => start + index * step);
    },

    clientToRootPosition(canvas: HTMLCanvasElement, event: PointerEvent): { x: number; y: number } {
        const rect = canvas.getBoundingClientRect();
        const m = this.metrics();
        const fitScale = Math.min(rect.width / m.visibleWidth, rect.height / m.visibleHeight);
        const displayWidth = m.visibleWidth * fitScale;
        const displayHeight = m.visibleHeight * fitScale;
        const offsetX = (rect.width - displayWidth) / 2;
        const offsetY = (rect.height - displayHeight) / 2;
        return {
            x: (event.clientX - rect.left - offsetX) / fitScale - m.visibleWidth / 2,
            y: m.visibleHeight / 2 - (event.clientY - rect.top - offsetY) / fitScale,
        };
    },

    onResize(callback: () => void, target?: unknown): void {
        (view as unknown as { on: (type: string, cb: () => void, target?: unknown) => void }).on('canvas-resize', callback, target);
    },

    offResize(callback: () => void, target?: unknown): void {
        (view as unknown as { off: (type: string, cb: () => void, target?: unknown) => void }).off('canvas-resize', callback, target);
    },
};
