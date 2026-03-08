import { Easings } from 'konva/lib/Tween';
import React from 'react';
import { Group } from 'react-konva';

import { ControlItemComponent } from '../components/ControlItemComponent';
import { StashItemComponent } from '../components/StashItemComponent';
import { defaultActiveColor, defaultDangerColor, defaultStrokeColor } from '../CseMachineUtils';
import { Animatable } from './base/Animatable';
import { AnimatedTextbox } from './base/AnimatedTextbox';
import { getNodePosition } from './base/AnimationUtils';

/**
 * Animation for handler control marker being popped from the control stack.
 * Both the control marker and the matching stash marker fade out together.
 */
export class HandlerMarkerPopAnimation extends Animatable {
  private controlMarkerAnimation: AnimatedTextbox;
  private stashMarkerAnimation?: AnimatedTextbox;

  constructor(
    controlMarkerItem: ControlItemComponent,
    stashMarkerItem?: StashItemComponent
  ) {
    super();
    const controlPos = getNodePosition(controlMarkerItem);
    this.controlMarkerAnimation = new AnimatedTextbox(
      controlMarkerItem.text,
      {
        ...controlPos,
        x: controlPos.x + controlPos.width / 2,
        offsetX: controlPos.width / 2,
        y: controlPos.y + controlPos.height / 2,
        offsetY: controlPos.height / 2
      },
      { rectProps: { stroke: defaultActiveColor() } }
    );

    if (stashMarkerItem) {
      const stashPos = getNodePosition(stashMarkerItem);
      this.stashMarkerAnimation = new AnimatedTextbox(
        stashMarkerItem.text,
        {
          ...stashPos,
          x: stashPos.x + stashPos.width / 2,
          offsetX: stashPos.width / 2,
          y: stashPos.y + stashPos.height / 2,
          offsetY: stashPos.height / 2
        },
        { rectProps: { stroke: defaultDangerColor() } }
      );
    }
  }

  draw(): React.ReactNode {
    return (
      <Group key={Animatable.key--} ref={this.ref}>
        {this.controlMarkerAnimation.draw()}
        {this.stashMarkerAnimation?.draw()}
      </Group>
    );
  }

  async animate() {
    // Highlight both markers, then shrink and fade out together (like pop)
    await Promise.all([
      this.controlMarkerAnimation.animateRectTo({ stroke: defaultStrokeColor() }, { duration: 0.8 }),
      this.stashMarkerAnimation?.animateRectTo({ stroke: defaultStrokeColor() }, { duration: 0.8 }),
      this.controlMarkerAnimation.animateTo({ scaleX: 0.6, scaleY: 0.6 }, { delay: 0.3 }),
      this.stashMarkerAnimation?.animateTo({ scaleX: 0.6, scaleY: 0.6 }, { delay: 0.3 })
    ]);
    if (this.cancelled) return;
    await Promise.all([
      this.controlMarkerAnimation.animateTo(
        { scaleX: 1.1, scaleY: 1.1, opacity: 0 },
        { duration: 0.5, easing: Easings.StrongEaseOut }
      ),
      this.stashMarkerAnimation?.animateTo(
        { scaleX: 1.1, scaleY: 1.1, opacity: 0 },
        { duration: 0.5, easing: Easings.StrongEaseOut }
      )
    ]);
    if (this.cancelled) return;
    this.destroy();
  }

  destroy() {
    this.ref.current?.hide();
    this.controlMarkerAnimation.destroy();
    this.stashMarkerAnimation?.destroy();
  }
}
