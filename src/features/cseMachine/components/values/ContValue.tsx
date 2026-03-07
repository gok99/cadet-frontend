import { Control, Stash } from 'js-slang/dist/cse-machine/interpreter';
import { Environment } from 'js-slang/dist/types';
import { KonvaEventObject } from 'konva/lib/Node';
import { Label } from 'konva/lib/shapes/Label';
import React, { RefObject } from 'react';
import {
  Circle,
  Group,
  Label as KonvaLabel,
  Rect,
  Tag as KonvaTag,
  Text as KonvaText
} from 'react-konva';

import CseMachine from '../../CseMachine';
import { Config, ShapeDefaultProps } from '../../CseMachineConfig';
import { ControlStashConfig } from '../../CseMachineControlStashConfig';
import { Layout } from '../../CseMachineLayout';
import { IHoverable, ReferenceType } from '../../CseMachineTypes';
import {
  defaultStrokeColor,
  defaultTextColor,
  fadedStrokeColor,
  fadedTextColor,
  getTextWidth,
  isMainReference,
  setHoveredCursor,
  setUnhoveredCursor
} from '../../CseMachineUtils';
import { Continuation, isDelimitedContinuation } from '../../utils/continuation';
import { ArrowFromFn } from '../arrows/ArrowFromFn';
import { Binding } from '../Binding';
import { Frame } from '../Frame';
import { Value } from './Value';

/** this class encapsulates a Scheme Continuation that
 *  contains extra props such as environment, control and stash */
export class ContValue extends Value implements IHoverable {
  readonly radius: number = Config.FnRadius;
  readonly innerRadius: number = Config.FnInnerRadius;
  readonly labelRef: RefObject<Label> = React.createRef();

  readonly tooltip: string;
  readonly tooltipWidth: number;
  readonly exportTooltip: string;
  readonly exportTooltipWidth: number;

  centerX: number;
  enclosingFrame?: Frame;
  env?: Environment;
  control?: Control;
  stash?: Stash;
  private _arrow: ArrowFromFn | undefined;

  constructor(
    /** underlying continuation */
    readonly data: any,
    /** what this value is being referenced by */
    firstReference?: ReferenceType
  ) {
    super();
    Layout.memoizeValue(data, this);

    const label = isDelimitedContinuation(data) ? 'delim cont' : 'continuation';
    this.tooltip = label;
    this.tooltipWidth = getTextWidth(this.tooltip);
    this.exportTooltip = label;
    this.exportTooltipWidth = getTextWidth(this.exportTooltip);

    this.centerX = 0;
    this._width = this.radius * 2.5;
    this._height = this.radius * 2.5;

    // get the proper environment from the continuation
    // Delimited continuations capture a slice of computation, not a lexical env,
    // so we skip the enclosing frame arrow for them.
    if (isDelimitedContinuation(data)) {
      // no enclosing frame arrow for delimited continuations
    } else {
      const cont = data as Continuation;
      this.env = cont.getEnv()[0];
      this.enclosingFrame = Frame.getFrom(this.env);
      this.control = cont.getControl();
      this.stash = cont.getStash();
    }

    if (firstReference) {
      this.addReference(firstReference);
    }
  }

  /**
   * Create a ContValue for a continuation that lives only on the stash
   * (not bound to any frame variable). Positions it below the stash area.
   */
  static createForStash(data: any, _stashWidth: number): ContValue {
    const contValue = new ContValue(data);
    // Position in the control area (left side), below the control stack
    const controlBottom =
      Layout.controlComponent.y() + Layout.controlComponent.height();
    const row = Layout.stashValues.length;
    contValue._x = ControlStashConfig.ControlPosX;
    contValue._y =
      controlBottom +
      Config.FrameMarginY * 3 +
      row * (contValue.radius * 3 + Config.FrameMarginY);
    contValue.centerX = contValue._x + contValue.radius * 2;
    Layout.stashValues.push(contValue);
    return contValue;
  }

  // isLive(): boolean {
  //   if (this.enclosingFrame) {
  //     return (
  //       (this.enclosingFrame.environment &&
  //         Layout.liveEnvIDs.has(this.enclosingFrame.environment.id)) ||
  //       CseMachine.getCurrentEnvId() === this.enclosingFrame.environment?.id
  //     );
  //   }
  //   return false;
  // }

  isLive(): boolean {
    const id = (this.data as any).id;
    return id ? Layout.liveObjectIDs.has(id) : false;
  }

  handleNewReference(newReference: ReferenceType): void {
    if (!isMainReference(this, newReference)) return;

    // derive the coordinates from the main reference (binding / array unit)
    if (newReference instanceof Binding) {
      this._x = newReference.frame.x() + newReference.frame.width() + Config.FrameMarginX;
      this._y = newReference.y();
      this.centerX = this._x + this.radius * 2;
    } else {
      if (newReference.isLastUnit) {
        this._x = newReference.x() + Config.DataUnitWidth * 2;
        this._y = newReference.y() + Config.DataUnitHeight / 2 - this.radius;
      } else {
        this._x = newReference.x();
        this._y = newReference.y() + newReference.parent.height() + Config.DataUnitHeight;
      }
      this.centerX = this._x + Config.DataUnitWidth / 2;
      this._x = this.centerX - this.radius * 2;
    }
    this._y += this.radius;
  }

  arrow(): ArrowFromFn | undefined {
    return this._arrow;
  }

  onMouseEnter = ({ currentTarget }: KonvaEventObject<MouseEvent>) => {
    if (CseMachine.getPrintableMode()) return;
    setHoveredCursor(currentTarget);
    this.labelRef.current?.moveToTop();
    this.labelRef.current?.show();
  };

  onMouseLeave = ({ currentTarget }: KonvaEventObject<MouseEvent>) => {
    if (CseMachine.getPrintableMode()) return;
    setUnhoveredCursor(currentTarget);
    this.labelRef.current?.hide();
  };

  draw(): React.ReactNode {
    if (this.enclosingFrame) {
      this._arrow = new ArrowFromFn(this).to(this.enclosingFrame) as ArrowFromFn;
    }
    const textColor = this.isLive() ? defaultTextColor() : fadedTextColor();
    const strokeColor = this.isLive() ? defaultStrokeColor() : fadedStrokeColor();
    //dont need to check isReferenced here since live is ALL we need to know

    return (
      <React.Fragment key={Layout.key++}>
        <Group onMouseEnter={this.onMouseEnter} onMouseLeave={this.onMouseLeave} ref={this.ref}>
          <Rect
            {...ShapeDefaultProps}
            key={Layout.key++}
            x={this.centerX - 1.5 * this.radius}
            y={this.y() - this.radius}
            width={this.radius / 2}
            height={this.radius * 2}
            stroke={strokeColor}
          />
          <Rect
            {...ShapeDefaultProps}
            key={Layout.key++}
            x={this.centerX - this.radius}
            y={this.y() - 1.5 * this.radius}
            width={this.radius * 2}
            height={this.radius / 2}
            stroke={strokeColor}
          />
          <Circle
            {...ShapeDefaultProps}
            key={Layout.key++}
            x={this.centerX}
            y={this.y()}
            radius={this.radius}
            stroke={strokeColor}
          />
          <Circle
            {...ShapeDefaultProps}
            key={Layout.key++}
            x={this.centerX}
            y={this.y()}
            radius={this.innerRadius}
            fill={strokeColor}
          />
        </Group>
        <KonvaLabel
          x={this.x() + this.width() + Config.TextPaddingX * 2}
          y={this.y() - Config.TextPaddingY}
          visible={CseMachine.getPrintableMode()}
          ref={this.labelRef}
        >
          {CseMachine.getPrintableMode() ? (
            <KonvaTag stroke={strokeColor} />
          ) : (
            <KonvaTag
              stroke={Config.HoverBgColor}
              fill={Config.HoverBgColor}
              opacity={Config.FnTooltipOpacity}
            />
          )}
          <KonvaText
            text={CseMachine.getPrintableMode() ? this.exportTooltip : this.tooltip}
            fontFamily={Config.FontFamily}
            fontSize={Config.FontSize}
            fontStyle={Config.FontStyle}
            fill={textColor}
            padding={5}
          />
        </KonvaLabel>
        {this._arrow?.draw()}
      </React.Fragment>
    );
  }
}
