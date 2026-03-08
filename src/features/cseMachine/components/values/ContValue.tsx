import { Control, Stash } from 'js-slang/dist/cse-machine/interpreter';
import { Environment } from 'js-slang/dist/types';
import Konva from 'konva';
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
  controlItemToText,
  defaultBackgroundColor,
  defaultStrokeColor,
  defaultTextColor,
  fadedStrokeColor,
  fadedTextColor,
  getTextWidth,
  isMainReference,
  setHoveredCursor,
  setUnhoveredCursor,
  stashItemToText
} from '../../CseMachineUtils';
import { Continuation, isDelimitedContinuation } from '../../utils/continuation';
import { ArrowFromFn } from '../arrows/ArrowFromFn';
import { Binding } from '../Binding';
import { Frame } from '../Frame';
import { Value } from './Value';

/** this class encapsulates a Scheme Continuation that
 *  contains extra props such as environment, control and stash */
export class ContValue extends Value implements IHoverable {
  /** Static reference to the currently-active hover overlay so it can be
   *  cleaned up when animations start or the layout is redrawn. */
  private static _activeHoverGroup?: Konva.Group;

  /** Remove any active hover overlay. Called before animations and layout updates. */
  static clearHoverOverlay(): void {
    if (ContValue._activeHoverGroup) {
      ContValue._activeHoverGroup.destroy();
      ContValue._activeHoverGroup = undefined;
    }
  }

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
  /** True if positioned below control (via createForStash) rather than next to a frame.
   *  Used by the animation system to detect when a cont slides from stash to frame. */
  _createdForStash = false;
  private _arrow: ArrowFromFn | undefined;

  /** Precomputed text representations of captured control/stash items for hover preview */
  private capturedControlTexts: string[] = [];
  private capturedStashTexts: string[] = [];
  /** Imperatively-created Konva group for the hover overlay */
  private _hoverGroup?: Konva.Group;

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
    if (isDelimitedContinuation(data)) {
      // Delimited continuations capture an environment stack — point to the first
      // frame that exists in the current layout
      const envStack = data.getEnvStack();
      for (const env of envStack) {
        const frame = Frame.getFrom(env);
        if (frame) {
          this.env = env;
          this.enclosingFrame = frame;
          break;
        }
      }
      // Precompute captured state text for hover preview
      this.capturedControlTexts = data.getControl().map((item: any) => controlItemToText(item));
      this.capturedStashTexts = data.getStash().map((item: any) => stashItemToText(item));
    } else {
      const cont = data as Continuation;
      this.env = cont.getEnv()[0];
      this.enclosingFrame = Frame.getFrom(this.env);
      this.control = cont.getControl();
      this.stash = cont.getStash();
      // Precompute captured state text for hover preview
      if (this.control) {
        this.capturedControlTexts = this.control.getStack().map((item: any) => controlItemToText(item));
      }
      if (this.stash) {
        this.capturedStashTexts = this.stash.getStack().map((item: any) => stashItemToText(item));
      }
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
    // Position below the control stack
    const controlBottom =
      Layout.controlComponent.y() + Layout.controlComponent.height();
    const row = Layout.stashValues.length;
    contValue._x = ControlStashConfig.ControlPosX;
    contValue._y =
      controlBottom +
      Config.FrameMarginY * 3 +
      row * (contValue.radius * 3 + Config.FrameMarginY);
    contValue.centerX = contValue._x + contValue.radius * 2;
    contValue._createdForStash = true;
    Layout.stashValues.push(contValue);
    return contValue;
  }

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
    this.showCapturedState(currentTarget);
  };

  onMouseLeave = ({ currentTarget }: KonvaEventObject<MouseEvent>) => {
    if (CseMachine.getPrintableMode()) return;
    setUnhoveredCursor(currentTarget);
    this.labelRef.current?.hide();
    this.hideCapturedState();
  };

  /** Show the captured control/stash as a perpendicular mini-visualization on hover */
  private showCapturedState(target: Konva.Node) {
    if (this.capturedControlTexts.length === 0 && this.capturedStashTexts.length === 0) return;
    const layer = target.getLayer();
    if (!layer) return;
    ContValue.clearHoverOverlay();

    const hoverGroup = new Konva.Group();
    this._hoverGroup = hoverGroup;
    ContValue._activeHoverGroup = hoverGroup;

    // Dimming overlay
    const stage = target.getStage();
    hoverGroup.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: stage?.width() ?? 5000,
        height: stage?.height() ?? 5000,
        fill: '#000',
        opacity: 0.4,
        listening: false
      })
    );

    const fontSize = ControlStashConfig.FontSize - 2;
    const font = `normal ${fontSize}px ${ControlStashConfig.FontFamily}`;
    const padding = 6;
    const gap = 3;
    const cornerRadius = 3;
    const stroke = defaultStrokeColor();
    const bg = defaultBackgroundColor();
    const textFill = defaultTextColor();
    const cx = this.centerX;
    const cy = this.y();

    // Control items: vertical stack going downward from the cont circle
    let controlY = cy + this.radius + 10;
    for (const text of this.capturedControlTexts) {
      const tw = getTextWidth(text, font);
      const w = tw + padding * 2;
      const h = fontSize + padding * 2;
      const x = cx - w / 2;
      hoverGroup.add(
        new Konva.Rect({
          x, y: controlY, width: w, height: h,
          fill: bg, stroke, cornerRadius, listening: false
        })
      );
      hoverGroup.add(
        new Konva.Text({
          x: x + padding, y: controlY + padding,
          text, fontSize, fontFamily: ControlStashConfig.FontFamily,
          fill: textFill, listening: false
        })
      );
      controlY += h + gap;
    }

    // Stash items: horizontal row going to the right from the cont circle
    let stashX = cx + this.radius + 10;
    const stashY = cy - (fontSize + padding * 2) / 2;
    for (const text of this.capturedStashTexts) {
      const tw = getTextWidth(text, font);
      const w = tw + padding * 2;
      const h = fontSize + padding * 2;
      hoverGroup.add(
        new Konva.Rect({
          x: stashX, y: stashY, width: w, height: h,
          fill: bg, stroke, cornerRadius, listening: false
        })
      );
      hoverGroup.add(
        new Konva.Text({
          x: stashX + padding, y: stashY + padding,
          text, fontSize, fontFamily: ControlStashConfig.FontFamily,
          fill: textFill, listening: false
        })
      );
      stashX += w + gap;
    }

    // Labels for the two axes
    const labelFontSize = fontSize - 2;
    const labelFont = `bold ${labelFontSize}px ${ControlStashConfig.FontFamily}`;
    if (this.capturedControlTexts.length > 0) {
      hoverGroup.add(
        new Konva.Text({
          x: cx - getTextWidth('C', labelFont) / 2,
          y: cy + this.radius + 10 - labelFontSize - 4,
          text: 'C',
          fontSize: labelFontSize,
          fontStyle: 'bold',
          fontFamily: ControlStashConfig.FontFamily,
          fill: stroke,
          listening: false
        })
      );
    }
    if (this.capturedStashTexts.length > 0) {
      hoverGroup.add(
        new Konva.Text({
          x: cx + this.radius + 10,
          y: stashY - labelFontSize - 4,
          text: 'S',
          fontSize: labelFontSize,
          fontStyle: 'bold',
          fontFamily: ControlStashConfig.FontFamily,
          fill: stroke,
          listening: false
        })
      );
    }

    layer.add(hoverGroup);
    // Bring the cont circle itself above the dimming overlay
    this.ref.current?.moveToTop();
    this._arrow?.ref.current?.moveToTop();
  }

  private hideCapturedState() {
    if (this._hoverGroup) {
      this._hoverGroup.destroy();
      this._hoverGroup = undefined;
      ContValue._activeHoverGroup = undefined;
    }
  }

  draw(): React.ReactNode {
    if (this.enclosingFrame) {
      this._arrow = new ArrowFromFn(this).to(this.enclosingFrame) as ArrowFromFn;
    }
    const textColor = this.isLive() ? defaultTextColor() : fadedTextColor();
    const strokeColor = this.isLive() ? defaultStrokeColor() : fadedStrokeColor();

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
