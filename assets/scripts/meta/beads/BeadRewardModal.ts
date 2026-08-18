import { _decorator, AudioClip, AudioSource, BlockInputEvents, Button, Color, Component, EventTouch, Graphics, Label, Node, resources, Sprite, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { ScreenAdapter } from '../../ui/common/ScreenAdapter';
import { Haptic } from '../../core/HapticManager';
import { bindPressScale, colorFromHex, createLabel, createNode, drawRect, loadSpriteFrameFromResources } from '../../ui/common/UiFactory';
import { MetaSubchapterConfig } from '../MetaChapterRepository';
import { BeadCell, BeadFillStyle, BeadPuzzleData } from './BeadPuzzleTypes';
import { BeadPuzzleView } from './BeadPuzzleView';

const { ccclass } = _decorator;

const PANEL_BASE_WIDTH = 920;
const PANEL_BASE_HEIGHT = 1260;
const PANEL_TARGET_SCALE = 1;
const PANEL_MARGIN_X = 42;
const PANEL_MARGIN_Y = 130;
const PUZZLE_HOST_WIDTH = 700;
const PUZZLE_HOST_HEIGHT = 650;
const PUZZLE_BASE_WIDTH = 660;
const PUZZLE_BASE_HEIGHT = 610;
const PUZZLE_ART_WIDTH = 640;
const PUZZLE_ART_HEIGHT = 590;
const POPUP_BEAN_TITLE = 'newtheme/popup_bean_title';
const POPUP_BEAN_CARD = 'newtheme/popup_bean_card';
const POPUP_BEAN_BUTTON = 'newtheme/popup_bean_button';
const POPUP_BEAN_BAG = 'newtheme/popup_bean_bag';
const HOME_BUTTON = 'newtheme/button';
const HOLD_TO_FILL_SECONDS = 0.45;
const DEFAULT_PUZZLE_DISPLAY_CELL_FACTOR = 1;
const INTRO_PUZZLE_DISPLAY_CELL_FACTOR = 1;
const COMPLETION_ART_WIDTH = 720;
const COMPLETION_ART_HEIGHT = 660;
const FILL_TICK_SFX_PATH = 'audio/sfx/click_new';
const FILL_COMPLETE_SFX_PATH = 'audio/sfx/fill_complete_new';
const FILL_TICK_VOLUME = 0.14;
const FILL_TICK_ACCENT_VOLUME = 0.2;
const FILL_COMPLETE_VOLUME = 0.72;
const FILL_CELL_HAPTIC_MS = 12;
const FILL_CELL_ACCENT_HAPTIC_MS = 18;
const FILL_CELL_ACCENT_INTERVAL = 8;

type BeadRewardMode = 'start' | 'reward';

export interface BeadRewardModalOptions {
    mode: BeadRewardMode;
    subchapter: MetaSubchapterConfig;
    puzzle: BeadPuzzleData | null;
    visibleGroupIds: number[];
    newGroupIds?: number[];
    previousCellCount?: number;
    completedCellCount?: number;
    rewardBeanCount?: number;
    fillStyle?: BeadFillStyle;
    levelId?: number;
    isSubchapterComplete?: boolean;
    buttonText: string;
    onAction: () => void;
    onClose?: () => void;
}

@ccclass('BeadRewardModal')
export class BeadRewardModal extends Component {
    private options: BeadRewardModalOptions | null = null;
    private completionSfx: AudioClip | null = null;
    private fillTickSfx: AudioClip | null = null;
    private fillTickSchedule: (() => void) | null = null;
    private fillHapticActive = false;
    private fillHapticStep = 0;
    private panelBaseScale: Vec3 | null = null;

    show(options: BeadRewardModalOptions): void {
        this.options = options;
        this.node.active = true;
        if (!this.hasReusableLayout()) {
            this.node.removeAllChildren();
        }
        this.node.setScale(new Vec3(1, 1, 1));
        this.buildMask();
        const panel = this.buildPanel(options);
        const panelFitScale = this.resolvePanelScale();
        const baseScale = this.resolvePanelBaseScale(panel);
        const finalScale = new Vec3(baseScale.x * panelFitScale, baseScale.y * panelFitScale, 1);
        panel.setScale(new Vec3(finalScale.x * 0.96, finalScale.y * 0.96, 1));
        tween(panel)
            .to(0.14, { scale: new Vec3(finalScale.x * 1.01, finalScale.y * 1.01, 1) })
            .to(0.08, { scale: finalScale })
            .start();
    }

    hide(): void {
        this.stopFillFeedback();
        this.node.active = false;
        this.options = null;
    }

    protected onDisable(): void {
        this.stopFillFeedback();
    }

    private hasReusableLayout(): boolean {
        return !!this.node.getChildByName('BeadPanel');
    }

    private buildMask(): void {
        const size = ScreenAdapter.fullSize();
        const mask = this.node.getChildByName('BeadMask') ?? createNode(this.node, 'BeadMask', 0, 0, size.width, size.height);
        mask.active = true;
        mask.setSiblingIndex(0);
        mask.getComponent(BlockInputEvents) ?? mask.addComponent(BlockInputEvents);
        drawRect(mask, size.width, size.height, colorFromHex('#000000', 220), undefined, 0, 0);
        mask.off(Node.EventType.TOUCH_END);
        if (this.options?.onClose) {
            mask.getComponent(Button) ?? mask.addComponent(Button);
            mask.on(Node.EventType.TOUCH_END, () => this.options?.onClose?.());
        }
    }

    private buildPanel(options: BeadRewardModalOptions): Node {
        const panel = this.ensureNode(this.node, 'BeadPanel', 0, 0, PANEL_BASE_WIDTH, PANEL_BASE_HEIGHT);
        panel.active = true;
        panel.setSiblingIndex(this.node.children.length - 1);

        const titleArt = this.ensureImageNode(panel, 'PopupBeanTitle', 0, 430, 900, 378, POPUP_BEAN_TITLE);
        const title = options.puzzle?.displayName ?? options.subchapter.displayName ?? options.subchapter.title;
        const titleLabel = this.ensureLabel(panel, 'Title', title, 0, 458, 60, colorFromHex('#6A4028'), 720, 100);
        titleLabel.overflow = Label.Overflow.SHRINK;

        const card = this.ensureImageNode(panel, 'PopupBeanCard', 0, 66, 760, 766, POPUP_BEAN_CARD);
        card.setSiblingIndex(1);
        titleArt.setSiblingIndex(2);
        titleLabel.node.setSiblingIndex(3);
        const puzzleHost = this.ensureNode(card, 'PuzzleHost', 0, 6, PUZZLE_HOST_WIDTH, PUZZLE_HOST_HEIGHT);
        puzzleHost.active = true;
        puzzleHost.setSiblingIndex(card.children.length - 1);
        puzzleHost.children
            .filter((child) => child.name === 'PixelFinal' || child.name.startsWith('Confetti_') || child.name.startsWith('FlyingBean_'))
            .forEach((child) => child.destroy());
        let puzzleNode = puzzleHost.getChildByName('Puzzle');
        if (puzzleNode) puzzleNode.destroy();
        puzzleNode = createNode(puzzleHost, 'Puzzle', 0, 0, PUZZLE_ART_WIDTH, PUZZLE_ART_HEIGHT);
        const puzzleView = puzzleNode.addComponent(BeadPuzzleView);

        panel.getChildByName('ActionButton')?.destroy();
        const button = this.ensureImageNode(panel, 'ContinueButton', 0, -548, 560, 187, HOME_BUTTON);
        button.setSiblingIndex(8);
        const buttonComponent = button.getComponent(Button) ?? button.addComponent(Button);
        button.off(Node.EventType.TOUCH_END);
        bindPressScale(button, 0.94);
        const actionText = options.mode === 'start'
            ? options.buttonText
            : (options.isSubchapterComplete ? 'Next Level' : 'Continue');
        const buttonLabel = this.ensureLabel(button, 'Label', actionText, 0, 24, 46, colorFromHex('#FFFFFF'), 430, 78);
        buttonLabel.node.setSiblingIndex(button.children.length - 1);
        button.on(Node.EventType.TOUCH_END, () => {
            if (!buttonComponent.interactable) return;
            options.onAction();
        });

        const isReward = options.mode === 'reward';
        const isCompletionReward = isReward && options.isSubchapterComplete === true;
        const existingBeadBag = panel.getChildByName('BeadBag');
        if (!isReward && existingBeadBag) existingBeadBag.active = false;
        const buttonOpacity = button.getComponent(UIOpacity) ?? button.addComponent(UIOpacity);
        buttonOpacity.opacity = isReward ? 0 : 255;
        buttonComponent.interactable = !isReward;

        const displayCellFactor = this.resolvePuzzleDisplayCellFactor(options);
        if (options.puzzle) {
            if (options.mode === 'reward') {
                const previousCellCount = options.previousCellCount ?? 0;
                const completedCellCount = options.completedCellCount ?? 0;
                const fillStyle = options.fillStyle ?? options.puzzle.fillStyle ?? 'left-to-right';
                if (completedCellCount <= previousCellCount) {
                    puzzleView.renderProgress(options.puzzle, completedCellCount, { width: PUZZLE_ART_WIDTH, height: PUZZLE_ART_HEIGHT, showLocked: true, displayCellFactor, fillStyle });
                    this.revealButton(button, buttonComponent);
                    return panel;
                }
                let fillStarted = false;
                let beadTray: Node | null = null;
                puzzleView.renderProgress(options.puzzle, previousCellCount, { width: PUZZLE_ART_WIDTH, height: PUZZLE_ART_HEIGHT, showLocked: true, displayCellFactor, fillStyle });
                const startFill = (): void => {
                    if (fillStarted || !beadTray) return;
                    fillStarted = true;
                    beadTray.getComponent(Button)!.interactable = false;
                    const startButton = beadTray.getChildByName('StartBeadingButton');
                    const startButtonComponent = startButton?.getComponent(Button) ?? null;
                    if (startButtonComponent) startButtonComponent.interactable = false;
                    this.playFlyingBeans(puzzleHost, beadTray, options.puzzle!, previousCellCount, completedCellCount, fillStyle, displayCellFactor);
                    this.fillHapticActive = true;
                    this.fillHapticStep = 0;
                    this.startFillTickSfx();
                    puzzleView.renderFillProgress(
                        options.puzzle!,
                        previousCellCount,
                        completedCellCount,
                        {
                            width: PUZZLE_ART_WIDTH,
                            height: PUZZLE_ART_HEIGHT,
                            showLocked: true,
                            displayCellFactor,
                            fillStyle,
                            onFillStep: () => this.playFillCellHaptic(),
                        },
                        () => {
                            this.stopFillFeedback();
                            this.playColorCompleteFeedback();
                            this.playConfetti(puzzleHost);
                            if (isCompletionReward) {
                                this.scheduleOnce(() => this.showCollectionCompletion(puzzleNode!, options, button, buttonComponent), 0.28);
                            } else {
                                this.scheduleOnce(() => this.revealButton(button, buttonComponent), 0.28);
                            }
                        },
                    );
                };
                beadTray = this.buildBeanBag(panel, options.rewardBeanCount ?? 24, startFill);
            } else {
                puzzleView.renderProgress(options.puzzle, 0, { width: PUZZLE_ART_WIDTH, height: PUZZLE_ART_HEIGHT, showLocked: true, displayCellFactor, fillStyle: options.fillStyle ?? options.puzzle.fillStyle ?? 'left-to-right' });
            }
        } else {
            puzzleView.renderPlaceholder(500, 430, false);
            this.ensureLabel(puzzleHost, 'MissingData', 'Puzzle data coming soon', 0, -218, 24, colorFromHex('#9A8069'), 420, 44);
        }
        return panel;
    }

    private ensureNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
        const node = parent.getChildByName(name) ?? createNode(parent, name, x, y, width, height);
        node.active = true;
        if (node.position.x === 0 && node.position.y === 0 && (x !== 0 || y !== 0) && !node.getComponent(UITransform)) {
            node.setPosition(new Vec3(x, y, 0));
        }
        const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
        if (transform.contentSize.width <= 0 || transform.contentSize.height <= 0) {
            transform.setContentSize(width, height);
        }
        return node;
    }

    private ensureImageNode(parent: Node, name: string, x: number, y: number, width: number, height: number, path: string): Node {
        const node = this.ensureNode(parent, name, x, y, width, height);
        const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources(path, (frame) => {
            if (frame && sprite.isValid) sprite.spriteFrame = frame;
        });
        return node;
    }

    private ensureLabel(parent: Node, name: string, text: string, x: number, y: number, fontSize: number, color: Color, width: number, height: number): Label {
        const existing = parent.getChildByName(name);
        if (existing) {
            const label = existing.getComponent(Label) ?? existing.addComponent(Label);
            label.string = text;
            return label;
        }

        const label = createLabel(parent, name, text, x, y, fontSize, color, width, height);
        label.node.setPosition(new Vec3(x, y, 0));
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.18);
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private buildBeanBag(parent: Node, _beanCount: number, onStart: () => void): Node {
        const tray = this.ensureImageNode(parent, 'BeadBag', 0, -382, 720, 340, POPUP_BEAN_BAG);
        tray.setSiblingIndex(6);
        tray.getChildByName('PopupBeanCard2')?.destroy();
        tray.getChildByName('BeanCountText')?.destroy();
        tray.getChildByName('Hint')?.destroy();
        this.clearHoldListeners(tray);
        bindPressScale(tray, 0.94);
        const trayButton = tray.getComponent(Button) ?? tray.addComponent(Button);
        trayButton.interactable = true;

        const startButton = this.ensureImageNode(tray, 'StartBeadingButton', 0, -146, 560, 187, POPUP_BEAN_BUTTON);
        this.clearHoldListeners(startButton);
        bindPressScale(startButton, 0.94);
        const startButtonComponent = startButton.getComponent(Button) ?? startButton.addComponent(Button);
        startButtonComponent.interactable = true;
        startButton.active = true;
        startButton.setSiblingIndex(tray.children.length - 1);

        const start = (): void => {
            Haptic.tick(60);
            onStart();
        };
        this.bindHoldToFill(tray, start);
        this.bindHoldToFill(startButton, start);
        return tray;
    }

    private clearHoldListeners(node: Node): void {
        node.off(Node.EventType.TOUCH_START);
        node.off(Node.EventType.TOUCH_END);
        node.off(Node.EventType.TOUCH_CANCEL);
    }

    private bindHoldToFill(node: Node, onFill: () => void): void {
        let holding = false;
        let triggered = false;
        const trigger = (): void => {
            if (!holding || triggered) return;
            triggered = true;
            onFill();
        };
        const cancel = (event?: EventTouch): void => {
            if (event) event.propagationStopped = true;
            holding = false;
            this.unschedule(trigger);
        };
        node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            event.propagationStopped = true;
            if (triggered) return;
            holding = true;
            this.unschedule(trigger);
            this.scheduleOnce(trigger, HOLD_TO_FILL_SECONDS);
        });
        node.on(Node.EventType.TOUCH_END, cancel);
        node.on(Node.EventType.TOUCH_CANCEL, cancel);
    }

    private playFlyingBeans(parent: Node, source: Node, puzzle: BeadPuzzleData, previousCellCount: number, completedCellCount: number, fillStyle: BeadFillStyle, displayCellFactor: number): void {
        const targets = this.resolveFlightTargets(puzzle, previousCellCount, completedCellCount, fillStyle, displayCellFactor);
        const beanCount = Math.max(72, Math.min(118, Math.round(targets.length * 0.72)));
        const startBase = this.resolveLocalPosition(parent, source);
        const startBaseX = startBase.x;
        const startBaseY = startBase.y;
        for (let index = 0; index < beanCount; index += 1) {
            const targetIndex = targets.length <= 1 ? 0 : Math.floor(index * (targets.length - 1) / Math.max(1, beanCount - 1));
            const target = targets[targetIndex];
            const jitterX = ((index % 5) - 2) * 1.8;
            const jitterY = ((Math.floor(index / 5) % 5) - 2) * 1.8;
            const bean = this.createSmallBean(
                parent,
                `FlyingBean_${index}`,
                startBaseX + (index % 6) * 7,
                startBaseY + (index % 4) * 8,
                target.fill,
                22,
            );
            tween(bean)
                .delay(index * 0.006)
                .to(0.28 + (index % 3) * 0.014, {
                    position: new Vec3(target.x + jitterX, target.y + jitterY, 0),
                    scale: new Vec3(0.76, 0.76, 1),
                })
                .call(() => { if (bean.isValid) bean.destroy(); })
                .start();
        }
    }

    private resolveLocalPosition(parent: Node, source: Node): Vec3 {
        const sourceWorld = source.worldPosition;
        const parentTransform = parent.getComponent(UITransform);
        if (parentTransform) {
            return parentTransform.convertToNodeSpaceAR(new Vec3(sourceWorld.x, sourceWorld.y, sourceWorld.z));
        }
        const parentWorld = parent.worldPosition;
        return new Vec3(sourceWorld.x - parentWorld.x, sourceWorld.y - parentWorld.y, sourceWorld.z - parentWorld.z);
    }

    private createSmallBean(parent: Node, name: string, x: number, y: number, fill: string, size: number): Node {
        const bean = createNode(parent, name, x, y, size, size);
        const graphics = bean.addComponent(Graphics);
        const radius = size * 0.42;
        const shadow = this.shiftColor(fill, -0.24);
        const light = this.shiftColor(fill, 0.38);
        graphics.fillColor = colorFromHex(shadow, 115);
        graphics.circle(size * 0.04, -size * 0.05, radius * 1.08);
        graphics.fill();
        graphics.fillColor = colorFromHex(this.shiftColor(fill, 0.08), 252);
        graphics.strokeColor = colorFromHex(shadow, 190);
        graphics.lineWidth = Math.max(1, size * 0.075);
        graphics.circle(0, 0, radius);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = colorFromHex(light, 150);
        graphics.lineWidth = Math.max(1, size * 0.05);
        graphics.circle(0, 0, radius * 0.72);
        graphics.stroke();
        graphics.strokeColor = colorFromHex(shadow, 120);
        graphics.lineWidth = Math.max(1, size * 0.095);
        graphics.moveTo(-radius * 0.28, radius * 0.22);
        graphics.lineTo(radius * 0.28, -radius * 0.22);
        graphics.moveTo(radius * 0.28, radius * 0.22);
        graphics.lineTo(-radius * 0.28, -radius * 0.22);
        graphics.stroke();
        graphics.fillColor = new Color(255, 255, 255, 46);
        graphics.circle(-radius * 0.25, radius * 0.26, Math.max(1, radius * 0.2));
        graphics.fill();
        return bean;
    }

    private resolveFlightTargets(puzzle: BeadPuzzleData, previousCellCount: number, completedCellCount: number, fillStyle: BeadFillStyle, displayCellFactor: number): Array<{ x: number; y: number; fill: string }> {
        const displayPuzzle = this.prepareDisplayPuzzle(puzzle, displayCellFactor);
        const layout = this.preparePuzzleLayout(displayPuzzle);
        const ordered = this.orderCellsForProgress(displayPuzzle, fillStyle);
        const fromCount = this.mapProgressCount(previousCellCount, puzzle.cells.length, displayPuzzle.cells.length);
        const toCount = this.mapProgressCount(completedCellCount, puzzle.cells.length, displayPuzzle.cells.length);
        const freshCells = ordered.slice(fromCount, Math.max(fromCount + 1, toCount));
        if (freshCells.length <= 0) return [{ x: 0, y: 0, fill: this.samplePuzzleColors(puzzle)[0] }];
        return freshCells.map(([x, y, colorId]) => ({
            x: layout.originX + x * layout.cell,
            y: layout.originY - y * layout.cell,
            fill: displayPuzzle.palette[colorId] ?? this.samplePuzzleColors(puzzle)[0],
        }));
    }

    private preparePuzzleLayout(puzzle: BeadPuzzleData): { cell: number; originX: number; originY: number } {
        const padding = 10;
        const cell = Math.max(4, Math.min((PUZZLE_ART_WIDTH - padding * 2) / puzzle.cols, (PUZZLE_ART_HEIGHT - padding * 2) / puzzle.rows));
        return {
            cell,
            originX: -puzzle.cols * cell / 2 + cell / 2,
            originY: puzzle.rows * cell / 2 - cell / 2,
        };
    }

    private prepareDisplayPuzzle(puzzle: BeadPuzzleData, factor = 1): BeadPuzzleData {
        const displayFactor = Math.max(1, factor);
        if (displayFactor <= 1) return puzzle;
        const byDisplayCell = new Map<string, BeadCell>();
        puzzle.cells.forEach(([x, y, colorId, groupId]) => {
            const displayX = Math.floor(x / displayFactor);
            const displayY = Math.floor(y / displayFactor);
            const key = `${displayX}:${displayY}`;
            const candidate: BeadCell = [displayX, displayY, colorId, groupId];
            const existing = byDisplayCell.get(key);
            if (!existing || this.displayCellPriority(puzzle, candidate) > this.displayCellPriority(puzzle, existing)) {
                byDisplayCell.set(key, candidate);
            }
        });
        return {
            ...puzzle,
            cols: Math.ceil(puzzle.cols / displayFactor),
            rows: Math.ceil(puzzle.rows / displayFactor),
            cells: [...byDisplayCell.values()],
        };
    }

    private displayCellPriority(puzzle: BeadPuzzleData, cell: BeadCell): number {
        const fill = puzzle.palette[cell[2]] ?? '#FFFFFF';
        const raw = fill.replace('#', '').padEnd(6, 'F').slice(0, 6);
        const r = parseInt(raw.slice(0, 2), 16);
        const g = parseInt(raw.slice(2, 4), 16);
        const b = parseInt(raw.slice(4, 6), 16);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const luminance = r * 0.299 + g * 0.587 + b * 0.114;
        return (255 - luminance) * 2 + (max - min) * 0.65;
    }

    private mapProgressCount(count: number, originalTotal: number, displayTotal: number): number {
        if (originalTotal <= 0 || displayTotal <= 0) return 0;
        return Math.max(0, Math.min(displayTotal, Math.round(displayTotal * count / originalTotal)));
    }

    private orderCellsForProgress(puzzle: BeadPuzzleData, fillStyle: BeadFillStyle): BeadCell[] {
        const lanes = new Map<number, BeadCell[]>();
        puzzle.cells.forEach((cell) => {
            const colorId = cell[2];
            const lane = lanes.get(colorId) ?? [];
            lane.push(cell);
            lanes.set(colorId, lane);
        });
        const sortedLanes = [...lanes.values()]
            .map((lane) => lane.sort((a, b) => this.progressScore(a, puzzle, fillStyle) - this.progressScore(b, puzzle, fillStyle)))
            .sort((a, b) => this.progressScore(a[0], puzzle, fillStyle) - this.progressScore(b[0], puzzle, fillStyle));
        const cursors = sortedLanes.map(() => 0);
        const ordered: BeadCell[] = [];
        const chunkSize = 2;
        let hasMore = true;
        while (hasMore) {
            hasMore = false;
            sortedLanes.forEach((lane, laneIndex) => {
                for (let take = 0; take < chunkSize && cursors[laneIndex] < lane.length; take += 1) {
                    ordered.push(lane[cursors[laneIndex]]);
                    cursors[laneIndex] += 1;
                    hasMore = true;
                }
            });
        }
        return ordered;
    }

    private progressScore(cell: BeadCell, puzzle: BeadPuzzleData, fillStyle: BeadFillStyle): number {
        const [x, y] = cell;
        const nx = puzzle.cols <= 1 ? 0 : x / (puzzle.cols - 1);
        const ny = puzzle.rows <= 1 ? 0 : y / (puzzle.rows - 1);
        const main = fillStyle === 'right-to-left' ? 1 - nx
            : fillStyle === 'bottom-up' ? 1 - ny
                : fillStyle === 'top-down' ? ny
                    : nx;
        const cross = fillStyle === 'left-to-right' || fillStyle === 'right-to-left' ? ny : nx;
        const wave = Math.sin((cross * 3.2 + this.hashString(puzzle.id) * 0.013) * Math.PI) * 0.025;
        const noise = this.cellNoise(x, y, `${puzzle.id}:${cell[2]}`) * 0.035;
        return main + cross * 0.018 + wave + noise;
    }

    private samplePuzzleColors(puzzle: BeadPuzzleData): string[] {
        return puzzle.palette.length > 0 ? puzzle.palette : ['#754724', '#FBEBD0', '#E19F91', '#F38C36'];
    }

    private showCollectionCompletion(puzzleNode: Node, options: BeadRewardModalOptions, button: Node, buttonComponent: Button): void {
        const finalNode = createNode(puzzleNode.parent ?? puzzleNode, 'PixelFinal', 0, 0, COMPLETION_ART_WIDTH, COMPLETION_ART_HEIGHT);
        finalNode.setScale(new Vec3(1, 1, 1));
        const finalOpacity = finalNode.addComponent(UIOpacity);
        finalOpacity.opacity = 0;
        const puzzleOpacity = puzzleNode.getComponent(UIOpacity) ?? puzzleNode.addComponent(UIOpacity);
        const sprite = finalNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.loadCompletionSprite(sprite, options.subchapter.puzzleId);
        tween(puzzleOpacity)
            .delay(0.16)
            .to(0.38, { opacity: 0 })
            .start();
        tween(finalOpacity)
            .delay(0.16)
            .to(0.38, { opacity: 255 })
            .call(() => this.revealButton(button, buttonComponent))
            .start();
    }

    private playFillCellHaptic(): void {
        if (!this.fillHapticActive || !this.node.activeInHierarchy) return;
        this.fillHapticStep += 1;
        const duration = this.fillHapticStep % FILL_CELL_ACCENT_INTERVAL === 0
            ? FILL_CELL_ACCENT_HAPTIC_MS
            : FILL_CELL_HAPTIC_MS;
        Haptic.tick(duration);
    }

    private stopFillFeedback(): void {
        this.stopFillTickSfx();
        this.fillHapticActive = false;
        this.fillHapticStep = 0;
        Haptic.cancelAll();
    }

    private startFillTickSfx(): void {
        this.stopFillTickSfx();
        let played = 0;
        const playTick = (): void => {
            if (!this.node.isValid) return;
            played += 1;
            this.playFillTickSfx(played);
            if (played >= 18) this.stopFillTickSfx();
        };
        this.fillTickSchedule = playTick;
        this.schedule(playTick, 0.055);
        playTick();
    }

    private stopFillTickSfx(): void {
        if (!this.fillTickSchedule) return;
        this.unschedule(this.fillTickSchedule);
        this.fillTickSchedule = null;
    }

    private playFillTickSfx(index: number): void {
        const source = this.node.getComponent(AudioSource) ?? this.node.addComponent(AudioSource);
        const volume = index % 3 === 0 ? FILL_TICK_ACCENT_VOLUME : FILL_TICK_VOLUME;
        if (this.fillTickSfx) {
            source.playOneShot(this.fillTickSfx, volume);
            return;
        }
        resources.load(FILL_TICK_SFX_PATH, AudioClip, (error, clip) => {
            if (error || !clip || !this.node.isValid) return;
            this.fillTickSfx = clip;
            source.playOneShot(clip, volume);
        });
    }

    private playColorCompleteFeedback(): void {
        Haptic.tick(70);
        const source = this.node.getComponent(AudioSource) ?? this.node.addComponent(AudioSource);
        if (this.completionSfx) {
            source.playOneShot(this.completionSfx, FILL_COMPLETE_VOLUME);
            return;
        }
        resources.load(FILL_COMPLETE_SFX_PATH, AudioClip, (error, clip) => {
            if (error || !clip || !this.node.isValid) return;
            this.completionSfx = clip;
            source.playOneShot(clip, FILL_COMPLETE_VOLUME);
        });
    }

    private revealButton(button: Node, buttonComponent: Button): void {
        const panel = button.parent;
        const startButton = panel?.getChildByName('BeadBag')?.getChildByName('StartBeadingButton');
        if (startButton) startButton.active = false;
        const opacity = button.getComponent(UIOpacity) ?? button.addComponent(UIOpacity);
        buttonComponent.interactable = true;
        tween(opacity).to(0.18, { opacity: 255 }).start();
    }

    private playConfetti(parent: Node): void {
        const colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#B983FF', '#FF9F1C'];
        for (let index = 0; index < 18; index += 1) {
            const x = -230 + (index % 9) * 58;
            const y = 230 - Math.floor(index / 9) * 28;
            const piece = createNode(parent, `Confetti_${index}`, x, y, 18, 28);
            const opacity = piece.addComponent(UIOpacity);
            opacity.opacity = 255;
            drawRect(piece, 16, 24, colorFromHex(colors[index % colors.length], 235), undefined, 0, 4);
            const dir = index % 2 === 0 ? -1 : 1;
            tween(piece)
                .to(0.36, {
                    position: new Vec3(x + dir * (80 + (index % 3) * 24), y + 120 + (index % 4) * 16, 0),
                    scale: new Vec3(1.12, 1.12, 1),
                })
                .to(0.36, {
                    position: new Vec3(x + dir * (120 + (index % 3) * 30), y - 70 - (index % 5) * 18, 0),
                    scale: new Vec3(0.72, 0.72, 1),
                })
                .call(() => { if (piece.isValid) piece.destroy(); })
                .start();
            tween(opacity).delay(0.48).to(0.22, { opacity: 0 }).start();
        }
    }

    private sortGroupsByCellCount(puzzle: BeadPuzzleData, groupIds: number[]): number[] {
        return [...groupIds].sort((a, b) => {
            const countA = puzzle.cells.filter((cell) => cell[3] === a).length;
            const countB = puzzle.cells.filter((cell) => cell[3] === b).length;
            if (countA !== countB) return countA - countB;
            return a - b;
        });
    }

    private getGroupColor(puzzle: BeadPuzzleData, groupId: number): string {
        const cell = puzzle.cells.find((item) => item[3] === groupId);
        return puzzle.palette[cell?.[2] ?? 0] ?? '#C89057';
    }

    private cellNoise(x: number, y: number, seedText: string): number {
        const seed = this.hashString(`${seedText}:${x}:${y}`);
        return (seed % 1000) / 1000 - 0.5;
    }

    private hashString(value: string): number {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    private shiftColor(hex: string, ratio: number): string {
        const raw = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
        const next = [0, 2, 4].map((index) => {
            const value = parseInt(raw.slice(index, index + 2), 16);
            const shifted = ratio >= 0 ? value + (255 - value) * ratio : value * (1 + ratio);
            return Math.max(0, Math.min(255, Math.round(shifted))).toString(16).padStart(2, '0');
        }).join('');
        return `#${next}`;
    }

    private resolvePuzzleDisplayCellFactor(options: BeadRewardModalOptions): number {
        if (options.subchapter.id === 'ch1_01') return INTRO_PUZZLE_DISPLAY_CELL_FACTOR;
        return DEFAULT_PUZZLE_DISPLAY_CELL_FACTOR;
    }

    private resolvePanelBaseScale(panel: Node): Vec3 {
        if (!this.panelBaseScale) {
            this.panelBaseScale = panel.scale.clone();
        }
        return this.panelBaseScale;
    }

    private resolvePanelScale(): number {
        const size = ScreenAdapter.fullSize();
        const maxByWidth = (size.width - PANEL_MARGIN_X * 2) / PANEL_BASE_WIDTH;
        const maxByHeight = (size.height - PANEL_MARGIN_Y * 2) / PANEL_BASE_HEIGHT;
        return Math.max(0.68, Math.min(PANEL_TARGET_SCALE, maxByWidth, maxByHeight));
    }

    private loadCompletionSprite(sprite: Sprite, puzzleId: string): void {
        const candidates = [
            `newtheme/collection_beads/bead_pixel/${puzzleId}`,
            `newtheme/bead_pixel/${puzzleId}`,
            `newtheme/collection_beads/${puzzleId}`,
            'newtheme/collection_beads/locked',
        ];
        this.loadFirstAvailableSprite(sprite, candidates, 0);
    }

    private loadFirstAvailableSprite(sprite: Sprite, paths: string[], index: number): void {
        if (!sprite.isValid || index >= paths.length) return;
        loadSpriteFrameFromResources(paths[index], (frame) => {
            if (!sprite.isValid) return;
            if (frame) {
                sprite.spriteFrame = frame;
                return;
            }
            this.loadFirstAvailableSprite(sprite, paths, index + 1);
        });
    }

    private resolveRewardVisibleGroupIds(options: BeadRewardModalOptions): number[] {
        if (!options.puzzle || options.levelId == null) return options.visibleGroupIds;
        return options.puzzle.groups
            .filter((group) => group.unlockLevelId <= options.levelId!)
            .map((group) => group.id);
    }

    private resolveRewardNewGroupIds(options: BeadRewardModalOptions): number[] {
        if (options.newGroupIds && options.newGroupIds.length > 0) return options.newGroupIds;
        if (!options.puzzle || options.levelId == null) return [];
        return options.puzzle.groups
            .filter((group) => group.unlockLevelId === options.levelId)
            .map((group) => group.id);
    }
}
