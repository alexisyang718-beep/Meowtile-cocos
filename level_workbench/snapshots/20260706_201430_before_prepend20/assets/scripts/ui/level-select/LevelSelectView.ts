import { _decorator, Button, Component, EventTouch, Label, Node, ScrollView, Sprite, SpriteFrame, UITransform, Vec3 } from 'cc';
import { LevelId } from '../../core/Types';
import { ChapterModel } from '../../data/models/ChapterModel';
import { ScreenAdapter } from '../common/ScreenAdapter';
import { UI_LAYOUT } from '../common/UILayoutConfig';
import {
    bindPressScale,
    colorFromHex,
    createLabel,
    createNode,
    drawRect,
    ensureTransform,
    GAME_FONT_FAMILY,
    loadSpriteFrameFromResources,
} from '../common/UiFactory';

const { ccclass } = _decorator;

const MAP_FONT_FAMILY = GAME_FONT_FAMILY;

const CHAPTER_START_LEVELS: Record<string, LevelId> = {
    chapter1: 1,
    chapter2: 13,
    chapter3: 81,
    chapter4: 161,
    chapter5: 241,
};

const EDITABLE_BOOK_NODES: Array<{ nodeName: string; chapterId: string }> = [
    { nodeName: 'ParisBook', chapterId: 'chapter1' },
    { nodeName: 'ElCalafateBook', chapterId: 'chapter2' },
    { nodeName: 'StockholmBook', chapterId: 'chapter3' },
    { nodeName: 'NewYorkBook', chapterId: 'chapter4' },
    { nodeName: 'PalmBook', chapterId: 'chapter5' },
];

const CHAPTER_NAMES: Record<string, string> = {
    chapter1: '窗边出发',
    chapter2: '猫咖停留',
    chapter3: '雨后街角',
    chapter4: '海边旅行',
    chapter5: '雨巷暖光',
};

const CHAPTER_THUMB_IMAGES: Record<string, string[]> = {
    chapter1: [
        'newtheme/bg/chapter1/1',
        'newtheme/bg/chapter1/2',
        'newtheme/bg/chapter1/3',
    ],
    chapter2: [
        'newtheme/bg/chapter2/1',
        'newtheme/bg/chapter2/2',
        'newtheme/bg/chapter2/3',
        'newtheme/bg/chapter2/4',
        'newtheme/bg/chapter2/5',
    ],
    chapter3: [
        'newtheme/bg/chapter3/1',
        'newtheme/bg/chapter3/2',
        'newtheme/bg/chapter3/3',
        'newtheme/bg/chapter3/4',
        'newtheme/bg/chapter3/5',
    ],
    chapter4: [
        'newtheme/bg/chapter4/1',
        'newtheme/bg/chapter4/2',
        'newtheme/bg/chapter4/3',
        'newtheme/bg/chapter4/4',
        'newtheme/bg/chapter4/5',
    ],
    chapter5: [
        'newtheme/bg/chapter5/1',
        'newtheme/bg/chapter5/2',
        'newtheme/bg/chapter5/3',
        'newtheme/bg/chapter5/4',
        'newtheme/bg/chapter5/5',
    ],
};

export interface MapHandlers {
    onBack: () => void;
    onSelectLevel: (levelId: LevelId) => void;
    onOpenChapterStart?: (chapterId: string) => void;
}

interface ChapterDisplay {
    chapter: ChapterModel;
    locked: boolean;
    /** 该章节内已通关的最大 levelId（用于判断卡片角标是否显示）*/
    clearedMaxLevel: number;
}

/**
 * 地图页（章节列表）。
 * 视觉：纵向滚动，每个章节一张大卡片，含章节名/关卡范围/缩略图条。
 *
 * v1.5 必做：3 个章节展示（法国/阿根廷/瑞典），锁定/解锁视觉，点击进入。
 * v1.6 加：14+ 章节扩展、章节奖牌、解锁动画
 */
@ccclass('LevelSelectView')
export class LevelSelectView extends Component {
    private handlers: MapHandlers | null = null;
    private chapters: ChapterDisplay[] = [];
    private editableLayoutBound = false;

    protected onEnable(): void {
        ScreenAdapter.onResize(this.handleResize, this);
    }

    protected onDisable(): void {
        ScreenAdapter.offResize(this.handleResize, this);
    }

    private handleResize = (): void => {
        if (!this.node.activeInHierarchy || this.chapters.length === 0) return;
        if (this.hasEditableLayout()) return;
        this.rebuild();
    };

    bind(handlers: MapHandlers): void {
        this.handlers = handlers;
        if (this.hasEditableLayout()) this.bindEditableLayout();
    }

    /** 兼容旧接口：仍保留 setLevels 方法（不再使用，改用 setChapters） */
    setLevels(_levelIds: LevelId[]): void {
        // 已废弃，保留签名避免外部调用报错
    }

    setChapters(chapters: ChapterDisplay[]): void {
        this.chapters = chapters;
        this.rebuild();
    }

    show(): void {
        this.node.active = true;
    }

    hide(): void {
        this.node.active = false;
    }

    private hasEditableLayout(): boolean {
        return !!this.node.getChildByName('MapBack')
            && !!this.node.getChildByName('ParisBook');
    }

    private findEditableNode(path: string): Node | null {
        return path.split('/').reduce<Node | null>((parent, name) => parent?.getChildByName(name) ?? null, this.node);
    }

    private bindEditableLayout(): void {
        const title = this.findEditableNode('MapTitle')?.getComponent(Label) ?? null;
        if (title) {
            title.string = 'Level Select';
            title.fontFamily = MAP_FONT_FAMILY;
        }
        this.bindEditableButton('MapBack', () => this.handlers?.onBack(), 0.9);
        this.ensurePalmBook();
        EDITABLE_BOOK_NODES.forEach(({ nodeName, chapterId }) => {
            this.bindEditableButton(nodeName, () => this.handlers?.onOpenChapterStart?.(chapterId), 0.96);
        });
        this.editableLayoutBound = true;
    }

    /**
     * 场景内只手摆了 4 本章节书（Paris/ElCalafate/Stockholm/NewYork）。
     * 第 5 大关的 PalmBook 在运行时按 NewYorkBook 克隆生成，
     * 放到第二行右侧（与 NewYorkBook 对称），逻辑上绑定 chapter5。
     */
    private ensurePalmBook(): void {
        if (this.findEditableNode('PalmBook')) return;
        const ref = this.findEditableNode('NewYorkBook');
        if (!ref) return;
        const refTf = ref.getComponent(UITransform);
        const w = refTf?.contentSize.width ?? 260;
        const h = refTf?.contentSize.height ?? 430;
        const refPos = ref.position;
        // NewYorkBook 在 (-305,-135)，Palm 放到同一行居中/右侧 (0,-135)
        const palm = createNode(ref.parent ?? this.node, 'PalmBook', 0, refPos.y, w, h);
        palm.layer = ref.layer;
        const sprite = palm.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources('newtheme/bg/level1', (frame) => {
            if (frame) sprite.spriteFrame = frame;
        });
    }

    private bindEditableButton(path: string, onClick: () => void, pressedScale = 0.9): Node | null {
        const node = this.findEditableNode(path);
        if (!node) return null;
        if (!node.getComponent(Button)) node.addComponent(Button);
        if (!this.editableLayoutBound) {
            bindPressScale(node, pressedScale);
            node.on(Node.EventType.TOUCH_END, onClick);
        }
        return node;
    }

    private rebuild(): void {
        if (this.hasEditableLayout()) {
            this.bindEditableLayout();
            return;
        }

        this.node.removeAllChildren();

        // 地图页背景
        const bgSize = ScreenAdapter.fullSize();
        const bgColor = createNode(this.node, 'MapBgColor', 0, 0, bgSize.width, bgSize.height);
        drawRect(bgColor, bgSize.width, bgSize.height, colorFromHex('#3A6BB8'), undefined, 0, 0);
        const bg = createNode(this.node, 'MapBg', 0, 0, bgSize.width, bgSize.height);
        const bgSprite = bg.addComponent(Sprite);
        bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources(UI_LAYOUT.map.backgroundPath, (frame) => {
            if (frame) bgSprite.spriteFrame = frame;
        });

        // 顶部条：返回按钮 + 标题
        const topCfg = UI_LAYOUT.map.topBar;
        const topY = ScreenAdapter.topY(topCfg.topInset);
        this.makeBackButton(ScreenAdapter.leftX(topCfg.leftInset), topY, topCfg.backScale);
        const title = createLabel(this.node, 'MapTitle', 'Level Select', 0, topY + topCfg.logoYOffset, 58, colorFromHex('#FFFFFF'), 520, 96);
        title.fontFamily = MAP_FONT_FAMILY;
        (title as unknown as { isBold?: boolean }).isBold = true;

        // 章节滚动区
        this.buildChapterScroll();
    }

    private makeBackButton(x: number, y: number, scale = 1): void {
        const size = UI_LAYOUT.map.topBar.buttonSize;
        const node = createNode(this.node, 'MapBack', x, y, size, size);
        node.setScale(new Vec3(scale, scale, 1));
        node.addComponent(Button);
        bindPressScale(node, 0.9);
        node.on(Node.EventType.TOUCH_END, () => this.handlers?.onBack());

        const sp = node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources('newtheme/back', (frame) => {
            if (frame && sp.isValid) sp.spriteFrame = frame;
        });
    }

    /**
     * 章节滚动区。MVP 用 ScrollView 包一个 content，章节卡片纵向排列。
     * 卡片高 380，间距 30，3 章节总高 ~1230，留 buffer。
     */
    private buildChapterScroll(): void {
        const cfg = UI_LAYOUT.map.scroll;
        const viewW = ScreenAdapter.contentWidth(cfg.horizontalPadding, cfg.maxWidth, cfg.minWidth);
        const viewH = ScreenAdapter.contentHeight(cfg.verticalPadding, cfg.maxHeight, cfg.minHeight);
        const scrollNode = createNode(this.node, 'MapScroll', cfg.x, cfg.y, viewW, viewH);
        this.populateChapterScroll(scrollNode, viewW, viewH);
    }

    private buildEditableChapterScroll(): void {
        const scrollNode = this.findEditableNode('MapScroll');
        if (!scrollNode) return;
        const transform = scrollNode.getComponent(UITransform);
        const viewW = transform?.contentSize.width ?? UI_LAYOUT.map.scroll.maxWidth;
        const viewH = transform?.contentSize.height ?? UI_LAYOUT.map.scroll.maxHeight;
        this.populateChapterScroll(scrollNode, viewW, viewH);
    }

    private populateChapterScroll(scrollNode: Node, viewW: number, viewH: number): void {
        const cfg = UI_LAYOUT.map.scroll;
        const cardCfg = UI_LAYOUT.map.card;
        const cardW = Math.max(220, viewW - cfg.cardHorizontalInset);
        const scrollView = scrollNode.getComponent(ScrollView) ?? scrollNode.addComponent(ScrollView);
        scrollView.vertical = true;
        scrollView.horizontal = false;
        scrollNode.removeAllChildren();

        const scrollViewport = createNode(scrollNode, 'view', 0, 0, viewW, viewH);
        scrollViewport.layer = scrollNode.layer;
        const cardCount = this.chapters.length;
        const cardH = Math.round(Math.max(cardCfg.minHeight, Math.min(cardCfg.maxHeight, cardW * cardCfg.heightRatio)));
        const gap = cardCfg.gap;
        const totalH = cardCount * cardH + Math.max(0, cardCount - 1) * gap + 32;

        const content = createNode(scrollViewport, 'content', 0, 0, viewW, totalH);
        let curY = totalH / 2 - cardH / 2 - 16;
        this.chapters.forEach((chapterInfo) => {
            this.buildChapterCard(content, 0, curY, chapterInfo, cardW, cardH);
            curY -= cardH + gap;
        });

        scrollView.content = content;
    }

    private buildChapterCard(parent: Node, x: number, y: number, info: ChapterDisplay, cardW: number, cardH: number): void {
        const cfg = UI_LAYOUT.map.card;
        const card = createNode(parent, `Chapter_${info.chapter.id}`, x, y, cardW, cardH);
        drawRect(card, cardW, cardH, colorFromHex('#5A8FD8', cfg.bgAlpha), colorFromHex('#FFFFFF', 90), 1, cfg.radius);

        const range = info.chapter.levelRange;
        const titleLabel = createLabel(
            card,
            'ChapterTitle',
            CHAPTER_NAMES[info.chapter.id] ?? info.chapter.name,
            0,
            cardH * cfg.titleYRatio,
            cfg.titleFontSize,
            colorFromHex('#FFFFFF'),
            cardW,
            Math.round(cardH * 0.18),
        );
        titleLabel.fontFamily = MAP_FONT_FAMILY;

        const rangeNode = createNode(card, 'RangeCap', 0, cardH * cfg.rangeYRatio, cfg.rangeWidth, cfg.rangeHeight);
        drawRect(rangeNode, cfg.rangeWidth, cfg.rangeHeight, colorFromHex('#FFE9B0'), undefined, 0, cfg.rangeHeight / 2);
        const rangeLabel = createLabel(rangeNode, 'RangeText', `LEVEL ${range[0]}-${range[1]}`, 0, 0, cfg.rangeFontSize, colorFromHex('#7A4A1E'), cfg.rangeWidth, cfg.rangeHeight);
        rangeLabel.fontFamily = MAP_FONT_FAMILY;

        const thumbIds = CHAPTER_THUMB_IMAGES[info.chapter.id] ?? [info.chapter.mapThumbnail ?? info.chapter.backgroundImage];
        const levelCount = Math.max(1, range[1] - range[0] + 1);
        // v1.5.6 规则：
        // 1) 1~20 关（range[0] < 21）：每关 1 缩略图，单行横排（恢复 1.5.x 原版布局）。
        // 2) 21 关之后：每章 5 缩略图，每图代表 2 关（点击进入这一对的第一关，
        //    通关后 LevelFlow 自动接入下一关）。所以章节内关卡段会按缩略图顺序轮换。
        //    21、23、25、27、29，与策划口径一致。
        const groupSize = range[0] >= 21 ? 2 : 1;
        const thumbCount = Math.max(1, Math.ceil(levelCount / groupSize));
        const thumbScale = thumbCount >= 6 ? 0.84 : 1;
        const thumbW = Math.round(cfg.thumbnailWidth * thumbScale);
        const thumbH = Math.round(cfg.thumbnailHeight * thumbScale);
        const thumbGap = Math.round(cfg.thumbnailGap * thumbScale);
        const thumbStartX = -((thumbCount - 1) * (thumbW + thumbGap)) / 2;
        const thumbY = cardH * cfg.thumbnailYRatio;
        for (let i = 0; i < thumbCount; i += 1) {
            const tx = thumbStartX + i * (thumbW + thumbGap);
            const targetLevel = range[0] + i * groupSize;
            const thumbPath = thumbIds[i % thumbIds.length];
            // 调试期：所有缩略图常驻可点（不带锁），方便逐关验难度。
            this.buildThumbnail(card, tx, thumbY, thumbW, thumbH, thumbPath, targetLevel, false, info.chapter.id);
        }

        if (!info.locked) {
            card.addComponent(Button);
            bindPressScale(card, 0.98);
            card.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                let cursor: Node | null = event.target as Node | null;
                while (cursor && cursor !== card) {
                    if (cursor.name.startsWith('Thumb_')) return;
                    cursor = cursor.parent;
                }
                const next = Math.min(range[1], Math.max(range[0], info.clearedMaxLevel + 1));
                this.openChapterOrLevel(info.chapter.id, next);
            });
        }
    }

    private buildThumbnail(
        parent: Node,
        x: number,
        y: number,
        w: number,
        h: number,
        thumbPath: string,
        levelId: LevelId,
        locked: boolean,
        chapterId?: string,
    ): void {
        const cfg = UI_LAYOUT.map.card;
        const node = createNode(parent, `Thumb_${Math.round(x)}_${Math.round(y)}`, x, y, w, h);
        drawRect(node, w, h, colorFromHex('#FFFFFF', 235), colorFromHex('#FFFFFF', 235), 1, cfg.radius);

        const innerW = Math.max(8, w * cfg.thumbnailInnerScale);
        const innerH = Math.max(8, h * cfg.thumbnailInnerScale);
        const inner = createNode(node, 'Inner', 0, 0, innerW, innerH);
        const sp = inner.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources(thumbPath, (frame) => {
            if (frame) this.applySpriteFrameContain(sp, frame, innerW, innerH);
        });
        const overlay = createNode(node, 'ThumbOverlay', 0, 0, innerW, innerH);
        drawRect(overlay, innerW, innerH, colorFromHex('#2F6BFF', cfg.thumbnailOverlayAlpha), undefined, 0, cfg.radius);

        if (!locked) {
            node.addComponent(Button);
            bindPressScale(node, 0.96);
            node.on(Node.EventType.TOUCH_END, () => {
                this.openChapterOrLevel(chapterId, levelId);
            });
        }

        if (locked) {
            const veil = createNode(node, 'ThumbLockVeil', 0, 0, innerW, innerH);
            drawRect(veil, innerW, innerH, colorFromHex('#0E1F3D', 145), undefined, 0, cfg.radius);
            createLabel(veil, 'LockIcon', '🔒', 0, 0, Math.round(cfg.lockIconSize * 0.72), colorFromHex('#FFFFFF'), cfg.lockIconSize, cfg.lockIconSize);
        }
    }

    private openChapterOrLevel(chapterId: string | undefined, levelId: LevelId): void {
        if (chapterId && CHAPTER_START_LEVELS[chapterId]) {
            this.handlers?.onOpenChapterStart?.(chapterId);
            return;
        }
        this.handlers?.onSelectLevel(levelId);
    }

    private applySpriteFrameContain(sprite: Sprite, frame: SpriteFrame, maxWidth: number, maxHeight: number): void {
        sprite.spriteFrame = frame;
        const original = frame.originalSize;
        const sourceWidth = Math.max(1, original.width || maxWidth);
        const sourceHeight = Math.max(1, original.height || maxHeight);
        const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
        ensureTransform(sprite.node, sourceWidth * scale, sourceHeight * scale);
    }
}
