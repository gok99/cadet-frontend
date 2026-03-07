import React from 'react';
import { Group } from 'react-konva';

import { ControlItemComponent } from '../components/ControlItemComponent';
import { StashItemComponent } from '../components/StashItemComponent';
import { Visible } from '../components/Visible';
import { ControlStashConfig } from '../CseMachineControlStashConfig';
import {
  defaultActiveColor,
  defaultDangerColor,
  defaultStrokeColor,
  getTextWidth
} from '../CseMachineUtils';
import { Animatable } from './base/Animatable';
import { AnimatedGenericArrow } from './base/AnimatedGenericArrow';
import { AnimatedTextbox } from './base/AnimatedTextbox';
import { getNodeLocation, getNodePosition } from './base/AnimationUtils';

/**
 * Animation for perform (effect operation).
 * Shows the app instruction and stash items being consumed,
 * control/stash items between handler markers and top being "captured"
 * into a delimited continuation, and the handler function being applied.
 */
export class PerformAnimation extends Animatable {
  private appInstrAnimation: AnimatedTextbox;
  private consumedStashAnimations: AnimatedTextbox[];
  private capturedControlAnimations: AnimatedTextbox[];
  private capturedStashAnimations: AnimatedTextbox[];
  private newControlItemAnimations: AnimatedTextbox[];
  private newStashItemAnimations: AnimatedTextbox[];
  private newStashArrowAnimations: AnimatedGenericArrow<StashItemComponent, Visible>[];
  private contTarget: { x: number; y: number };
  private contValueVisible?: Visible;

  constructor(
    private appInstrItem: ControlItemComponent,
    private consumedStashItems: StashItemComponent[],
    /** Control items that were between handler marker and top (now removed) */
    capturedControlItems: ControlItemComponent[],
    /** Stash items that were between handler marker and top (now removed) */
    capturedStashItems: StashItemComponent[],
    private newControlItems: ControlItemComponent[],
    private newStashItems: StashItemComponent[]
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

    this.capturedControlAnimations = capturedControlItems.map(
      item =>
        new AnimatedTextbox(item.text, getNodePosition(item), {
          rectProps: { stroke: defaultDangerColor() }
        })
    );

    this.capturedStashAnimations = capturedStashItems.map(
      item =>
        new AnimatedTextbox(item.text, getNodePosition(item), {
          rectProps: { stroke: defaultDangerColor() }
        })
    );

    // Find the continuation target: the ContValue (circle icon) that the delim cont
    // stash item's arrow points to
    const contStashItem = newStashItems.find(item => item.text === 'delim cont');
    const contValueTarget = contStashItem?.arrow?.target;
    this.contValueVisible = contValueTarget;
    this.contTarget = contValueTarget
      ? getNodeLocation(contValueTarget)
      : contStashItem
        ? getNodeLocation(contStashItem)
        : { x: appInstrItem.x(), y: appInstrItem.y() };

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

    this.newStashItemAnimations = newStashItems.map(
      item =>
        new AnimatedTextbox(item.text, {
          ...getNodePosition(item),
          opacity: 0
        })
    );

    this.newStashArrowAnimations = newStashItems.flatMap(item =>
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
        {this.newStashItemAnimations.map(a => a.draw())}
        {this.newStashArrowAnimations.map(a => a.draw())}
      </Group>
    );
  }

  async animate() {
    this.newControlItems.forEach(item => item.ref.current?.hide());
    this.newStashItems.forEach(item => item.ref.current?.hide());
    this.newStashItems.forEach(item => item.arrow?.ref.current?.hide());
    // Hide the cont value circle until captured items converge into it
    this.contValueVisible?.ref.current?.hide();

    const minInstrWidth =
      getTextWidth(this.appInstrItem.text) + ControlStashConfig.ControlItemTextPadding * 2;

    // Phase 1: Move app instruction toward consumed stash items
    const firstConsumed = this.consumedStashItems[0];
    const isFirstStashItem = firstConsumed?.index === 0;
    await Promise.all([
      this.appInstrAnimation.animateRectTo({ stroke: defaultStrokeColor() }),
      this.appInstrAnimation.animateTo({
        x: firstConsumed
          ? firstConsumed.x() - (isFirstStashItem ? minInstrWidth : 0)
          : this.appInstrItem.x(),
        y: firstConsumed
          ? firstConsumed.y() + (isFirstStashItem ? 0 : firstConsumed.height())
          : this.appInstrItem.y(),
        width: minInstrWidth
      })
    ]);

    const config = { duration: 1.5 };
    const fadeDuration = 1.0;
    const fadeInDelay = 0.5;

    // Phase 2: Captured control and stash items converge toward the continuation object
    // Consumed stash items also move to the cont target
    // New control and stash items fade in at their final positions
    await Promise.all([
      // App instruction moves to cont target and fades out
      this.appInstrAnimation.animateTo(this.contTarget, config),
      this.appInstrAnimation.animateTo({ opacity: 0 }, { ...config, duration: fadeDuration }),
      // Captured control items move toward continuation and fade out
      ...this.capturedControlAnimations.flatMap(a => [
        a.animateTo(this.contTarget, config),
        a.animateTo({ opacity: 0 }, { ...config, duration: fadeDuration })
      ]),
      // Captured stash items move toward continuation and fade out
      ...this.capturedStashAnimations.flatMap(a => [
        a.animateTo(this.contTarget, config),
        a.animateTo({ opacity: 0 }, { ...config, duration: fadeDuration })
      ]),
      // Consumed stash items (perform, op, args) move toward continuation and fade out
      ...this.consumedStashAnimations.flatMap(a => [
        a.animateTo(this.contTarget, config),
        a.animateTo({ opacity: 0 }, { ...config, duration: fadeDuration })
      ]),
      // New control items fade in at their final positions
      ...this.newControlItemAnimations.flatMap((a, i) => [
        a.animateTo(getNodePosition(this.newControlItems[i]), config),
        a.animateTo({ opacity: 1 }, { ...config, duration: fadeDuration, delay: fadeInDelay })
      ]),
      this.newControlItemAnimations
        .at(-1)
        ?.animateRectTo({ stroke: defaultActiveColor() }, config),
      // New stash items fade in
      ...this.newStashItemAnimations.map(a =>
        a.animateTo({ opacity: 1 }, { ...config, duration: fadeDuration, delay: fadeInDelay })
      ),
      // Stash arrows fade in after items
      ...this.newStashArrowAnimations.map(a =>
        a.animateTo({ opacity: 1 }, { ...config, delay: config.duration })
      )
    ]);
    this.destroy();
  }

  destroy() {
    this.ref.current?.hide();
    this.contValueVisible?.ref.current?.show();
    this.newControlItems.forEach(item => item.ref.current?.show());
    this.newStashItems.forEach(item => item.ref.current?.show());
    this.newStashItems.forEach(item => item.arrow?.ref.current?.show());
    this.appInstrAnimation.destroy();
    this.consumedStashAnimations.forEach(a => a.destroy());
    this.capturedControlAnimations.forEach(a => a.destroy());
    this.capturedStashAnimations.forEach(a => a.destroy());
    this.newControlItemAnimations.forEach(a => a.destroy());
    this.newStashItemAnimations.forEach(a => a.destroy());
    this.newStashArrowAnimations.forEach(a => a.destroy());
  }
}
