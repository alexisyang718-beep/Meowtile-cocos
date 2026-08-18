import { _decorator, Button, Component, Label, Mask, Node, ScrollView, Sprite, UITransform } from 'cc';
import { ProgressRepository } from '../../data/repositories/ProgressRepository';
import { ScreenAdapter } from '../../ui/common/ScreenAdapter';
import { UI_LAYOUT } from '../../ui/common/UILayoutConfig';
import { bindPressScale, colorFromHex, createLabel, createNode, drawRect, loadSpriteFrameFromResources } from '../../ui/common/UiFactory';
import { MetaChapterConfig, MetaChapterRepository, MetaSubchapterConfig } from '../MetaChapterRepository';

const { ccclass } = _decorator;

const COLLECTION_BG = 'newtheme/collection';
const COLLECTION_BG_WIDTH = 1248;
const COLLECTION_BG_HEIGHT = 2352;
const COLLECTION_BUTTON_SIZE = UI_LAYOUT.shared.settingsIcon.size;

export interface CollectionsViewHandlers {
    onBack: () => void;
    onClose: () => void;
}

@ccclass('CollectionsView')
export class CollectionsView extends Component {
    private handlers: CollectionsViewHandlers | null = null;
    private chapters: MetaChapterConfig[] = [];
    private activeChapterId = 'chapter1';

    show(handlers: CollectionsViewHandlers): void {
        this.handlers = handlers;
        this.node.active = true;
        void this.loadAndRender();
    }

    hide(): void {
        this.node.active = false;
        this.node.getChildByName('RuntimeRoot')?.removeAllChildren();
    }

    private async loadAndRender(): Promise<void> {
        this.chapters = await MetaChapterRepository.loadAll();
        if (!this.chapters.some((chapter) => chapter.id === this.activeChapterId)) {
            this.activeChapterId = this.chapters[0]?.id ?? 'chapter1';
        }
        this.render();
    }

    private render(): void {
        ScreenAdapter.applyFullscreen(this.node);
        if (this.hasAuthoredLayout()) {
            this.node.getChildByName('RuntimeRoot')?.removeAllChildren();
            this.renderAuthoredLayout();
        } else {
            const runtimeRoot = this.getRuntimeRoot();
            runtimeRoot.removeAllChildren();
            const size = ScreenAdapter.fullSize();
            this.buildBackground(runtimeRoot, size.width, size.height);
            this.buildTopBar(runtimeRoot);
            this.buildTabs(runtimeRoot);
            this.buildCards(runtimeRoot);
        }
        this.bindImageButton('Back', 'newtheme/back', UI_LAYOUT.shared.settingsIcon.x, UI_LAYOUT.shared.settingsIcon.y, COLLECTION_BUTTON_SIZE, () => this.handlers?.onBack());
        this.bindImageButton('Close', 'newtheme/close', -UI_LAYOUT.shared.settingsIcon.x, UI_LAYOUT.shared.settingsIcon.y, COLLECTION_BUTTON_SIZE, () => this.handlers?.onClose());
    }

    private hasAuthoredLayout(): boolean {
        return !!this.node.getChildByName('Bg')
            && !!this.node.getChildByName('Tabs')
            && !!this.node.getChildByName('Cards');
    }

    private renderAuthoredLayout(): void {
        const size = ScreenAdapter.fullSize();
        this.buildBackground(this.node, size.width, size.height);
        this.node.getChildByName('Title')?.destroy();
        this.buildTabs(this.node);
        this.buildAuthoredCards();
    }

    private getRuntimeRoot(): Node {
        let root = this.node.getChildByName('RuntimeRoot');
        if (!root) root = createNode(this.node, 'RuntimeRoot', 0, 0, 0, 0);
        root.setSiblingIndex(0);
        return root;
    }

    private buildBackground(root: Node, width: number, height: number): void {
        const aspect = COLLECTION_BG_WIDTH / COLLECTION_BG_HEIGHT;
        const coverWidth = Math.max(width, height * aspect);
        const coverHeight = Math.max(height, width / aspect);
        const bg = root.getChildByName('Bg') ?? createNode(root, 'Bg', 0, 0, coverWidth, coverHeight);
        bg.active = true;
        const transform = bg.getComponent(UITransform) ?? bg.addComponent(UITransform);
        if (root.getChildByName('Bg') !== bg) transform.setContentSize(coverWidth, coverHeight);
        const sprite = bg.getComponent(Sprite) ?? bg.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources(COLLECTION_BG, (frame) => {
            if (frame && sprite.isValid) sprite.spriteFrame = frame;
        });
        bg.setSiblingIndex(0);
    }

    private buildTopBar(root: Node): void {
        const titleNode = root.getChildByName('Title');
        if (titleNode) {
            const label = titleNode.getComponent(Label) ?? titleNode.addComponent(Label);
            label.string = 'Collection';
            label.color = colorFromHex('#6A4028');
            return;
        }
        createLabel(root, 'Title', 'Collection', 0, ScreenAdapter.topY(90), 62, colorFromHex('#6A4028'), 520, 90);
    }

    private buildTabs(root: Node): void {
        const tabsRoot = root.getChildByName('Tabs') ?? root;
        const y = ScreenAdapter.topY(210);
        const tabW = 178;
        const visibleChapters = this.chapters.slice(0, 5);
        const visibleIds = new Set(visibleChapters.map((chapter) => `Tab_${chapter.id}`));
        tabsRoot.children.forEach((child) => {
            if (child.name.startsWith('Tab_') && !visibleIds.has(child.name)) child.active = false;
        });
        const startX = -tabW * (Math.min(5, this.chapters.length) - 1) / 2;
        visibleChapters.forEach((chapter, index) => {
            const active = chapter.id === this.activeChapterId;
            const x = startX + index * tabW;
            const tab = tabsRoot.getChildByName(`Tab_${chapter.id}`) ?? createNode(tabsRoot, `Tab_${chapter.id}`, x, tabsRoot === root ? y : 0, tabW, 82);
            tab.active = true;
            if (tabsRoot === root) drawRect(tab, tabW - 12, 68, active ? colorFromHex('#FFF4DE') : colorFromHex('#F4D9AB', 80), active ? colorFromHex('#C57A42') : undefined, active ? 3 : 0, 26);
            if (!tab.getComponent(Button)) {
                tab.addComponent(Button);
                bindPressScale(tab, 0.96);
            }
            const labelNode = tab.getChildByName('Label');
            const label = labelNode?.getComponent(Label) ?? createLabel(tab, 'Label', chapter.title, 0, 0, 28, colorFromHex(active ? '#6A4028' : '#9B7456'), tabW, 64);
            label.string = chapter.title;
            label.fontSize = 28;
            label.isBold = active;
            label.color = colorFromHex(active ? '#4E2F1D' : '#8B6A55');
            const switchTab = (): void => {
                if (this.activeChapterId === chapter.id) return;
                this.activeChapterId = chapter.id;
                this.render();
            };
            tab.targetOff(this);
            tab.on(Node.EventType.TOUCH_END, switchTab, this);
            if (labelNode) {
                if (!labelNode.getComponent(Button)) labelNode.addComponent(Button);
                labelNode.targetOff(this);
                labelNode.on(Node.EventType.TOUCH_END, switchTab, this);
            }
        });
    }

    private buildAuthoredCards(): void {
        const cardsRoot = this.node.getChildByName('Cards');
        const chapter = this.chapters.find((item) => item.id === this.activeChapterId);
        if (!cardsRoot || !chapter) return;
        const activeGroupName = `Cards_${this.activeChapterId}`;
        cardsRoot.children.forEach((child) => {
            if (child.name.startsWith('Cards_')) child.active = child.name === activeGroupName;
        });
        const activeGroup = cardsRoot.getChildByName(activeGroupName) ?? createNode(cardsRoot, activeGroupName, 0, 0, 900, 1900);
        activeGroup.active = true;
        const cardsTransform = cardsRoot.getComponent(UITransform) ?? cardsRoot.addComponent(UITransform);
        const viewH = Math.max(600, cardsTransform.contentSize.height || 1500);
        const viewW = Math.max(1600, cardsTransform.contentSize.width || 900);
        if (cardsTransform.contentSize.width < viewW) {
            cardsTransform.setContentSize(viewW, cardsTransform.contentSize.height || viewH);
        }
        const templateCard = activeGroup.getChildByName(`Card_${chapter.subchapters[0]?.id ?? ''}`);
        const cardH = templateCard?.getComponent(UITransform)?.contentSize.height ?? 620;
        const cardScaleY = Math.max(1, templateCard?.scale.y ?? 1);
        const cardVisualHalfH = cardH * cardScaleY / 2;
        const cardStepY = Math.max(980, cardH * cardScaleY + 120);
        const topSafeY = viewH / 2 - cardVisualHalfH - 36;
        const firstCardY = Math.min(templateCard?.position.y ?? topSafeY, topSafeY);
        const bottomMostY = firstCardY - Math.max(0, chapter.subchapters.length - 1) * cardStepY - cardVisualHalfH;
        const topMostY = firstCardY + cardVisualHalfH;
        const contentH = Math.max(viewH + 1, Math.max(Math.abs(topMostY), Math.abs(bottomMostY)) * 2 + 240);
        const contentTransform = activeGroup.getComponent(UITransform) ?? activeGroup.addComponent(UITransform);
        contentTransform.setContentSize(viewW, contentH);
        cardsRoot.getComponent(Mask) ?? cardsRoot.addComponent(Mask);
        const scrollView = cardsRoot.getComponent(ScrollView) ?? cardsRoot.addComponent(ScrollView);
        scrollView.vertical = true;
        scrollView.horizontal = false;
        scrollView.content = activeGroup;
        chapter.subchapters.forEach((subchapter, index) => {
            const card = activeGroup.getChildByName(`Card_${subchapter.id}`);
            if (card) {
                card.setPosition(card.position.x, firstCardY - index * cardStepY, card.position.z);
                this.renderCard(card, subchapter, chapter, card.getComponent(UITransform)?.contentSize.width ?? 820, card.getComponent(UITransform)?.contentSize.height ?? 620);
            } else {
                const fallback = createNode(activeGroup, `Card_${subchapter.id}`, 0, firstCardY - index * cardStepY, 820, 620);
                this.renderCard(fallback, subchapter, chapter, 820, 620);
            }
        });
    }

    private buildCards(root: Node): void {
        const chapter = this.chapters.find((item) => item.id === this.activeChapterId);
        if (!chapter) return;
        const topY = ScreenAdapter.topY(300);
        const bottomY = ScreenAdapter.bottomY(70);
        const viewW = ScreenAdapter.contentWidth(72, 860, 560);
        const viewH = Math.max(760, topY - bottomY);
        const scrollNode = createNode(root, 'CardsScroll', 0, (topY + bottomY) / 2, viewW, viewH);
        const scrollView = scrollNode.addComponent(ScrollView);
        scrollView.vertical = true;
        scrollView.horizontal = false;

        const viewport = createNode(scrollNode, 'view', 0, 0, viewW, viewH);
        const cardW = Math.min(820, viewW - 36);
        const cardH = 620;
        const gapY = 44;
        const topPadding = 24;
        const bottomPadding = 24;
        const totalH = Math.max(viewH, chapter.subchapters.length * cardH + Math.max(0, chapter.subchapters.length - 1) * gapY + topPadding + bottomPadding);
        const content = createNode(viewport, 'content', 0, 0, viewW, totalH);
        let y = totalH / 2 - topPadding - cardH / 2;
        chapter.subchapters.forEach((subchapter) => {
            const card = createNode(content, `Card_${subchapter.id}`, 0, y, cardW, cardH);
            this.renderCard(card, subchapter, chapter, cardW, cardH);
            y -= cardH + gapY;
        });
        scrollView.content = content;
    }

    private renderCard(card: Node, subchapter: MetaSubchapterConfig, chapter: MetaChapterConfig, width: number, height: number): void {
        card.active = true;
        const progress = ProgressRepository.getBeadPuzzleProgress(subchapter.puzzleId);
        const maxCleared = ProgressRepository.load().maxClearedLevelId;
        const unlocked = maxCleared >= subchapter.levelRange[0] - 1 || progress.unlockedGroups.length > 0;
        card.getChildByName('CardBase')?.destroy();
        card.getChildByName('PuzzleBase')?.destroy();
        card.getChildByName('PuzzleRuntime')?.destroy();
        card.getChildByName('Lock')?.destroy();

        const puzzleW = width - 76;
        const puzzleH = height - 150;
        const puzzleNode = card.getChildByName('Puzzle') ?? createNode(card, 'Puzzle', 0, 66, puzzleW, puzzleH);
        puzzleNode.active = true;
        const transform = puzzleNode.getComponent(UITransform) ?? puzzleNode.addComponent(UITransform);
        if (transform.contentSize.width <= 0 || transform.contentSize.height <= 0) {
            transform.setContentSize(puzzleW, puzzleH);
        }
        const sprite = puzzleNode.getComponent(Sprite) ?? puzzleNode.addComponent(Sprite);
        sprite.enabled = true;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = null;
        loadSpriteFrameFromResources(`newtheme/collection_beads/${subchapter.puzzleId}`, (frame) => {
            if (frame && sprite.isValid) {
                sprite.spriteFrame = frame;
                return;
            }
            loadSpriteFrameFromResources('newtheme/collection_beads/locked', (lockedFrame) => {
                if (lockedFrame && sprite.isValid) sprite.spriteFrame = lockedFrame;
            });
        });
        puzzleNode.setSiblingIndex(0);

        const title = `${subchapter.displayName ?? subchapter.title}\nlevel ${subchapter.levelRange[0]}-${subchapter.levelRange[1]}`;
        const nameNode = card.getChildByName('Name');
        if (nameNode) {
            nameNode.active = true;
            nameNode.setSiblingIndex(card.children.length - 1);
            const label = nameNode.getComponent(Label) ?? nameNode.addComponent(Label);
            label.string = title;
            label.color = colorFromHex(unlocked ? '#6A4028' : '#9A8B7A');
        } else {
            createLabel(card, 'Name', title, 0, -height / 2 + 58, 34, colorFromHex(unlocked ? '#6A4028' : '#9A8B7A'), width - 52, 68);
        }
    }

    private bindImageButton(name: string, iconPath: string, fallbackX: number, fallbackY: number, fallbackSize: number, onClick: () => void): Node {
        const existing = this.node.getChildByName(name);
        const node = existing ?? createNode(this.node, name, fallbackX, fallbackY, fallbackSize, fallbackSize);
        if (!existing) node.setPosition(fallbackX, fallbackY, 0);
        node.setSiblingIndex(this.node.children.length - 1);
        const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources(iconPath, (frame) => {
            if (frame && sprite.isValid) sprite.spriteFrame = frame;
        });
        if (!node.getComponent(Button)) {
            node.addComponent(Button);
            bindPressScale(node, 0.92);
        }
        node.targetOff(this);
        node.on(Node.EventType.TOUCH_END, onClick, this);
        return node;
    }
}
