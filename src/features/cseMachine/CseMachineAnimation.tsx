import { isPerform, isWithHandle } from 'js-slang/dist/cse-machine/continuations';
import { AppInstr, ArrLitInstr, AssmtInstr, InstrType } from 'js-slang/dist/cse-machine/types';
import { Node } from 'js-slang/dist/types';
import { Layer } from 'konva/lib/Layer';
import { Easings } from 'konva/lib/Tween';
import React from 'react';

import { ArrayAccessAnimation } from './animationComponents/ArrayAccessAnimation';
import { ArrayAssignmentAnimation } from './animationComponents/ArrayAssignmentAnimation';
import { ArraySpreadAnimation } from './animationComponents/ArraySpreadAnimation';
import { AssignmentAnimation } from './animationComponents/AssignmentAnimation';
import { Animatable } from './animationComponents/base/Animatable';
import { lookupBinding } from './animationComponents/base/AnimationUtils';
import { BinaryOperationAnimation } from './animationComponents/BinaryOperationAnimation';
import { BranchAnimation } from './animationComponents/BranchAnimation';
import { ControlExpansionAnimation } from './animationComponents/ControlExpansionAnimation';
import { ControlToStashAnimation } from './animationComponents/ControlToStashAnimation';
import { EnvironmentAnimation } from './animationComponents/EnvironmentAnimation';
import { FrameCreationAnimation } from './animationComponents/FrameCreationAnimation';
import { FunctionApplicationAnimation } from './animationComponents/FunctionApplicationAnimation';
import { InstructionApplicationAnimation } from './animationComponents/InstructionApplicationAnimation';
import { LookupAnimation } from './animationComponents/LookupAnimation';
import { PerformAnimation } from './animationComponents/PerformAnimation';
import { PopAnimation } from './animationComponents/PopAnimation';
import { UnaryOperationAnimation } from './animationComponents/UnaryOperationAnimation';
import { WithHandleAnimation } from './animationComponents/WithHandleAnimation';
import { isNode } from './components/ControlStack';
import { Frame } from './components/Frame';
import { ArrayValue } from './components/values/ArrayValue';
import CseMachine from './CseMachine';
import { Layout } from './CseMachineLayout';
import { isBuiltInFn, isEnvEqual, isInstr, isStreamFn } from './CseMachineUtils';

export class CseAnimation {
  static readonly animations: Animatable[] = [];
  static readonly defaultDuration = 300;
  static readonly defaultEasing = Easings.StrongEaseInOut;
  private static animationEnabled = false;
  private static currentFrame: Frame;
  private static previousFrame: Frame;

  static layerRef = React.createRef<Layer>();
  static getLayer(): Layer | null {
    return this.layerRef.current;
  }

  static enableAnimations(): void {
    CseAnimation.animationEnabled = true;
  }

  static disableAnimations(): void {
    CseAnimation.animationEnabled = false;
  }

  static setCurrentFrame(frame: Frame) {
    CseAnimation.previousFrame = CseAnimation.currentFrame ?? frame;
    CseAnimation.currentFrame = frame;
  }

  private static clearAnimationComponents(): void {
    CseAnimation.animations.forEach(a => a.cancel());
    CseAnimation.animations.forEach(a => a.destroy());
    CseAnimation.animations.length = 0;
  }

  private static getNewControlItems() {
    const currentControlSize = Layout.controlComponent.control.size();
    const previousControlSize = Layout.previousControlComponent.control.size();
    const numOfItems = currentControlSize - previousControlSize + 1;
    if (numOfItems <= 0) return [];
    return Layout.controlComponent.stackItemComponents.slice(-numOfItems);
  }

  private static handleNode(node: Node) {
    const lastControlComponent = Layout.previousControlComponent.stackItemComponents.at(-1)!;
    const currStashComponent = Layout.stashComponent.stashItemComponents.at(-1)!;
    switch (node.type) {
      case 'Program':
      case 'BlockStatement':
      case 'StatementSequence':
        if (node.body.length === 1) {
          CseAnimation.handleNode(node.body[0]);
        } else {
          CseAnimation.animations.push(
            new ControlExpansionAnimation(lastControlComponent, CseAnimation.getNewControlItems())
          );
          if (
            !isEnvEqual(
              CseAnimation.currentFrame.environment,
              CseAnimation.previousFrame.environment
            )
          ) {
            CseAnimation.animations.push(
              new FrameCreationAnimation(lastControlComponent, CseAnimation.currentFrame)
            );
          }
        }
        break;
      case 'Literal':
        CseAnimation.animations.push(
          new ControlToStashAnimation(lastControlComponent, currStashComponent!)
        );
        break;
      case 'ArrowFunctionExpression':
        CseAnimation.animations.push(
          new ControlToStashAnimation(lastControlComponent, currStashComponent!)
        );
        break;
      case 'Identifier':
        // Special case for 'undefined' identifier
        if (node.name === 'undefined') {
          CseAnimation.animations.push(
            new ControlToStashAnimation(lastControlComponent, currStashComponent!)
          );
        } else {
          CseAnimation.animations.push(
            new LookupAnimation(
              lastControlComponent,
              currStashComponent!,
              ...lookupBinding(CseAnimation.currentFrame, node.name)
            )
          );
        }
        break;
      case 'SpreadElement':
        CseAnimation.animations.push(
          new ControlExpansionAnimation(lastControlComponent, CseAnimation.getNewControlItems())
        );
        break;
      case 'AssignmentExpression':
      case 'ArrayExpression':
      case 'BinaryExpression':
      case 'CallExpression':
      case 'ConditionalExpression':
      case 'ForStatement':
      case 'IfStatement':
      case 'MemberExpression':
      case 'ReturnStatement':
      case 'UnaryExpression':
      case 'VariableDeclaration':
      case 'FunctionDeclaration':
      case 'WhileStatement':
        CseAnimation.animations.push(
          new ControlExpansionAnimation(lastControlComponent, CseAnimation.getNewControlItems())
        );
        break;
      case 'ExpressionStatement':
        CseAnimation.handleNode(node.expression);
        break;
    }
  }

  static updateAnimation() {
    CseAnimation.clearAnimationComponents();

    if (!Layout.previousControlComponent) return;
    const lastControlItem = Layout.previousControlComponent.control.peek();
    const lastControlComponent = Layout.previousControlComponent.stackItemComponents.at(-1);
    const currStashComponent = Layout.stashComponent.stashItemComponents.at(-1);
    if (
      !CseAnimation.animationEnabled ||
      !lastControlItem ||
      !lastControlComponent ||
      !CseMachine.getControlStash() // TODO: handle cases where there are only environment animations
    ) {
      return;
    }
    try {
      CseAnimation._updateAnimationInner(lastControlItem, lastControlComponent, currStashComponent);
    } catch (e) {
      // Animation setup failed (e.g. stale state during step-back); skip gracefully
      console.warn('[CseAnimation] updateAnimation failed:', e);
      CseAnimation.clearAnimationComponents();
    }
  }

  private static _updateAnimationInner(
    lastControlItem: any,
    lastControlComponent: any,
    currStashComponent: any
  ) {
    // Skip animations for delimited continuation instruction types
    if (
      isInstr(lastControlItem) &&
      [
        InstrType.RESET_CONTROL_MARKER,
        InstrType.ENV_STACK_RESTORE,
        InstrType.HANDLER_CONTROL_MARKER,
        InstrType.RUN_WITH_HANDLER,
        InstrType.PERFORM,
        InstrType.OBJECT_LITERAL
      ].includes(lastControlItem.instrType)
    ) {
      return;
    }
    if (isNode(lastControlItem)) {
      CseAnimation.handleNode(lastControlItem);
    } else if (isInstr(lastControlItem)) {
      switch (lastControlItem.instrType) {
        case InstrType.APPLICATION: {
          const appInstr = lastControlItem as AppInstr;
          const fnStashItem = Layout.previousStashComponent.stashItemComponents.at(
            -appInstr.numOfArgs - 1
          )!;
          const fn = fnStashItem.value;

          // withHandle(handler, body) - show handler markers being installed
          if (isWithHandle(fn)) {
            const consumedStashItems =
              Layout.previousStashComponent.stashItemComponents.slice(-appInstr.numOfArgs - 1);
            const newControlItems = CseAnimation.getNewControlItems();
            const prevStashSize = Layout.previousStashComponent.stash.size();
            // New stash items start after removing consumed items
            const newStashStartIndex = prevStashSize - appInstr.numOfArgs - 1;
            const newStashItems = Layout.stashComponent.stashItemComponents.slice(
              Math.max(0, newStashStartIndex)
            );
            CseAnimation.animations.push(
              new WithHandleAnimation(
                lastControlComponent,
                consumedStashItems,
                newControlItems,
                newStashItems
              )
            );
            break;
          }

          // perform(op, ...args) - show continuation capture up to handler marker
          if (isPerform(fn)) {
            const consumedStashItems =
              Layout.previousStashComponent.stashItemComponents.slice(-appInstr.numOfArgs - 1);
            const newControlItems = CseAnimation.getNewControlItems();

            // Find captured control items: items between handler marker and app_i in previous control
            const prevControlItems = Layout.previousControlComponent.stackItemComponents;
            // Items captured = previous items that are gone (excluding the app_i at top)
            // Previous: ... | handler(id) | ... captured ... | app_i  (top is app_i)
            // Current:  ... below handler ... | app_i(1+args)
            // Captured items are from handler marker index to second-to-last in previous
            let handlerMarkerIdx = -1;
            for (let i = prevControlItems.length - 2; i >= 0; i--) {
              if (prevControlItems[i].tooltip.startsWith('handler control marker (')) {
                handlerMarkerIdx = i;
                break;
              }
            }
            const capturedControlItems =
              handlerMarkerIdx >= 0
                ? prevControlItems.slice(handlerMarkerIdx, prevControlItems.length - 1)
                : [];

            // Find captured stash items: items between handler stash marker and consumed items
            const prevStashItems = Layout.previousStashComponent.stashItemComponents;
            let handlerStashIdx = -1;
            for (let i = prevStashItems.length - appInstr.numOfArgs - 2; i >= 0; i--) {
              if (prevStashItems[i].tooltip.startsWith('handler stash marker(')) {
                handlerStashIdx = i;
                break;
              }
            }
            const capturedStashItems =
              handlerStashIdx >= 0
                ? prevStashItems.slice(handlerStashIdx, prevStashItems.length - appInstr.numOfArgs - 1)
                : [];

            // New stash items
            const newStashItems = Layout.stashComponent.stashItemComponents.slice(
              handlerStashIdx >= 0 ? handlerStashIdx : 0
            );

            CseAnimation.animations.push(
              new PerformAnimation(
                lastControlComponent,
                consumedStashItems,
                capturedControlItems,
                capturedStashItems,
                newControlItems,
                newStashItems
              )
            );
            break;
          }

          if (isBuiltInFn(fn) || isStreamFn(fn)) {
            CseAnimation.animations.push(
              new InstructionApplicationAnimation(
                lastControlComponent,
                Layout.previousStashComponent.stashItemComponents.slice(-appInstr.numOfArgs - 1),
                currStashComponent!
              )
            );
            break;
          }
          const frameCreated = appInstr.numOfArgs > 0;

          CseAnimation.animations.push(
            new FunctionApplicationAnimation(
              lastControlComponent,
              CseAnimation.getNewControlItems(),
              fnStashItem,
              Layout.previousStashComponent.stashItemComponents.slice(-appInstr.numOfArgs),
              frameCreated ? CseAnimation.currentFrame : undefined
            )
          );
          break;
        }
        case InstrType.ARRAY_ACCESS:
          CseAnimation.animations.push(
            new ArrayAccessAnimation(
              lastControlComponent,
              Layout.previousStashComponent.stashItemComponents.at(-2)!,
              Layout.previousStashComponent.stashItemComponents.at(-1)!,
              Layout.stashComponent.stashItemComponents.at(-1)!
            )
          );
          break;
        case InstrType.ARRAY_ASSIGNMENT: {
          const arrayItem = Layout.previousStashComponent.stashItemComponents.at(-3)!;
          CseAnimation.animations.push(
            new ArrayAssignmentAnimation(
              lastControlComponent,
              arrayItem,
              Layout.values.get(arrayItem.value.id) as ArrayValue,
              Layout.previousStashComponent.stashItemComponents.at(-2)!,
              Layout.previousStashComponent.stashItemComponents.at(-1)!,
              Layout.stashComponent.stashItemComponents.at(-1)!
            )
          );
          break;
        }
        case InstrType.ARRAY_LITERAL: {
          const arrSize = (lastControlItem as ArrLitInstr).arity;
          CseAnimation.animations.push(
            new InstructionApplicationAnimation(
              lastControlComponent,
              Layout.previousStashComponent.stashItemComponents.slice(-arrSize),
              currStashComponent!
            )
          );
          break;
        }
        case InstrType.ASSIGNMENT:
          CseAnimation.animations.push(
            new AssignmentAnimation(
              lastControlComponent,
              currStashComponent!,
              ...lookupBinding(CseAnimation.currentFrame, (lastControlItem as AssmtInstr).symbol)
            )
          );
          break;
        case InstrType.BINARY_OP:
          CseAnimation.animations.push(
            new BinaryOperationAnimation(
              lastControlComponent,
              Layout.previousStashComponent.stashItemComponents.at(-2)!,
              Layout.previousStashComponent.stashItemComponents.at(-1)!,
              currStashComponent!
            )
          );
          break;
        case InstrType.BRANCH:
        case InstrType.FOR:
        case InstrType.WHILE:
          CseAnimation.animations.push(
            new BranchAnimation(
              lastControlComponent,
              Layout.previousStashComponent.stashItemComponents.at(-1)!,
              CseAnimation.getNewControlItems()
            )
          );
          break;
        case InstrType.ENVIRONMENT:
          CseAnimation.animations.push(
            new EnvironmentAnimation(CseAnimation.previousFrame, CseAnimation.currentFrame)
          );
          break;
        case InstrType.POP:
          {
            const currentStashSize = Layout.stashComponent.stash.size();
            const previousStashSize = Layout.previousStashComponent.stash.size();
            const lastStashIsUndefined =
              currentStashSize === 1 &&
              currStashComponent!.text === 'undefined' &&
              currentStashSize === previousStashSize;
            CseAnimation.animations.push(
              new PopAnimation(
                lastControlComponent,
                Layout.previousStashComponent.stashItemComponents.at(-1)!,
                lastStashIsUndefined ? currStashComponent : undefined
              )
            );
          }
          break;
        case InstrType.UNARY_OP:
          CseAnimation.animations.push(
            new UnaryOperationAnimation(
              lastControlComponent,
              Layout.previousStashComponent.stashItemComponents.at(-1)!,
              currStashComponent!
            )
          );
          break;
        case InstrType.SPREAD: {
          const control = Layout.controlComponent.stackItemComponents;
          const array = Layout.previousStashComponent.stashItemComponents.at(-1)!.arrow!
            .target! as ArrayValue;

          let currCallInstr;

          for (let i = 1; control.at(-i) != undefined; i++) {
            if (control.at(-i)?.text.includes('call ')) {
              // find call instr above
              currCallInstr = control.at(-i);
              break;
            }
          }

          const resultItems =
            array.data.length !== 0
              ? Layout.stashComponent.stashItemComponents.slice(-array.data.length)
              : [];

          CseAnimation.animations.push(
            new ArraySpreadAnimation(
              lastControlComponent,
              Layout.previousStashComponent.stashItemComponents.at(-1)!,
              resultItems!,
              currCallInstr!
            )
          );
          break;
        }
        case InstrType.ARRAY_LENGTH:
        case InstrType.BREAK:
        case InstrType.BREAK_MARKER:
        case InstrType.CONTINUE_MARKER:
        case InstrType.MARKER:
        case InstrType.RESET:
        case InstrType.OBJECT_LITERAL:
        case InstrType.RESET_CONTROL_MARKER:
        case InstrType.ENV_STACK_RESTORE:
        case InstrType.HANDLER_CONTROL_MARKER:
        case InstrType.RUN_WITH_HANDLER:
        case InstrType.PERFORM:
          break;
      }
    }
  }

  static async playAnimation() {
    if (!CseAnimation.animationEnabled) {
      CseAnimation.clearAnimationComponents();
      return;
    }
    CseAnimation.disableAnimations();
    // Get the actual HTML <canvas> element and set the pointer events to none, to allow for
    // mouse events to pass through the animation layer and be handled by the actual CSE Machine.
    // Setting the listening property to false on the Konva Layer does not seem to work, so
    // this a workaround.
    const canvasElement = CseAnimation.getLayer()?.getNativeCanvasElement();
    if (canvasElement) canvasElement.style.pointerEvents = 'none';
    // Snapshot the current animations so we don't interfere with new ones
    // set up by updateAnimation if the user steps during playback.
    const currentAnimations = [...this.animations];
    try {
      await Promise.all(currentAnimations.map(a => a.animate()));
    } catch {
      // Animation playback failed; clean up the snapshot gracefully
      currentAnimations.forEach(a => a.destroy());
    }
  }
}
