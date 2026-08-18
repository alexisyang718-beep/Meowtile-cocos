import { _decorator, Color, Component, Graphics, Node, UITransform } from 'cc';
import { colorFromHex, createLabel, createNode, drawRect } from '../../ui/common/UiFactory';
import { BeadCell, BeadFillStyle, BeadPuzzleData } from './BeadPuzzleTypes';

const { ccclass } = _decorator;

export interface BeadPuzzleRenderOptions {
    width: number;
    height: number;
    showLocked?: boolean;
    compact?: boolean;
    displayCellFactor?: number;
    fillStartX?: number;
    fillStartY?: number;
    fillStyle?: BeadFillStyle;
    onFillStep?: (filledCount: number, totalCount: number) => void;
}

const LOCKED_FILL = '#E9E7E1';
const LOCKED_INNER_FILL = '#F7F6F2';
const LOCKED_STROKE = '#CFCAC0';
const LOCKED_INNER_STROKE = '#DDD8CF';
const FILL_INTERVAL_SEC = 0.016;
const FILL_TARGET_DURATION_SEC = 1.15;
const FILL_MAX_DURATION_SEC = 1.35;

@ccclass('BeadPuzzleView')
export class BeadPuzzleView extends Component {
    private fillSchedule: (() => void) | null = null;

    render(puzzle: BeadPuzzleData, visibleGroupIds: number[], newGroupIds: number[] = [], options: BeadPuzzleRenderOptions): void {
        this.clearFillSchedule();
        this.node.removeAllChildren();
        const displayPuzzle = this.prepareDisplayPuzzle(puzzle, options.displayCellFactor);
        const layout = this.prepareLayout(displayPuzzle, options);
        const canvas = createNode(this.node, 'BeadCanvas', 0, 0, options.width, options.height);
        const graphics = canvas.addComponent(Graphics);
        const visible = new Set(visibleGroupIds);
        const fresh = new Set(newGroupIds);
        this.drawCells(graphics, displayPuzzle, visible, fresh, options, layout);
    }

    renderFillAnimation(puzzle: BeadPuzzleData, visibleGroupIds: number[], newGroupIds: number[], options: BeadPuzzleRenderOptions, onComplete?: () => void): void {
        this.clearFillSchedule();
        this.node.removeAllChildren();
        const displayPuzzle = this.prepareDisplayPuzzle(puzzle, options.displayCellFactor);
        const layout = this.prepareLayout(displayPuzzle, options);
        const finalVisible = new Set(visibleGroupIds);
        const fresh = new Set(newGroupIds);
        const beforeVisible = new Set(visibleGroupIds.filter((id) => !fresh.has(id)));

        const baseCanvas = createNode(this.node, 'BeadCanvasBase', 0, 0, options.width, options.height);
        const baseGraphics = baseCanvas.addComponent(Graphics);
        this.drawCells(baseGraphics, displayPuzzle, beforeVisible, new Set<number>(), options, layout);

        const fillCanvas = createNode(this.node, 'BeadCanvasFill', 0, 0, options.width, options.height);
        const fillGraphics = fillCanvas.addComponent(Graphics);
        const freshCells = this.orderGroupsForFill(displayPuzzle, newGroupIds, finalVisible)
            .flatMap((groupId) => this.orderCellsForBeadFill(
                displayPuzzle.cells.filter((cell) => cell[3] === groupId && fresh.has(cell[3]) && finalVisible.has(cell[3])),
                displayPuzzle,
                layout,
                options.fillStartX,
                options.fillStartY,
            ));

        if (freshCells.length <= 0) {
            this.drawCells(fillGraphics, displayPuzzle, finalVisible, fresh, options, layout);
            onComplete?.();
            return;
        }

        let cursor = 0;
        const fillBatchSize = this.resolveFillBatchSize(freshCells.length);
        const tick = (): void => {
            const next = Math.min(freshCells.length, cursor + fillBatchSize);
            for (let index = cursor; index < next; index += 1) {
                const [x, y, colorId, groupId] = freshCells[index];
                const fill = displayPuzzle.palette[colorId] ?? LOCKED_FILL;
                const centerX = layout.originX + x * layout.cell;
                const centerY = layout.originY - y * layout.cell;
                this.drawPixel(fillGraphics, centerX, centerY, layout.cell * 0.96, fill, this.shiftColor(fill, -0.18), true);
                options.onFillStep?.(index + 1, freshCells.length);
            }
            cursor = next;
            if (cursor >= freshCells.length) {
                this.clearFillSchedule();
                onComplete?.();
            }
        };
        this.fillSchedule = tick;
        this.schedule(tick, FILL_INTERVAL_SEC);
        tick();
    }

    renderProgress(puzzle: BeadPuzzleData, completedCellCount: number, options: BeadPuzzleRenderOptions): void {
        this.clearFillSchedule();
        this.node.removeAllChildren();
        const displayPuzzle = this.prepareDisplayPuzzle(puzzle, options.displayCellFactor);
        const layout = this.prepareLayout(displayPuzzle, options);
        const ordered = this.orderCellsForProgress(displayPuzzle, options.fillStyle ?? puzzle.fillStyle ?? 'left-to-right');
        const displayCount = this.mapProgressCount(completedCellCount, puzzle.cells.length, displayPuzzle.cells.length);
        const filled = new Set(ordered.slice(0, displayCount).map((cell) => this.cellKey(cell[0], cell[1])));
        const canvas = createNode(this.node, 'BeadCanvas', 0, 0, options.width, options.height);
        const graphics = canvas.addComponent(Graphics);
        this.drawCellsByFilledSet(graphics, displayPuzzle, filled, options, layout);
    }

    renderFillProgress(puzzle: BeadPuzzleData, previousCellCount: number, completedCellCount: number, options: BeadPuzzleRenderOptions, onComplete?: () => void): void {
        this.clearFillSchedule();
        this.node.removeAllChildren();
        const displayPuzzle = this.prepareDisplayPuzzle(puzzle, options.displayCellFactor);
        const layout = this.prepareLayout(displayPuzzle, options);
        const ordered = this.orderCellsForProgress(displayPuzzle, options.fillStyle ?? puzzle.fillStyle ?? 'left-to-right');
        const fromCount = this.mapProgressCount(previousCellCount, puzzle.cells.length, displayPuzzle.cells.length);
        const toCount = this.mapProgressCount(completedCellCount, puzzle.cells.length, displayPuzzle.cells.length);
        const baseFilled = new Set(ordered.slice(0, fromCount).map((cell) => this.cellKey(cell[0], cell[1])));
        const freshCells = ordered.slice(fromCount, toCount);

        const baseCanvas = createNode(this.node, 'BeadCanvasBase', 0, 0, options.width, options.height);
        const baseGraphics = baseCanvas.addComponent(Graphics);
        this.drawCellsByFilledSet(baseGraphics, displayPuzzle, baseFilled, options, layout);

        if (freshCells.length <= 0) {
            onComplete?.();
            return;
        }

        const fillCanvas = createNode(this.node, 'BeadCanvasFill', 0, 0, options.width, options.height);
        const fillGraphics = fillCanvas.addComponent(Graphics);
        let cursor = 0;
        const fillBatchSize = this.resolveFillBatchSize(freshCells.length);
        const tick = (): void => {
            const next = Math.min(freshCells.length, cursor + fillBatchSize);
            for (let index = cursor; index < next; index += 1) {
                const [x, y, colorId] = freshCells[index];
                const fill = displayPuzzle.palette[colorId] ?? LOCKED_FILL;
                const centerX = layout.originX + x * layout.cell;
                const centerY = layout.originY - y * layout.cell;
                this.drawPixel(fillGraphics, centerX, centerY, layout.cell * 0.96, fill, this.shiftColor(fill, -0.18), true);
                options.onFillStep?.(index + 1, freshCells.length);
            }
            cursor = next;
            if (cursor >= freshCells.length) {
                this.clearFillSchedule();
                onComplete?.();
            }
        };
        this.fillSchedule = tick;
        this.schedule(tick, FILL_INTERVAL_SEC);
        tick();
    }

    renderPlaceholder(width: number, height: number, locked = true): void {
        this.clearFillSchedule();
        this.node.removeAllChildren();
        const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        transform.setContentSize(width, height);
        const card = createNode(this.node, 'PlaceholderGrid', 0, 0, width, height);
        const graphics = card.addComponent(Graphics);
        const cols = 13;
        const rows = 15;
        const cell = Math.min(width / (cols + 1), height / (rows + 1));
        const originX = -cols * cell / 2 + cell / 2;
        const originY = rows * cell / 2 - cell / 2;
        for (let y = 0; y < rows; y += 1) {
            for (let x = 0; x < cols; x += 1) {
                this.drawPixel(graphics, originX + x * cell, originY - y * cell, cell * 0.76, LOCKED_FILL, LOCKED_STROKE, false);
            }
        }
        if (locked) {
            const lock = createNode(this.node, 'Lock', 0, 0, 104, 104);
            drawRect(lock, 92, 74, colorFromHex('#EEE8DD', 245), colorFromHex('#7A6A5D', 230), 5, 22);
            createLabel(lock, 'Icon', '🔒', 0, 4, 58, colorFromHex('#6D5B4E'), 104, 104);
        }
    }

    protected onDisable(): void {
        this.clearFillSchedule();
    }

    private prepareLayout(puzzle: BeadPuzzleData, options: BeadPuzzleRenderOptions): { cell: number; originX: number; originY: number } {
        const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        transform.setContentSize(options.width, options.height);
        const padding = options.compact ? 8 : 10;
        const cell = Math.max(4, Math.min((options.width - padding * 2) / puzzle.cols, (options.height - padding * 2) / puzzle.rows));
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

    private drawCellsByFilledSet(
        graphics: Graphics,
        puzzle: BeadPuzzleData,
        filled: Set<string>,
        options: BeadPuzzleRenderOptions,
        layout: { cell: number; originX: number; originY: number },
    ): void {
        puzzle.cells.forEach(([x, y, colorId]) => {
            const unlocked = filled.has(this.cellKey(x, y));
            if (!unlocked && options.showLocked === false) return;
            const base = puzzle.palette[colorId] ?? LOCKED_FILL;
            const stroke = unlocked ? this.shiftColor(base, -0.18) : this.shiftColor(base, -0.12);
            const centerX = layout.originX + x * layout.cell;
            const centerY = layout.originY - y * layout.cell;
            const pixelSize = layout.cell * (unlocked ? 0.9 : 0.9);
            this.drawPixel(graphics, centerX, centerY, pixelSize, base, stroke, unlocked);
        });
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

    private drawCells(
        graphics: Graphics,
        puzzle: BeadPuzzleData,
        visible: Set<number>,
        fresh: Set<number>,
        options: BeadPuzzleRenderOptions,
        layout: { cell: number; originX: number; originY: number },
    ): void {
        puzzle.cells.forEach(([x, y, colorId, groupId]) => {
            const unlocked = visible.has(groupId);
            if (!unlocked && options.showLocked === false) return;
            const base = puzzle.palette[colorId] ?? LOCKED_FILL;
            const stroke = unlocked ? this.shiftColor(base, -0.18) : this.shiftColor(base, -0.12);
            const centerX = layout.originX + x * layout.cell;
            const centerY = layout.originY - y * layout.cell;
            const pixelSize = layout.cell * (unlocked ? (fresh.has(groupId) ? 0.92 : 0.86) : 0.9);
            this.drawPixel(graphics, centerX, centerY, pixelSize, base, stroke, unlocked);
        });
    }

    private drawPixel(graphics: Graphics, x: number, y: number, size: number, fill: string, stroke: string, unlocked: boolean): void {
        if (!unlocked) {
            this.drawSocket(graphics, x, y, size);
            return;
        }

        const half = size / 2;
        const baseRadius = Math.max(1, size * 0.08);
        const buttonRadius = size * 0.37;
        const buttonFill = this.shiftColor(fill, 0.08);
        const buttonShadow = this.shiftColor(fill, -0.24);
        const buttonLight = this.shiftColor(fill, 0.38);

        graphics.fillColor = colorFromHex(fill, 238);
        graphics.strokeColor = colorFromHex(stroke, 190);
        graphics.lineWidth = Math.max(1, size * 0.035);
        graphics.roundRect(x - half, y - half, size, size, baseRadius);
        graphics.fill();
        graphics.stroke();

        graphics.fillColor = colorFromHex(buttonShadow, 132);
        graphics.circle(x + size * 0.04, y - size * 0.05, buttonRadius * 1.08);
        graphics.fill();

        graphics.fillColor = colorFromHex(buttonFill, 252);
        graphics.strokeColor = colorFromHex(buttonShadow, 190);
        graphics.lineWidth = Math.max(1, size * 0.055);
        graphics.circle(x, y, buttonRadius);
        graphics.fill();
        graphics.stroke();

        graphics.strokeColor = colorFromHex(buttonLight, 150);
        graphics.lineWidth = Math.max(1, size * 0.04);
        graphics.circle(x, y, buttonRadius * 0.72);
        graphics.stroke();

        graphics.strokeColor = colorFromHex(buttonShadow, 118);
        graphics.lineWidth = Math.max(1, size * 0.075);
        graphics.moveTo(x - buttonRadius * 0.28, y + buttonRadius * 0.22);
        graphics.lineTo(x + buttonRadius * 0.28, y - buttonRadius * 0.22);
        graphics.moveTo(x + buttonRadius * 0.28, y + buttonRadius * 0.22);
        graphics.lineTo(x - buttonRadius * 0.28, y - buttonRadius * 0.22);
        graphics.stroke();

        graphics.fillColor = new Color(255, 255, 255, 48);
        graphics.circle(x - buttonRadius * 0.25, y + buttonRadius * 0.26, Math.max(1, buttonRadius * 0.2));
        graphics.fill();
    }

    private drawSocket(graphics: Graphics, x: number, y: number, size: number): void {
        const half = size / 2;
        const radius = Math.max(1, size * 0.16);
        const innerRadius = size * 0.31;

        graphics.fillColor = colorFromHex(LOCKED_FILL, 230);
        graphics.strokeColor = colorFromHex(LOCKED_STROKE, 205);
        graphics.lineWidth = Math.max(1, size * 0.075);
        graphics.roundRect(x - half, y - half, size, size, radius);
        graphics.fill();
        graphics.stroke();

        graphics.fillColor = colorFromHex(LOCKED_INNER_FILL, 232);
        graphics.strokeColor = colorFromHex(LOCKED_INNER_STROKE, 178);
        graphics.lineWidth = Math.max(1, size * 0.052);
        graphics.circle(x, y + size * 0.02, innerRadius);
        graphics.fill();
        graphics.stroke();

        graphics.fillColor = new Color(255, 255, 255, 82);
        graphics.circle(x - innerRadius * 0.28, y + innerRadius * 0.32, Math.max(1, innerRadius * 0.24));
        graphics.fill();
    }

    private resolveFillBatchSize(cellCount: number): number {
        const targetTicks = Math.max(1, Math.floor(FILL_TARGET_DURATION_SEC / FILL_INTERVAL_SEC));
        const maxTicks = Math.max(1, Math.floor(FILL_MAX_DURATION_SEC / FILL_INTERVAL_SEC));
        return Math.max(1, Math.ceil(cellCount / Math.min(targetTicks, maxTicks)));
    }

    private orderGroupsForFill(puzzle: BeadPuzzleData, groupIds: number[], finalVisible: Set<number>): number[] {
        return [...groupIds]
            .filter((groupId) => finalVisible.has(groupId))
            .sort((a, b) => {
                const countA = puzzle.cells.filter((cell) => cell[3] === a).length;
                const countB = puzzle.cells.filter((cell) => cell[3] === b).length;
                if (countA !== countB) return countA - countB;
                return a - b;
            });
    }

    private orderCellsForBeadFill(
        cells: BeadCell[],
        _puzzle: BeadPuzzleData,
        layout: { cell: number; originX: number; originY: number },
        fillStartX?: number,
        fillStartY?: number,
    ): BeadCell[] {
        if (cells.length <= 1) return [...cells];

        const byKey = new Map<string, BeadCell>();
        cells.forEach((cell) => byKey.set(this.cellKey(cell[0], cell[1]), cell));

        const start = this.pickStartCell(cells, layout, fillStartX, fillStartY);
        const ordered: BeadCell[] = [];
        const visited = new Set<string>();
        const frontier = new Set<string>();

        const visit = (cell: BeadCell): void => {
            const key = this.cellKey(cell[0], cell[1]);
            if (visited.has(key)) return;
            visited.add(key);
            frontier.delete(key);
            ordered.push(cell);
            this.neighborKeys(cell[0], cell[1]).forEach((nextKey) => {
                if (byKey.has(nextKey) && !visited.has(nextKey)) frontier.add(nextKey);
            });
        };

        visit(start);
        while (ordered.length < cells.length) {
            const last = ordered[ordered.length - 1];
            const candidates = [...frontier]
                .map((key) => byKey.get(key))
                .filter((cell): cell is BeadCell => !!cell);
            const next = candidates.length > 0
                ? this.pickNextFrontierCell(candidates, last)
                : this.pickNearestUnvisitedCell(cells, visited, last);
            if (!next) break;
            visit(next);
        }
        return ordered;
    }

    private pickStartCell(
        cells: BeadCell[],
        layout: { cell: number; originX: number; originY: number },
        fillStartX?: number,
        fillStartY?: number,
    ): BeadCell {
        if (typeof fillStartX !== 'number' || typeof fillStartY !== 'number') {
            return [...cells].sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]))[0];
        }
        return [...cells].sort((a, b) => {
            const ax = layout.originX + a[0] * layout.cell;
            const ay = layout.originY - a[1] * layout.cell;
            const bx = layout.originX + b[0] * layout.cell;
            const by = layout.originY - b[1] * layout.cell;
            const aDistance = (ax - fillStartX) ** 2 + (ay - fillStartY) ** 2;
            const bDistance = (bx - fillStartX) ** 2 + (by - fillStartY) ** 2;
            if (aDistance !== bDistance) return aDistance - bDistance;
            return (a[1] - b[1]) || (a[0] - b[0]);
        })[0];
    }

    private pickNextFrontierCell(candidates: BeadCell[], last: BeadCell): BeadCell {
        return candidates.sort((a, b) => {
            const aAdjacent = this.isAdjacent(a, last) ? 0 : 1;
            const bAdjacent = this.isAdjacent(b, last) ? 0 : 1;
            if (aAdjacent !== bAdjacent) return aAdjacent - bAdjacent;
            const aDistance = this.manhattan(a, last);
            const bDistance = this.manhattan(b, last);
            if (aDistance !== bDistance) return aDistance - bDistance;
            return (a[1] - b[1]) || (a[0] - b[0]);
        })[0];
    }

    private pickNearestUnvisitedCell(cells: BeadCell[], visited: Set<string>, last: BeadCell): BeadCell | null {
        return [...cells]
            .filter((cell) => !visited.has(this.cellKey(cell[0], cell[1])))
            .sort((a, b) => {
                const aDistance = this.manhattan(a, last);
                const bDistance = this.manhattan(b, last);
                if (aDistance !== bDistance) return aDistance - bDistance;
                return (a[1] - b[1]) || (a[0] - b[0]);
            })[0] ?? null;
    }

    private neighborKeys(x: number, y: number): string[] {
        return [
            this.cellKey(x + 1, y),
            this.cellKey(x, y + 1),
            this.cellKey(x - 1, y),
            this.cellKey(x, y - 1),
        ];
    }

    private isAdjacent(a: BeadCell, b: BeadCell): boolean {
        return this.manhattan(a, b) === 1;
    }

    private manhattan(a: BeadCell, b: BeadCell): number {
        return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    }

    private cellKey(x: number, y: number): string {
        return `${x}:${y}`;
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

    private clearFillSchedule(): void {
        if (!this.fillSchedule) return;
        this.unschedule(this.fillSchedule);
        this.fillSchedule = null;
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
}
