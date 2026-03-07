import React from 'react';
import { Group } from 'react-konva';

import { ControlItemComponent } from '../components/ControlItemComponent';
import { StashItemComponent } from '../components/StashItemComponent';
import { ControlStashConfig } from '../CseMachineControlStashConfig';
import {
  defaultActiveColor,
  defaultDangerColor,
  defaultStrokeColor,
  getTextWidth
} from '../CseMachineUtils';
import { Animatable } from './base/Animatable';
import { AnimatedTextbox } from './base/AnimatedTextbox';
import { getNodeLocation, getNodePosition } from './base/AnimationUtils';

/**
 * Animation for withHandle application.
 * Shows the app instruction and stash items (withHandle, handler, body) being consumed,
 * new control items (handler marker, app_i(0)) expanding in, and the handler stash marker
 * appearing on the stash.
 */
export class WithHandleAnimation extends Animatable {
  private appInstrAnimation: AnimatedTextbox;
  private consumedStashAnimations: AnimatedTextbox[];
  private newControlItemAnimations: AnimatedTextbox[];
  private newStashItemAnimations: AnimatedTextbox[];

  constructor(
    private appInstrItem: ControlItemComponent,
    private consumedStashItems: StashItemComponent[],
    private newControlItems: ControlItemComponent[],
    private newStashItems: StashItemComponent[]
  ) {
    super();
    const appPosition = getNodePosition(appInstrItem);

    this.appInstrAnimation = new AnimatedTextbox(appInstrItem.text, appPosition, {
      rectProps: { stroke: defaultActiveColor() }
    });

    this.consumedStashAnimations = consumedStashItems.map(
      item =>
        new AnimatedTextbox(item.text, getNodePosition(item), {
          rectProps: { stroke: defaultDangerColor() }
        })
    );

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

    // New stash items fade in at their final position
    this.newStashItemAnimations = newStashItems.map(
      item =>
        new AnimatedTextbox(item.text, {
          ...getNodePosition(item),
          opacity: 0
        })
    );
  }

  draw(): React.ReactNode {
    return (
      <Group key={Animatable.key--} ref={this.ref}>
        {this.appInstrAnimation.draw()}
        {this.consumedStashAnimations.map(a => a.draw())}
        {this.newControlItemAnimations.map(a => a.draw())}
        {this.newStashItemAnimations.map(a => a.draw())}
      </Group>
    );
  }

  async animate() {
    // Hide real items while we animate
    this.newControlItems.forEach(item => item.ref.current?.hide());
    this.newStashItems.forEach(item => item.ref.current?.hide());

    const minInstrWidth =
      getTextWidth(this.appInstrItem.text) + ControlStashConfig.ControlItemTextPadding * 2;
    const firstConsumed = this.consumedStashItems[0];
    const isFirstStashItem = firstConsumed?.index === 0;

    // Phase 1: Move app instruction toward stash, unhighlight consumed stash items
    await Promise.all([
      this.appInstrAnimation.animateRectTo({ stroke: defaultStrokeColor() }),
      this.appInstrAnimation.animateTo({
        x: firstConsumed.x() - (isFirstStashItem ? minInstrWidth : 0),
        y: firstConsumed.y() + (isFirstStashItem ? 0 : firstConsumed.height()),
        width: minInstrWidth
      }),
      ...this.consumedStashAnimations.map(a =>
        a.animateRectTo({ stroke: defaultStrokeColor() })
      )
    ]);
    if (this.cancelled) return;

    const fadeDuration = 0.75;
    const fadeInDelay = 0.25;
    const config = { duration: 1.2 };

    // Phase 2: Fade out consumed items, fade in new control and stash items
    await Promise.all([
      // Fade out app instruction
      this.appInstrAnimation.animateTo({ opacity: 0 }, { ...config, duration: fadeDuration }),
      // Fade out consumed stash items
      ...this.consumedStashAnimations.map(a =>
        a.animateTo({ opacity: 0 }, { ...config, duration: fadeDuration })
      ),
      // Fade in new control items at their final positions
      ...this.newControlItemAnimations.flatMap((a, i) => [
        a.animateTo(getNodePosition(this.newControlItems[i]), config),
        a.animateTo({ opacity: 1 }, { ...config, duration: fadeDuration, delay: fadeInDelay })
      ]),
      // Highlight the top new control item
      this.newControlItemAnimations
        .at(-1)
        ?.animateRectTo({ stroke: defaultActiveColor() }, config),
      // Fade in new stash items
      ...this.newStashItemAnimations.map(a =>
        a.animateTo({ opacity: 1 }, { ...config, duration: fadeDuration, delay: fadeInDelay })
      )
    ]);
    if (this.cancelled) return;
    this.destroy();
  }

  destroy() {
    this.ref.current?.hide();
    this.newControlItems.forEach(item => item.ref.current?.show());
    this.newStashItems.forEach(item => item.ref.current?.show());
    this.appInstrAnimation.destroy();
    this.consumedStashAnimations.forEach(a => a.destroy());
    this.newControlItemAnimations.forEach(a => a.destroy());
    this.newStashItemAnimations.forEach(a => a.destroy());
  }
}
