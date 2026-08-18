import { _decorator, BlockInputEvents, Button, Component, EventTouch, Label, Node, Sprite, UITransform, Vec3 } from 'cc';
import { ScreenAdapter } from '../common/ScreenAdapter';
import { bindPressScale, colorFromHex, createLabel, createNode, drawRect, loadSpriteFrameFromResources } from '../common/UiFactory';
import { BeadRewardModal } from '../../meta/beads/BeadRewardModal';
import { BeadRewardContext } from '../../meta/beads/BeadPuzzleTypes';

const { ccclass } = _decorator;

export interface ResultWinData {
    levelId?: number;
    nextLevelId?: number;
    chestProgress?: number;
    chestTarget?: number;
    title?: string;
    message?: string;
    backgroundPath?: string;
    beadReward?: BeadRewardContext | null;
}

export interface ResultHandlers {
    onNext: () => void;
    onRetry: () => void;
    onHome: () => void;
    /** 复活: 不重启关卡, 只清空槽位继续游戏 */
    onRevive?: () => void;
    /** 胜利页展示数据: 第一版允许使用默认值 */
    winData?: ResultWinData;
}

const SUCCESS_POPUP = { width: 871, height: 1438 };
const FAIL_POPUP = { width: 876, height: 1446 };
const RESULT_OVERLAY_ALPHA = 220;
// 注：popup_success.png 改版后只画了一个"GO"按钮，位置对应下方坐标。
const SUCCESS_NEXT_BUTTON = { x: 2, y: -566, width: 650, height: 156 };
const FAIL_REVIVE_BUTTON = { x: 1, y: -392, width: 650, height: 156 };
const FAIL_RESTART_BUTTON = { x: 0, y: -562, width: 650, height: 156 };
const SUCCESS_BEAN_REWARD = { x: 0, y: -260, width: 650, height: 170 };
const SUCCESS_BEAN_COUNT_TEXT = { x: 118, y: -258, width: 260, height: 86 };

@ccclass('ResultView')
export class ResultView extends Component {
    private reviveInProgress = false;

    show(win: boolean, handlers: ResultHandlers): void {
        this.reviveInProgress = false;
        this.node.active = true;
        ScreenAdapter.applyFullscreen(this.node);
        this.node.setScale(new Vec3(1, 1, 1));
        this.hideBeadReward();

        if (this.hasAuthoredLayout()) {
            this.showAuthored(win, handlers);
            return;
        }

        this.node.removeAllChildren();
        this.renderFallback(win, handlers);
    }

    hide(): void {
        this.reviveInProgress = false;
        this.node.active = false;
        this.node.getChildByName('BeadReward')?.getComponent(BeadRewardModal)?.hide();
        if (this.hasAuthoredLayout()) {
            this.setAuthoredVisible(false, false);
            return;
        }
        this.node.removeAllChildren();
    }

    private hasAuthoredLayout(): boolean {
        return !!this.node.getChildByName('SuccessPopup') && !!this.node.getChildByName('FailPopup');
    }

    private hideBeadReward(): void {
        const beadReward = this.node.getChildByName('BeadReward');
        if (!beadReward) return;
        beadReward.getComponent(BeadRewardModal)?.hide();
        beadReward.active = false;
    }

    private showAuthored(win: boolean, handlers: ResultHandlers): void {
        this.ensureOverlay(true);
        this.setAuthoredVisible(win, !win);
        if (win) {
            const popup = this.node.getChildByName('SuccessPopup');
            // popup_success.png 改版后只有一个可见的 "GO" 按钮，位置在 SUCCESS_NEXT_BUTTON 处。
            const nextButton = popup
                ? (popup.getChildByName('SuccessNextButton') ?? this.createHotspot(popup, 'SuccessNextButton', SUCCESS_NEXT_BUTTON))
                : null;
            if (popup) this.syncSuccessBeanReward(popup, handlers.winData?.beadReward?.rewardBeanCount ?? 0);
            this.bindSceneButton(nextButton, () => this.handleNext(handlers), 0.94);
            return;
        }
        const failPopup = this.node.getChildByName('FailPopup');
        this.bindReviveButton(failPopup?.getChildByName('FailReviveButton') ?? null, handlers);
        this.bindSceneButton(failPopup?.getChildByName('FailRestartButton') ?? null, handlers.onRetry, 0.94);
    }

    private setAuthoredVisible(success: boolean, fail: boolean): void {
        const overlay = this.node.getChildByName('ResultOverlay');
        const successPopup = this.node.getChildByName('SuccessPopup');
        const failPopup = this.node.getChildByName('FailPopup');
        if (overlay) {
            overlay.active = success || fail;
            overlay.setSiblingIndex(0);
        }
        if (successPopup) {
            successPopup.active = success;
            if (success) successPopup.setSiblingIndex(this.node.children.length - 1);
        }
        if (failPopup) {
            failPopup.active = fail;
            if (fail) failPopup.setSiblingIndex(this.node.children.length - 1);
        }
    }

    private ensureOverlay(active: boolean): Node {
        const size = ScreenAdapter.fullSize();
        const overlay = this.node.getChildByName('ResultOverlay') ?? createNode(this.node, 'ResultOverlay', 0, 0, size.width, size.height);
        const transform = overlay.getComponent(UITransform) ?? overlay.addComponent(UITransform);
        transform.setContentSize(size.width, size.height);
        overlay.setSiblingIndex(0);
        overlay.active = active;
        overlay.getComponent(BlockInputEvents) ?? overlay.addComponent(BlockInputEvents);
        drawRect(overlay, size.width, size.height, colorFromHex('#000000', RESULT_OVERLAY_ALPHA), undefined, 0, 0);
        return overlay;
    }

    private renderFallback(win: boolean, handlers: ResultHandlers): void {
        this.ensureOverlay(true);

        const popupSize = win ? SUCCESS_POPUP : FAIL_POPUP;
        const popup = createNode(this.node, win ? 'SuccessPopup' : 'FailPopup', 0, 0, popupSize.width, popupSize.height);
        popup.setSiblingIndex(this.node.children.length - 1);
        const sprite = popup.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources(win ? 'newtheme/popup_success' : 'newtheme/popup_fail', (frame) => {
            if (frame && sprite.isValid) sprite.spriteFrame = frame;
        });

        if (win) {
            // popup_success.png 只有一个可见的 "GO" 按钮，不再创建 Home 热区
            const next = this.createHotspot(popup, 'SuccessNextButton', SUCCESS_NEXT_BUTTON);
            this.syncSuccessBeanReward(popup, handlers.winData?.beadReward?.rewardBeanCount ?? 0);
            this.bindSceneButton(next, () => this.handleNext(handlers), 0.94);
            return;
        }
        const revive = this.createHotspot(popup, 'FailReviveButton', FAIL_REVIVE_BUTTON);
        const restart = this.createHotspot(popup, 'FailRestartButton', FAIL_RESTART_BUTTON);
        this.bindReviveButton(revive, handlers);
        this.bindSceneButton(restart, handlers.onRetry, 0.94);
    }

    private createHotspot(parent: Node, name: string, cfg: { x: number; y: number; width: number; height: number }): Node {
        return createNode(parent, name, cfg.x, cfg.y, cfg.width, cfg.height);
    }

    private syncSuccessBeanReward(parent: Node, beanCount: number): void {
        let rewardNode = parent.getChildByName('SuccessBeanReward');
        if (!rewardNode) {
            rewardNode = createNode(parent, 'SuccessBeanReward', SUCCESS_BEAN_REWARD.x, SUCCESS_BEAN_REWARD.y, SUCCESS_BEAN_REWARD.width, SUCCESS_BEAN_REWARD.height);
        }
        rewardNode.active = true;
        const transform = rewardNode.getComponent(UITransform) ?? rewardNode.addComponent(UITransform);
        if (transform.contentSize.width <= 0 || transform.contentSize.height <= 0) {
            transform.setContentSize(SUCCESS_BEAN_REWARD.width, SUCCESS_BEAN_REWARD.height);
        }

        let labelNode = rewardNode.getChildByName('BeanCountText');
        let label: Label | null = null;
        if (!labelNode) {
            label = createLabel(rewardNode, 'BeanCountText', '', SUCCESS_BEAN_COUNT_TEXT.x, SUCCESS_BEAN_COUNT_TEXT.y, 42, colorFromHex('#6A4028'), SUCCESS_BEAN_COUNT_TEXT.width, SUCCESS_BEAN_COUNT_TEXT.height);
            labelNode = label.node;
        } else {
            label = labelNode.getComponent(Label) ?? labelNode.addComponent(Label);
        }
        labelNode.active = true;
        labelNode.setSiblingIndex(rewardNode.children.length - 1);
        label.string = `+${Math.max(0, beanCount)}`;
    }

    private handleNext(handlers: ResultHandlers): void {
        console.log('[ResultView] handleNext called, beadReward:', !!handlers.winData?.beadReward);
        if (handlers.winData?.beadReward) {
            this.showBeadReward(handlers);
            return;
        }
        handlers.onNext();
    }

    private showBeadReward(handlers: ResultHandlers): void {
        const reward = handlers.winData?.beadReward;
        if (!reward) {
            console.warn('[ResultView] showBeadReward: no reward');
            return;
        }
        console.log('[ResultView] showBeadReward: creating modal');
        this.setAuthoredVisible(false, false);
        let node = this.node.getChildByName('BeadReward');
        if (!node) {
            node = ScreenAdapter.createFullscreenNode(this.node, 'BeadReward');
        } else {
            ScreenAdapter.applyFullscreen(node);
        }
        node.active = true;
        node.setSiblingIndex(this.node.children.length - 1);
        console.log('[ResultView] BeadReward node ready, siblingIndex:', node.getSiblingIndex(), 'parent:', node.parent?.name, 'parent children:', node.parent?.children.length);
        const modal = node.getComponent(BeadRewardModal) ?? node.addComponent(BeadRewardModal);
        modal.show({
            mode: 'reward',
            subchapter: reward.subchapter,
            puzzle: reward.puzzle,
            visibleGroupIds: reward.visibleGroupIds,
            newGroupIds: reward.newGroupIds,
            previousCellCount: reward.previousCellCount,
            completedCellCount: reward.completedCellCount,
            rewardBeanCount: reward.rewardBeanCount,
            fillStyle: reward.fillStyle,
            levelId: reward.levelId,
            isSubchapterComplete: reward.isSubchapterComplete,
            buttonText: reward.buttonText,
            onAction: handlers.onNext,
        });
    }

    private bindFailPopupFallback(node: Node | null, handlers: ResultHandlers): void {
        if (!node) return;
        node.off(Node.EventType.TOUCH_END);
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            const transform = node.getComponent(UITransform);
            if (!transform) return;
            const loc = event.getUILocation();
            const local = transform.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
            if (local.y < -540 || local.y > -260) return;
            event.propagationStopped = true;
            if (local.x < 0) this.runRevive(node.getChildByName('FailReviveButton'), handlers);
            else handlers.onRetry();
        });
    }

    private runRevive(node: Node | null, handlers: ResultHandlers): void {
        if (this.reviveInProgress) return;
        const button = node?.getComponent(Button);
        if (button && !button.interactable) return;
        this.reviveInProgress = true;
        if (button) button.interactable = false;
        let earnedReward = false;
        import('../../core/AdManager').then(({ Ad }) => {
            Ad.showRewarded({
                onReward: () => { earnedReward = true; },
                onClose: () => {
                    if (earnedReward) {
                        (handlers.onRevive ?? handlers.onRetry)();
                        return;
                    }
                    this.reviveInProgress = false;
                    if (button?.isValid) button.interactable = true;
                },
                onError: () => {
                    this.reviveInProgress = false;
                    if (button?.isValid) button.interactable = true;
                },
            });
        }).catch(() => {
            this.reviveInProgress = false;
            if (button?.isValid) button.interactable = true;
        });
    }

    private bindReviveButton(node: Node | null, handlers: ResultHandlers): void {
        if (!node) return;
        this.bindSceneButton(node, () => this.runRevive(node, handlers), 0.94);
    }

    private bindSceneButton(node: Node | null, onClick: () => void, pressedScale: number): void {
        if (!node) return;
        let transform = node.getComponent(UITransform);
        if (!transform) transform = node.addComponent(UITransform);
        if (transform.contentSize.width <= 0 || transform.contentSize.height <= 0) {
            transform.setContentSize(180, 120);
        }
        let button = node.getComponent(Button);
        if (!button) button = node.addComponent(Button);
        button.interactable = true;
        node.off(Node.EventType.TOUCH_START);
        node.off(Node.EventType.TOUCH_CANCEL);
        node.off(Node.EventType.TOUCH_END);
        bindPressScale(node, pressedScale);
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true;
            onClick();
        });
    }
}
