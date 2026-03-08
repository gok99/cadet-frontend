import { Config } from '../../CseMachineConfig';
import { StepsArray } from '../../CseMachineTypes';
import { Frame } from '../Frame';
import { ContValue } from '../values/ContValue';
import { FnValue } from '../values/FnValue';
import { GlobalFnValue } from '../values/GlobalFnValue';
import { GenericArrow } from './GenericArrow';

/** this class encapsulates an GenericArrow to be drawn between 2 points */
export class ArrowFromFn extends GenericArrow<FnValue | GlobalFnValue | ContValue, Frame> {
  //Removed the constructor as it is identical to the parent class as now 'faded' property is removed
  constructor(from: FnValue | GlobalFnValue | ContValue) {
    super(from);
    if (from instanceof GlobalFnValue)
      this.isLive = true; // Global functions are always live
    else this.isLive = from.isLive();
  }

  protected updateIsLive(): void {
    if (this.source instanceof GlobalFnValue) {
      this.isLive = true;
    } else {
      this.isLive = this.source.isLive();
    }
  }
  protected calculateSteps() {
    const from = this.source;
    const to = this.target;
    if (!to) return [];

    if (from instanceof ContValue) {
      // Draw arrow from cont circle center to the nearest point on the frame edge
      const cx = from.centerX;
      const cy = from.y();
      const frameLeft = to.x();
      const frameRight = to.x() + to.width();
      const frameTop = to.y();
      const frameBottom = to.y() + to.height();
      // Clamp target to frame boundary
      const clampedX = Math.max(frameLeft, Math.min(cx, frameRight));
      // Determine which edge: top, bottom, left, or right
      let tx: number, ty: number;
      if (cy <= frameTop) {
        // Cont is above frame — target top edge
        tx = clampedX;
        ty = frameTop;
      } else if (cy >= frameBottom) {
        // Cont is below frame — target bottom edge
        tx = clampedX;
        ty = frameBottom;
      } else if (cx < frameLeft) {
        // Cont is to the left — target left edge
        tx = frameLeft;
        ty = cy;
      } else {
        // Cont is to the right or inside — target right edge
        tx = frameRight;
        ty = cy;
      }
      const steps: StepsArray = [
        (_x, _y) => [cx, cy],
        (_x, _y) => [tx, ty]
      ];
      return steps;
    }

    const steps: StepsArray = [
      (x, y) => [x + Config.FnRadius * 3, y],
      (x, y) => [x, y - Config.FnRadius * 2],
      (x, y) => [to.x() + (from.x() < to.x() ? 0 : to.width()), y]
    ];

    return steps;
  }
}
