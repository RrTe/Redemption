// client/src/ui/effects/TargetingArrowEffect.ts
import Phaser from "phaser";
import {
  TARGETING_ARROW_CONFIG,
  type TargetingAlignment,
} from "../config/targetingConfig";

export interface ArrowTarget {
  id: string;
  target: { x: number; y: number } | Phaser.GameObjects.GameObject;
  progress: number; // 0 to 1 during surge
  isDocked: boolean;
  dockBump: number; // Scale multiplier on docking
}

/**
 * Pure Phaser 3 visual effect rendering curved targeting arrows (Bezier curves)
 * with plastic drop shadow, alignment-based color themes, traveling energy stream,
 * and continuous arrowhead bobbing. Decoupled from Colyseus and network state.
 */
export class TargetingArrowEffect {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics | null = null;
  private source: { x: number; y: number } | Phaser.GameObjects.GameObject;
  private alignment: TargetingAlignment;
  private targets: Map<string, ArrowTarget> = new Map();
  private isDestroyed = false;
  private startTime: number;

  constructor(
    scene: Phaser.Scene,
    source: { x: number; y: number } | Phaser.GameObjects.GameObject,
    alignment: TargetingAlignment = "NEUTRAL"
  ) {
    this.scene = scene;
    this.source = source;
    this.alignment = alignment;
    this.startTime = Date.now();

    this.graphics = this.scene.add.graphics();
    this.graphics.setDepth(TARGETING_ARROW_CONFIG.DEPTHS.ARROW);
    this.scene.events.on("update", this.onUpdate, this);
  }

  public setAlignment(alignment: TargetingAlignment): void {
    this.alignment = alignment;
  }

  public setTarget(
    id: string,
    target: { x: number; y: number } | Phaser.GameObjects.GameObject,
    animateSurge = true
  ): void {
    if (this.isDestroyed) return;

    const existing = this.targets.get(id);
    if (existing) {
      existing.target = target;
      return;
    }

    const entry: ArrowTarget = {
      id,
      target,
      progress: animateSurge ? 0 : 1,
      isDocked: !animateSurge,
      dockBump: 1.0,
    };
    this.targets.set(id, entry);

    if (animateSurge) {
      this.scene.tweens.add({
        targets: entry,
        progress: 1,
        duration: TARGETING_ARROW_CONFIG.TIMINGS.SURGE_DURATION_MS,
        ease: TARGETING_ARROW_CONFIG.TIMINGS.SURGE_EASE,
        onComplete: () => {
          entry.isDocked = true;
          this.triggerDockBump(entry);
        },
      });
    }
  }

  public removeTarget(id: string): void {
    this.targets.delete(id);
  }

  public clearTargets(): void {
    this.targets.clear();
  }

  private triggerDockBump(entry: ArrowTarget): void {
    this.scene.tweens.add({
      targets: entry,
      dockBump: TARGETING_ARROW_CONFIG.TIMINGS.DOCK_BUMP_SCALE,
      duration: TARGETING_ARROW_CONFIG.TIMINGS.DOCK_BUMP_MS / 2,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: () => {
        entry.dockBump = 1.0;
      },
    });
  }

  private getSourcePos(): { x: number; y: number } {
    if ("getWorldTransformMatrix" in this.source && typeof (this.source as any).getWorldTransformMatrix === "function") {
      const mat = (this.source as any).getWorldTransformMatrix();
      return { x: mat.tx, y: mat.ty };
    }
    const anySource = this.source as any;
    return { x: anySource.x ?? 0, y: anySource.y ?? 0 };
  }

  private getTargetPos(target: ArrowTarget["target"]): { x: number; y: number } {
    if ("getWorldTransformMatrix" in target && typeof (target as any).getWorldTransformMatrix === "function") {
      const mat = (target as any).getWorldTransformMatrix();
      return { x: mat.tx, y: mat.ty };
    }
    const anyTarget = target as any;
    return { x: anyTarget.x ?? 0, y: anyTarget.y ?? 0 };
  }

  private onUpdate(): void {
    if (!this.graphics || this.isDestroyed || this.targets.size === 0) {
      this.graphics?.clear();
      return;
    }

    const g = this.graphics;
    g.clear();

    const p0 = this.getSourcePos();
    const elapsed = Date.now() - this.startTime;
    const palette = TARGETING_ARROW_CONFIG.PALETTES[this.alignment];
    const targetArray = Array.from(this.targets.values());
    const totalTargets = targetArray.length;

    targetArray.forEach((entry, idx) => {
      const rawP1 = this.getTargetPos(entry.target);
      const dx = rawP1.x - p0.x;
      const dy = rawP1.y - p0.y;
      const dist = Math.max(1, Math.hypot(dx, dy));

      // Calculate arch lift with multi-target branching fan-out
      const baseLift = Phaser.Math.Clamp(
        dist * TARGETING_ARROW_CONFIG.GEOMETRY.ARCH_LIFT_FACTOR,
        TARGETING_ARROW_CONFIG.GEOMETRY.MIN_ARCH_LIFT_PX,
        TARGETING_ARROW_CONFIG.GEOMETRY.MAX_ARCH_LIFT_PX
      );
      const fanSpread = totalTargets > 1 ? (idx - (totalTargets - 1) / 2) * 26 : 0;
      const normalX = -dy / dist;
      const normalY = dx / dist;

      // Arc peak control points (Cubic Bezier)
      const c1 = {
        x: p0.x + dx * 0.25 + normalX * (baseLift + fanSpread) * 0.9,
        y: p0.y + dy * 0.25 + normalY * (baseLift + fanSpread) * 0.9,
      };
      const c2 = {
        x: p0.x + dx * 0.75 + normalX * (baseLift + fanSpread * 0.5),
        y: p0.y + dy * 0.75 + normalY * (baseLift + fanSpread * 0.5),
      };

      // End point & direction with continuous sine bobbing when docked
      let p1 = { ...rawP1 };
      const tangentX = rawP1.x - c2.x;
      const tangentY = rawP1.y - c2.y;
      const tangentLen = Math.max(1, Math.hypot(tangentX, tangentY));
      const uDirX = tangentX / tangentLen;
      const uDirY = tangentY / tangentLen;

      if (entry.isDocked) {
        const bobOffset = Math.sin(elapsed * TARGETING_ARROW_CONFIG.MOTION.BOB_SPEED) *
          TARGETING_ARROW_CONFIG.MOTION.BOB_AMPLITUDE_PX;
        p1.x += uDirX * bobOffset;
        p1.y += uDirY * bobOffset;
      }

      const endT = entry.progress;

      // 1. Render Plastic Drop Shadow Layer
      this.drawBezierRibbon(g, p0, c1, c2, p1, endT, {
        offsetX: TARGETING_ARROW_CONFIG.SHADOW.OFFSET_X,
        offsetY: TARGETING_ARROW_CONFIG.SHADOW.OFFSET_Y,
        lineWidth: TARGETING_ARROW_CONFIG.GEOMETRY.BASE_LINE_WIDTH + 2,
        color: TARGETING_ARROW_CONFIG.SHADOW.COLOR,
        alpha: TARGETING_ARROW_CONFIG.SHADOW.ALPHA,
      });
      this.drawArrowhead(g, p0, c1, c2, p1, endT, entry.dockBump, {
        offsetX: TARGETING_ARROW_CONFIG.SHADOW.OFFSET_X,
        offsetY: TARGETING_ARROW_CONFIG.SHADOW.OFFSET_Y,
        fillColor: TARGETING_ARROW_CONFIG.SHADOW.COLOR,
        fillAlpha: TARGETING_ARROW_CONFIG.SHADOW.ALPHA,
      });

      // 2. Render Outer Aura Glow Layer
      this.drawBezierRibbon(g, p0, c1, c2, p1, endT, {
        lineWidth: TARGETING_ARROW_CONFIG.GEOMETRY.AURA_LINE_WIDTH,
        color: palette.AURA,
        alpha: palette.AURA_ALPHA,
      });

      // 3. Render Solid Body Beam Layer
      this.drawBezierRibbon(g, p0, c1, c2, p1, endT, {
        lineWidth: TARGETING_ARROW_CONFIG.GEOMETRY.BASE_LINE_WIDTH,
        color: palette.BEAM,
        alpha: palette.BEAM_ALPHA,
      });

      // 4. Render Organic Matter Stream (Traveling Pulses)
      this.drawMatterStream(g, p0, c1, c2, p1, endT, elapsed, palette.CORE, palette.CORE_ALPHA);

      // 5. Render Arrowhead at Spline Tip
      this.drawArrowhead(g, p0, c1, c2, p1, endT, entry.dockBump, {
        fillColor: palette.BEAM,
        fillAlpha: palette.BEAM_ALPHA,
        strokeColor: palette.CORE,
        strokeAlpha: palette.CORE_ALPHA,
      });
    });
  }

  private evaluateBezier(p0: any, c1: any, c2: any, p1: any, t: number): { x: number; y: number } {
    const inv = 1 - t;
    return {
      x: inv ** 3 * p0.x + 3 * inv ** 2 * t * c1.x + 3 * inv * t ** 2 * c2.x + t ** 3 * p1.x,
      y: inv ** 3 * p0.y + 3 * inv ** 2 * t * c1.y + 3 * inv * t ** 2 * c2.y + t ** 3 * p1.y,
    };
  }

  private drawBezierRibbon(
    g: Phaser.GameObjects.Graphics,
    p0: any, c1: any, c2: any, p1: any,
    maxT: number,
    style: { offsetX?: number; offsetY?: number; lineWidth: number; color: number; alpha: number }
  ): void {
    const steps = Math.max(12, Math.round(maxT * 32));
    const ox = style.offsetX ?? 0;
    const oy = style.offsetY ?? 0;

    g.lineStyle(style.lineWidth, style.color, style.alpha);
    g.beginPath();

    const startPt = this.evaluateBezier(p0, c1, c2, p1, 0);
    g.moveTo(startPt.x + ox, startPt.y + oy);

    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * maxT;
      const pt = this.evaluateBezier(p0, c1, c2, p1, t);
      g.lineTo(pt.x + ox, pt.y + oy);
    }
    g.strokePath();
  }

  private drawMatterStream(
    g: Phaser.GameObjects.Graphics,
    p0: any, c1: any, c2: any, p1: any,
    maxT: number,
    elapsed: number,
    coreColor: number,
    coreAlpha: number
  ): void {
    const pulseCount = TARGETING_ARROW_CONFIG.MOTION.STREAM_PULSE_COUNT;
    const pulseWidth = TARGETING_ARROW_CONFIG.MOTION.STREAM_PULSE_WIDTH;
    const cycle = (elapsed * TARGETING_ARROW_CONFIG.MOTION.STREAM_CYCLE_SPEED) % 1;

    for (let i = 0; i < pulseCount; i++) {
      const centerT = (cycle + i / pulseCount) % 1;
      if (centerT > maxT) continue;

      const tStart = Math.max(0, centerT - pulseWidth / 2);
      const tEnd = Math.min(maxT, centerT + pulseWidth / 2);
      if (tStart >= tEnd) continue;

      const steps = 8;
      for (let s = 0; s < steps; s++) {
        const u0 = tStart + (s / steps) * (tEnd - tStart);
        const u1 = tStart + ((s + 1) / steps) * (tEnd - tStart);
        const pt0 = this.evaluateBezier(p0, c1, c2, p1, u0);
        const pt1 = this.evaluateBezier(p0, c1, c2, p1, u1);

        const distFromCenter = Math.abs(u0 - centerT) / (pulseWidth / 2);
        const intensity = Math.cos(distFromCenter * (Math.PI / 2));
        if (intensity <= 0.05) continue;

        g.lineStyle(
          TARGETING_ARROW_CONFIG.GEOMETRY.CORE_LINE_WIDTH * (1 + 0.5 * intensity),
          coreColor,
          coreAlpha * intensity
        );
        g.lineBetween(pt0.x, pt0.y, pt1.x, pt1.y);
      }
    }
  }

  private drawArrowhead(
    g: Phaser.GameObjects.Graphics,
    p0: any, c1: any, c2: any, p1: any,
    t: number,
    bump: number,
    style: { offsetX?: number; offsetY?: number; fillColor: number; fillAlpha: number; strokeColor?: number; strokeAlpha?: number }
  ): void {
    const tip = this.evaluateBezier(p0, c1, c2, p1, t);
    const prevPt = this.evaluateBezier(p0, c1, c2, p1, Math.max(0, t - 0.03));
    const angle = Math.atan2(tip.y - prevPt.y, tip.x - prevPt.x);

    const ox = style.offsetX ?? 0;
    const oy = style.offsetY ?? 0;
    const len = TARGETING_ARROW_CONFIG.GEOMETRY.ARROWHEAD_LENGTH * bump;
    const halfW = (TARGETING_ARROW_CONFIG.GEOMETRY.ARROWHEAD_WIDTH * bump) / 2;
    const indent = TARGETING_ARROW_CONFIG.GEOMETRY.ARROWHEAD_INDENT * bump;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const tipX = tip.x + ox;
    const tipY = tip.y + oy;
    const leftX = tipX - len * cos - halfW * -sin;
    const leftY = tipY - len * sin - halfW * cos;
    const rightX = tipX - len * cos + halfW * -sin;
    const rightY = tipY - len * sin + halfW * cos;
    const indentX = tipX - (len - indent) * cos;
    const indentY = tipY - (len - indent) * sin;

    g.fillStyle(style.fillColor, style.fillAlpha);
    g.beginPath();
    g.moveTo(tipX, tipY);
    g.lineTo(leftX, leftY);
    g.lineTo(indentX, indentY);
    g.lineTo(rightX, rightY);
    g.closePath();
    g.fillPath();

    if (style.strokeColor !== undefined && style.strokeAlpha !== undefined) {
      g.lineStyle(1.6, style.strokeColor, style.strokeAlpha);
      g.strokePath();
    }
  }

  public fadeAndDestroy(durationMs = TARGETING_ARROW_CONFIG.TIMINGS.FADE_OUT_MS): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.graphics) {
      this.scene.tweens.add({
        targets: this.graphics,
        alpha: 0,
        duration: durationMs,
        onComplete: () => this.destroy(),
      });
    } else {
      this.destroy();
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.scene.events.off("update", this.onUpdate, this);
    if (this.graphics) {
      this.graphics.destroy();
      this.graphics = null;
    }
    this.targets.clear();
  }
}
