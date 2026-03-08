import Konva from 'konva';
import { Easings } from 'konva/lib/Tween';
import React from 'react';
import { Circle, Group, Rect } from 'react-konva';

import { ContValue } from '../components/values/ContValue';
import { Config } from '../CseMachineConfig';
import { defaultStrokeColor } from '../CseMachineUtils';
import { Animatable } from './base/Animatable';
import { AnimationComponent } from './base/AnimationComponents';

/**
 * Animation for a ContValue sliding from its old stash position to its new
 * frame-bound position. Creates animated shape copies in the animation layer
 * and moves them from the old position to the new position.
 */
export class ContValueMoveAnimation extends Animatable {
  private shapes: AnimationComponent<any, any>[];
  private dx: number;
  private dy: number;

  constructor(
    private contValue: ContValue,
    fromPosition: { x: number; y: number; centerX: number }
  ) {
    super();
    const r = Config.FnRadius;
    const ir = Config.FnInnerRadius;
    const stroke = defaultStrokeColor();

    // Offset from old to new position
    this.dx = contValue.centerX - fromPosition.centerX;
    this.dy = contValue.y() - fromPosition.y;

    // Old position values
    const cx = fromPosition.centerX;
    const cy = fromPosition.y;

    // Create animated shapes at the old position
    this.shapes = [
      // Left rect (cross bar)
      new AnimationComponent<Konva.Rect, Konva.RectConfig>(Rect, {
        x: cx - 1.5 * r,
        y: cy - r,
        width: r / 2,
        height: r * 2,
        stroke,
        listening: false
      }),
      // Top rect (cross bar)
      new AnimationComponent<Konva.Rect, Konva.RectConfig>(Rect, {
        x: cx - r,
        y: cy - 1.5 * r,
        width: r * 2,
        height: r / 2,
        stroke,
        listening: false
      }),
      // Outer circle
      new AnimationComponent<Konva.Circle, Konva.CircleConfig>(Circle, {
        x: cx,
        y: cy,
        radius: r,
        stroke,
        listening: false
      }),
      // Inner circle (filled)
      new AnimationComponent<Konva.Circle, Konva.CircleConfig>(Circle, {
        x: cx,
        y: cy,
        radius: ir,
        fill: stroke,
        listening: false
      })
    ];
  }

  draw(): React.ReactNode {
    return (
      <Group key={Animatable.key--} ref={this.ref}>
        {this.shapes.map(s => s.draw())}
      </Group>
    );
  }

  async animate() {
    // Hide the real cont and its arrow during the slide
    this.contValue.ref.current?.hide();
    this.contValue.arrow()?.ref.current?.hide();

    // Animate all shapes from old position to new position
    await Promise.all(
      this.shapes.map(s =>
        s.animateTo(
          { x: s.x() + this.dx, y: s.y() + this.dy },
          { duration: 2.0, easing: Easings.StrongEaseOut }
        )
      )
    );

    if (this.cancelled) return;
    // Don't destroy yet — keep animated shapes at final position so they
    // remain visible until the FunctionApplicationAnimation also finishes
    // and shows the frame (which reveals the real cont).  The shapes
    // overlap harmlessly with the real cont once it appears.
    this.contValue.ref.current?.show();
    this.contValue.arrow()?.ref.current?.show();
  }

  destroy() {
    this.contValue.ref.current?.show();
    this.contValue.arrow()?.ref.current?.show();
    this.shapes.forEach(s => s.destroy());
    this.ref.current?.hide();
  }
}
