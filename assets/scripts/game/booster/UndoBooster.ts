import { BoosterUseResult } from '../../core/Types';

export class UndoBooster {
    use(): BoosterUseResult {
        return { success: false, type: 'undo', message: 'UndoBooster not implemented' };
    }
}
