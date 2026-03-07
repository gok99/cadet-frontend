import { Easings } from 'konva/lib/Tween';
import React from 'react';
import { Group } from 'react-konva';

import { ControlItemComponent } from '../components/ControlItemComponent';
import { StashItemComponent } from '../components/StashItemComponent';
import { Visible } from '../components/Visible';
import { Layout } from '../CseMachineLayout';
import {
  defaultActiveColor,
  defaultDangerColor
} from '../CseMachineUtils';
import { Animatable, AnimationConfig } from './base/Animatable';
import { AnimatedGenericArrow } from './base/AnimatedGenericArrow';
import { AnimatedTextbox } from './base/AnimatedTextbox';
import { getNodeLocation, getNodePosition } from './base/AnimationUtils';

/**
 * Animation for delimited continuation application — the reverse of PerformAnimation.
 * Items fly OUT of the continuation circle and expand into the control/stash stacks.
 */
export class ContinuationApplicationAnimation extends Animatable {
  private appInstrAnimation: AnimatedTextbox;
  private contStashAnimation: AnimatedTextbox;
  private contStashArrowAnimation?: AnimatedGenericArrow<StashItemComponent, Visible>;
  private argStashAnimation?: AnimatedTextbox;
  /** New control items that were restored from the continuation */
  private newControlItemAnimations: AnimatedTextbox[];
  /** New stash items that were restored from the continuation (excluding the arg value) */
  private restoredStashItems: StashItemComponent[];
  private newStashItemAnimations: AnimatedTextbox[];
  private newStashArrowAnimations: AnimatedGenericArrow<StashItemComponent, Visible>[];
  /** The arg value stash item (stays in place, just fades in) */
  private argValueAnimation?: AnimatedTextbox;
  private argValueArrowAnimation?: AnimatedGenericArrow<StashItemComponent, Visible>;
  private contSource: { x: number; y: number };
  private contValueVisible?: Visible;

  constructor(
    appInstrItem: ControlItemComponent,
    /** The continuation stash item (from previous layout) */
    contStashItem: StashItemComponent,
    /** The argument stash item (from previous layout) */
    argStashItem: StashItemComponent | undefined,
    /** New control items after continuation application */
    private newControlItems: ControlItemComponent[],
    /** New stash items after continuation application */
    newStashItems: StashItemComponent[]
  ) {
    super();

    this.appInstrAnimation = new AnimatedTextbox(
      appInstrItem.text,
      getNodePosition(appInstrItem),
      { rectProps: { stroke: defaultActiveColor() } }
    );

    this.contStashAnimation = new AnimatedTextbox(
      contStashItem.text,
      getNodePosition(contStashItem),
      { rectProps: { stroke: defaultDangerColor() } }
    );

    if (contStashItem.arrow) {
      this.contStashArrowAnimation = new AnimatedGenericArrow(contStashItem.arrow);
    }

    if (argStashItem) {
      this.argStashAnimation = new AnimatedTextbox(
        argStashItem.text,
        getNodePosition(argStashItem),
        { rectProps: { stroke: defaultDangerColor() } }
      );
    }

    // Find the ContValue circle that the continuation arrow points to
    const contValueTarget = contStashItem.arrow?.target;
    this.contValueVisible = contValueTarget;
    this.contSource = contValueTarget
      ? getNodeLocation(contValueTarget)
      : getNodeLocation(contStashItem);

    // The arg value is the last new stash item (the value passed to the continuation)
    const argValueItem = newStashItems.at(-1);
    this.restoredStashItems = newStashItems.slice(0, -1);

    if (argValueItem) {
      this.argValueAnimation = new AnimatedTextbox(argValueItem.text, {
        ...getNodePosition(argValueItem),
        opacity: 0
      });
      if (argValueItem.arrow) {
        this.argValueArrowAnimation = new AnimatedGenericArrow(argValueItem.arrow, { opacity: 0 });
      }
    }

    // New control items start at the cont circle position, size 0, invisible
    this.newControlItemAnimations = newControlItems.map(
      item =>
        new AnimatedTextbox(item.text, {
          x: this.contSource.x,
          y: this.contSource.y,
          width: 0,
          height: 0,
          opacity: 0
        })
    );

    // New stash items (restored from continuation) start at the cont circle position
    this.newStashItemAnimations = this.restoredStashItems.map(
      item =>
        new AnimatedTextbox(item.text, {
          x: this.contSource.x,
          y: this.contSource.y,
          width: 0,
          height: 0,
          opacity: 0
        })
    );

    this.newStashArrowAnimations = this.restoredStashItems.flatMap(item =>
      item.arrow ? [new AnimatedGenericArrow(item.arrow, { opacity: 0 })] : []
    );
  }

  draw(): React.ReactNode {
    return (
      <Group key={Animatable.key--} ref={this.ref}>
        {this.appInstrAnimation.draw()}
        {this.contStashAnimation.draw()}
        {this.contStashArrowAnimation?.draw()}
        {this.argStashAnimation?.draw()}
        {this.newControlItemAnimations.map(a => a.draw())}
        {this.newStashItemAnimations.map(a => a.draw())}
        {this.newStashArrowAnimations.map(a => a.draw())}
        {this.argValueAnimation?.draw()}
        {this.argValueArrowAnimation?.draw()}
      </Group>
    );
  }

  async animate() {
    const easeOut: AnimationConfig['easing'] = Easings.StrongEaseOut;

    // Hide all current control and stash items
    Layout.controlComponent.stackItemComponents.forEach(item => item.ref.current?.hide());
    Layout.stashComponent.stashItemComponents.forEach(item => {
      item.ref.current?.hide();
      item.arrow?.ref.current?.hide();
    });
    Layout.stashValues.forEach(v => v.ref.current?.hide());

    // Phase 1: Fade out app instruction and arg stash item, highlight cont
    await Promise.all([
      this.appInstrAnimation.animateTo({ opacity: 0 }, { duration: 0.8 }),
      this.argStashAnimation?.animateTo({ opacity: 0 }, { duration: 0.8 }),
      this.contStashAnimation.animateRectTo(
        { stroke: defaultDangerColor() },
        { duration: 0.8 }
      )
    ]);
    if (this.cancelled) return;

    await this.delay(200);
    if (this.cancelled) return;

    // Phase 2: Fade out cont stash item + arrow, then items fly out of the circle
    const expandDuration = 3.0;
    const totalStagger = 0.6;
    const allExpanding = [...this.newControlItemAnimations, ...this.newStashItemAnimations];
    const staggerStep = allExpanding.length > 1 ? totalStagger / (allExpanding.length - 1) : 0;

    // Fade out the cont stash label and arrow as items start flying out
    const contFadePromises = [
      this.contStashAnimation.animateTo({ opacity: 0 }, { duration: 1.0 }),
      this.contStashArrowAnimation?.animateTo({ opacity: 0 }, { duration: 1.0 })
    ];

    // Hide the cont value circle partway through
    const contValueHidePromise = this.delay(800).then(() => {
      if (!this.cancelled) this.contValueVisible?.ref.current?.hide();
    });

    // Items fly out from the circle to their final positions
    const expandPromises = allExpanding.flatMap((a, i) => {
      const delay = i * staggerStep;
      const isControlItem = i < this.newControlItemAnimations.length;
      const itemIndex = isControlItem ? i : i - this.newControlItemAnimations.length;
      const targetItem = isControlItem
        ? this.newControlItems[itemIndex]
        : this.restoredStashItems[itemIndex];

      if (!targetItem) return [];

      return [
        // First 10%: fade in quickly so items appear early
        a.animateTo(
          { opacity: 1 },
          { duration: expandDuration * 0.1, delay }
        ),
        // Move + expand from circle to final position
        a.animateTo(
          getNodePosition(targetItem),
          { duration: expandDuration, delay, easing: easeOut }
        )
      ];
    });

    await Promise.all([
      ...contFadePromises,
      contValueHidePromise,
      ...expandPromises
    ]);
    if (this.cancelled) return;

    // Phase 3: Highlight the top control item, fade in arg value and stash arrows
    const fadeInDuration = 1.0;
    await Promise.all([
      this.newControlItemAnimations
        .at(-1)
        ?.animateRectTo({ stroke: defaultActiveColor() }, { duration: fadeInDuration }),
      this.argValueAnimation?.animateTo({ opacity: 1 }, { duration: fadeInDuration }),
      this.argValueArrowAnimation?.animateTo({ opacity: 1 }, { duration: fadeInDuration, delay: 0.3 }),
      ...this.newStashArrowAnimations.map(a =>
        a.animateTo({ opacity: 1 }, { duration: fadeInDuration, delay: 0.3 })
      )
    ]);
    if (this.cancelled) return;
    this.destroy();
  }

  destroy() {
    this.ref.current?.hide();
    // Restore visibility of all control and stash items
    this.contValueVisible?.ref.current?.show();
    Layout.controlComponent.stackItemComponents.forEach(item => item.ref.current?.show());
    Layout.stashComponent.stashItemComponents.forEach(item => {
      item.ref.current?.show();
      item.arrow?.ref.current?.show();
    });
    Layout.stashValues.forEach(v => v.ref.current?.show());
    this.appInstrAnimation.destroy();
    this.contStashAnimation.destroy();
    this.contStashArrowAnimation?.destroy();
    this.argStashAnimation?.destroy();
    this.newControlItemAnimations.forEach(a => a.destroy());
    this.newStashItemAnimations.forEach(a => a.destroy());
    this.newStashArrowAnimations.forEach(a => a.destroy());
    this.argValueAnimation?.destroy();
    this.argValueArrowAnimation?.destroy();
  }
}
