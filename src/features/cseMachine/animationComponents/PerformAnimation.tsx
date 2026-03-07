import { Easings } from 'konva/lib/Tween';
import React from 'react';
import { Group } from 'react-konva';

import { ControlItemComponent } from '../components/ControlItemComponent';
import { StashItemComponent } from '../components/StashItemComponent';
import { Visible } from '../components/Visible';
import { Layout } from '../CseMachineLayout';
import {
  defaultActiveColor,
  defaultDangerColor,
  defaultStrokeColor
} from '../CseMachineUtils';
import { Animatable, AnimationConfig } from './base/Animatable';
import { AnimatedGenericArrow } from './base/AnimatedGenericArrow';
import { AnimatedTextbox } from './base/AnimatedTextbox';
import { getNodeLocation, getNodePosition } from './base/AnimationUtils';

/**
 * Animation for perform (effect operation).
 * Shows captured control/stash items being "sucked into" the continuation circle,
 * while new control/stash items fade in.
 */
export class PerformAnimation extends Animatable {
  private appInstrAnimation: AnimatedTextbox;
  private consumedStashAnimations: AnimatedTextbox[];
  private capturedControlAnimations: AnimatedTextbox[];
  private capturedStashAnimations: AnimatedTextbox[];
  private newControlItemAnimations: AnimatedTextbox[];
  // New stash items split into: the delim cont item (shown early) and the rest
  private contStashAnimation?: AnimatedTextbox;
  private contStashArrowAnimation?: AnimatedGenericArrow<StashItemComponent, Visible>;
  private contStashItem?: StashItemComponent;
  private otherNewStashItemAnimations: AnimatedTextbox[];
  private otherNewStashArrowAnimations: AnimatedGenericArrow<StashItemComponent, Visible>[];
  private contTarget: { x: number; y: number };
  private contValueVisible?: Visible;

  constructor(
    appInstrItem: ControlItemComponent,
    consumedStashItems: StashItemComponent[],
    /** Control items that were between handler marker and top (now removed) */
    capturedControlItems: ControlItemComponent[],
    /** Stash items that were between handler marker and top (now removed) */
    capturedStashItems: StashItemComponent[],
    private newControlItems: ControlItemComponent[],
    newStashItems: StashItemComponent[]
  ) {
    super();

    this.appInstrAnimation = new AnimatedTextbox(
      appInstrItem.text,
      getNodePosition(appInstrItem),
      { rectProps: { stroke: defaultActiveColor() } }
    );

    this.consumedStashAnimations = consumedStashItems.map(
      item =>
        new AnimatedTextbox(item.text, getNodePosition(item), {
          rectProps: { stroke: defaultDangerColor() }
        })
    );

    // Captured items start with default stroke — they'll be highlighted during animation
    this.capturedControlAnimations = capturedControlItems.map(
      item =>
        new AnimatedTextbox(item.text, getNodePosition(item), {
          rectProps: { stroke: defaultStrokeColor() }
        })
    );

    this.capturedStashAnimations = capturedStashItems.map(
      item =>
        new AnimatedTextbox(item.text, getNodePosition(item), {
          rectProps: { stroke: defaultStrokeColor() }
        })
    );

    // Find the continuation target: the ContValue (circle icon) that the delim cont
    // stash item's arrow points to
    this.contStashItem = newStashItems.find(item => item.tooltip === 'delim cont');
    const contValueTarget = this.contStashItem?.arrow?.target;
    this.contValueVisible = contValueTarget;
    this.contTarget = contValueTarget
      ? getNodeLocation(contValueTarget)
      : this.contStashItem
        ? getNodeLocation(this.contStashItem)
        : { x: appInstrItem.x(), y: appInstrItem.y() };

    // Separate delim cont stash animation from the rest
    const otherNewStashItems = newStashItems.filter(item => item !== this.contStashItem);

    if (this.contStashItem) {
      this.contStashAnimation = new AnimatedTextbox(this.contStashItem.text, {
        ...getNodePosition(this.contStashItem),
        opacity: 0
      });
      if (this.contStashItem.arrow) {
        this.contStashArrowAnimation = new AnimatedGenericArrow(
          this.contStashItem.arrow,
          { opacity: 0 }
        );
      }
    }

    const appLocation = getNodeLocation(appInstrItem);
    this.newControlItemAnimations = newControlItems.map(
      item =>
        new AnimatedTextbox(item.text, {
          ...appLocation,
          width: item.width(),
          height: item.height(),
          opacity: 0
        })
    );

    this.otherNewStashItemAnimations = otherNewStashItems.map(
      item =>
        new AnimatedTextbox(item.text, {
          ...getNodePosition(item),
          opacity: 0
        })
    );

    this.otherNewStashArrowAnimations = otherNewStashItems.flatMap(item =>
      item.arrow ? [new AnimatedGenericArrow(item.arrow, { opacity: 0 })] : []
    );
  }

  draw(): React.ReactNode {
    return (
      <Group key={Animatable.key--} ref={this.ref}>
        {this.appInstrAnimation.draw()}
        {this.consumedStashAnimations.map(a => a.draw())}
        {this.capturedControlAnimations.map(a => a.draw())}
        {this.capturedStashAnimations.map(a => a.draw())}
        {this.newControlItemAnimations.map(a => a.draw())}
        {this.contStashAnimation?.draw()}
        {this.contStashArrowAnimation?.draw()}
        {this.otherNewStashItemAnimations.map(a => a.draw())}
        {this.otherNewStashArrowAnimations.map(a => a.draw())}
      </Group>
    );
  }

  async animate() {
    // Easing that accelerates — starts slow, ends fast — for the "sucking in" effect
    const easeIn: AnimationConfig['easing'] = Easings.StrongEaseIn;

    // Hide ALL current control and stash items so they don't cover the animation
    const controlComponent = Layout.controlComponent;
    const stashComponent = Layout.stashComponent;
    controlComponent.stackItemComponents.forEach(item => item.ref.current?.hide());
    stashComponent.stashItemComponents.forEach(item => {
      item.ref.current?.hide();
      item.arrow?.ref.current?.hide();
    });
    // Also hide stash values (heap objects pointed to by stash arrows)
    Layout.stashValues.forEach(v => v.ref.current?.hide());

    // Hide the cont value circle — we'll reveal it before the suck phase
    this.contValueVisible?.ref.current?.hide();

    // Fade out app instruction and consumed stash items
    await Promise.all([
      this.appInstrAnimation.animateTo({ opacity: 0 }, { duration: 0.8 }),
      ...this.consumedStashAnimations.map(a =>
        a.animateTo({ opacity: 0 }, { duration: 0.8 })
      )
    ]);
    if (this.cancelled) return;

    // Phase 1: Highlight captured items one by one from top down to marker
    const highlightDuration = 0.6;
    const allCaptured = [
      ...([...this.capturedControlAnimations].reverse()),
      ...([...this.capturedStashAnimations].reverse())
    ];

    for (const a of allCaptured) {
      if (this.cancelled) return;
      await a.animateRectTo(
        { stroke: defaultDangerColor() },
        { duration: highlightDuration }
      );
    }
    if (this.cancelled) return;

    // Pause so user can see everything highlighted
    await this.delay(300);
    if (this.cancelled) return;

    // Phase 2: Reveal the continuation object (stash label + arrow + heap circle)
    // as the "black hole" target BEFORE sucking items in.
    this.contValueVisible?.ref.current?.show();
    const contRevealDuration = 1.2;
    await Promise.all([
      this.contStashAnimation?.animateTo({ opacity: 1 }, { duration: contRevealDuration }),
      this.contStashArrowAnimation?.animateTo({ opacity: 1 }, { duration: contRevealDuration })
    ]);
    if (this.cancelled) return;

    await this.delay(150);
    if (this.cancelled) return;

    // Items shrink and converge into the cont object. They stay fully opaque
    // until very close to the target so you can see them moving, not just fading.
    const suckDuration = 3.0;
    const allSucked = [...this.capturedControlAnimations, ...this.capturedStashAnimations];
    const totalStagger = 0.6;
    const staggerStep = allSucked.length > 1 ? totalStagger / (allSucked.length - 1) : 0;

    await Promise.all(
      allSucked.map((a, i) => {
        const delay = i * staggerStep;
        return Promise.all([
          // Move + shrink toward the cont object
          a.animateTo(
            { x: this.contTarget.x, y: this.contTarget.y, width: 0, height: 0 },
            { duration: suckDuration, delay, easing: easeIn }
          ),
          // Only fade out in the last 10% — blocks stay visible almost all the way in
          a.animateTo(
            { opacity: 0 },
            { duration: suckDuration * 0.1, delay: delay + suckDuration * 0.9 }
          )
        ]);
      })
    );
    if (this.cancelled) return;

    // Phase 3: Fade in new control items and remaining stash items
    const fadeInDuration = 1.2;
    await Promise.all([
      // New control items fade in at their final positions
      ...this.newControlItemAnimations.flatMap((a, i) => [
        a.animateTo(getNodePosition(this.newControlItems[i]), { duration: fadeInDuration }),
        a.animateTo({ opacity: 1 }, { duration: fadeInDuration })
      ]),
      this.newControlItemAnimations
        .at(-1)
        ?.animateRectTo({ stroke: defaultActiveColor() }, { duration: fadeInDuration }),
      // Remaining stash items fade in
      ...this.otherNewStashItemAnimations.map(a =>
        a.animateTo({ opacity: 1 }, { duration: fadeInDuration })
      ),
      // Remaining stash arrows fade in
      ...this.otherNewStashArrowAnimations.map(a =>
        a.animateTo({ opacity: 1 }, { duration: fadeInDuration, delay: 0.3 })
      )
    ]);
    if (this.cancelled) return;
    this.destroy();
  }

  destroy() {
    this.ref.current?.hide();
    // Restore visibility of ALL control and stash items
    this.contValueVisible?.ref.current?.show();
    Layout.controlComponent.stackItemComponents.forEach(item => item.ref.current?.show());
    Layout.stashComponent.stashItemComponents.forEach(item => {
      item.ref.current?.show();
      item.arrow?.ref.current?.show();
    });
    Layout.stashValues.forEach(v => v.ref.current?.show());
    this.appInstrAnimation.destroy();
    this.consumedStashAnimations.forEach(a => a.destroy());
    this.capturedControlAnimations.forEach(a => a.destroy());
    this.capturedStashAnimations.forEach(a => a.destroy());
    this.newControlItemAnimations.forEach(a => a.destroy());
    this.contStashAnimation?.destroy();
    this.contStashArrowAnimation?.destroy();
    this.otherNewStashItemAnimations.forEach(a => a.destroy());
    this.otherNewStashArrowAnimations.forEach(a => a.destroy());
  }
}
