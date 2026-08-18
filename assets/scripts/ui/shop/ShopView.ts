import { _decorator, Button, Component, Node, Sprite, UIOpacity, tween, UITransform } from 'cc';
import { ScreenAdapter } from '../common/ScreenAdapter';
import { loadSpriteFrameFromResources } from '../common/UiFactory';
import { Haptic } from '../../core/HapticManager';

const { ccclass } = _decorator;

export interface ShopViewHandlers {
    onClose: () => void;
}

@ccclass('ShopView')
export class ShopView extends Component {
    private handlers: ShopViewHandlers | null = null;

    show(handlers: ShopViewHandlers): void {
        this.handlers = handlers;
        this.node.active = true;
        this.node.removeAllChildren();
        ScreenAdapter.applyFullscreen(this.node);

        this.buildFullscreenImage();

        const opacity = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(opacity).to(0.16, { opacity: 255 }).start();
    }

    hide(): void {
        this.node.active = false;
        this.node.removeAllChildren();
    }

    private buildFullscreenImage(): void {
        const { width, height } = ScreenAdapter.fullSize();

        const imgNode = new Node('ShopImage');
        this.node.addChild(imgNode);

        const transform = imgNode.addComponent(UITransform);
        transform.setContentSize(width, height);
        transform.setAnchorPoint(0.5, 0.5);
        imgNode.setPosition(0, 0, 0);

        const sprite = imgNode.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources('art/ui/shop', (frame) => {
            if (frame) sprite.spriteFrame = frame;
        });

        const btn = imgNode.addComponent(Button);
        btn.target = imgNode;
        imgNode.on(Node.EventType.TOUCH_END, () => {
            Haptic.tick();
            this.handlers?.onClose();
        });
    }
}
