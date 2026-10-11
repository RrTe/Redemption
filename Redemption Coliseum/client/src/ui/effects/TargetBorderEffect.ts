// client/src/ui/effects/TargetBorderEffect.ts
import Phaser from "phaser";

const RUBY_BASE_AURA = 0x380008;
const RUBY_BASE_MID = 0x700014;
const RUBY_BASE_CORE = 0x9e001c;
const WAVE_FLARE = 0x4a000c;
const WAVE_BEAM = 0x90001a;
const WAVE_CORE = 0xff8899;

/**
 * Reusable visual effect rendering a radiant deep-ruby energy beam border with a smooth,
 * incandescent traveling light wave and breathing pulsation (thicker/thinner).
 */
export class TargetBorderEffect {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private width: number;
  private height: number;
  private radius: number;

  private graphics: Phaser.GameObjects.Graphics | null = null;
  private glintTween: Phaser.Tweens.Tween | null = null;
  private glintProgress = { value: 0 };
  private isActive = false;

  constructor(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    width: number,
    height: number,
    radius: number = 8,
  ) {
    this.scene = scene;
    this.container = container;
    this.width = width;
    this.height = height;
    this.radius = Math.min(radius, width / 4, height / 4);
  }

  public setSize(width: number, height: number, radius?: number): void {
    this.width = width;
    this.height = height;
    if (radius !== undefined) {
      this.radius = Math.min(radius, width / 4, height / 4);
    }
    if (this.isActive) {
      this.draw();
    }
  }

  public show(visible: boolean): void {
    if (this.isActive === visible) return;
    this.isActive = visible;

    if (visible) {
      if (!this.graphics) {
        this.graphics = this.scene.add.graphics();
        this.graphics.setBlendMode(Phaser.BlendModes.ADD);
        this.container.add(this.graphics);
      }
      this.container.bringToTop(this.graphics);
      this.graphics.setVisible(true);

      this.glintTween = this.scene.tweens.add({
        targets: this.glintProgress,
        value: 1,
        duration: 3200,
        repeat: -1,
        ease: "Linear",
        onUpdate: () => this.draw(),
      });
    } else {
      if (this.glintTween) {
        this.glintTween.stop();
        this.glintTween = null;
      }
      if (this.graphics) {
        this.graphics.clear();
        this.graphics.setVisible(false);
      }
    }
  }

  public update(): void {
    if (this.isActive) {
      this.draw();
    }
  }

  public destroy(): void {
    this.show(false);
    if (this.graphics) {
      this.graphics.destroy();
      this.graphics = null;
    }
  }

  private draw(): void {
    if (!this.graphics || !this.isActive) return;
    const g = this.graphics;
    g.clear();

    const w = this.width;
    const h = this.height;
    const r = this.radius;
    const x = -w / 2;
    const y = -h / 2;

    // Organic breathing pulse: oscillates thickness between 0.70x and 1.15x
    const pulse = 0.72 + 0.38 * Math.sin(Date.now() * 0.0035);

    // 1. Layered luminous deep ruby bloom and aura strokes
    g.lineStyle(24 * pulse, RUBY_BASE_AURA, 0.28 * pulse);
    g.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, r + 2);

    g.lineStyle(11 * pulse, RUBY_BASE_MID, 0.55 * pulse);
    g.strokeRoundedRect(x - 1, y - 1, w + 2, h + 2, r + 1);

    g.lineStyle(4.5 * pulse, RUBY_BASE_CORE, 0.85);
    g.strokeRoundedRect(x, y, w, h, r);

    g.lineStyle(1.8 * pulse, WAVE_CORE, 0.95);
    g.strokeRoundedRect(x, y, w, h, r);

    // 2. Circulating incandescent light wave
    this.drawGlintBeam(g, w, h, r, pulse);
  }

  private drawGlintBeam(
    g: Phaser.GameObjects.Graphics,
    w: number,
    h: number,
    r: number,
    pulse: number,
  ): void {
    const centerT = this.glintProgress.value;
    const span = 0.32;
    const steps = 36;
    const stepSize = span / steps;

    for (let i = 0; i < steps; i++) {
      const u0 = -span / 2 + i * stepSize;
      const u1 = u0 + stepSize;

      const t0 = (centerT + u0 + 10) % 1;
      const t1 = (centerT + u1 + 10) % 1;

      const pt0 = this.getPointOnRoundedRect(t0, w, h, r);
      const pt1 = this.getPointOnRoundedRect(t1, w, h, r);

      const distFromCenter = Math.abs(u0 + stepSize / 2) / (span / 2);
      const intensity = Math.pow(Math.cos(distFromCenter * (Math.PI / 2)), 2);

      if (intensity <= 0.02) continue;

      const dx = Math.abs(pt0.x - pt1.x);
      const dy = Math.abs(pt0.y - pt1.y);
      if (dx > w / 3 || dy > h / 3) continue;

      g.lineStyle((14 + 6 * intensity) * pulse, WAVE_FLARE, 0.55 * intensity * pulse);
      g.lineBetween(pt0.x, pt0.y, pt1.x, pt1.y);

      g.lineStyle((6 + 3 * intensity) * pulse, WAVE_BEAM, 0.85 * intensity);
      g.lineBetween(pt0.x, pt0.y, pt1.x, pt1.y);

      g.lineStyle((2.2 + 1.2 * intensity) * pulse, WAVE_CORE, 1.0 * intensity);
      g.lineBetween(pt0.x, pt0.y, pt1.x, pt1.y);
    }

    // 3. Sparkling diamond star at peak of incandescent wave
    const peakPt = this.getPointOnRoundedRect(centerT, w, h, r);
    const starR = (6 + 3 * Math.sin(Date.now() * 0.009)) * pulse;
    g.lineStyle(2 * pulse, WAVE_CORE, 0.95);
    g.lineBetween(peakPt.x - starR, peakPt.y, peakPt.x + starR, peakPt.y);
    g.lineBetween(peakPt.x, peakPt.y - starR, peakPt.x, peakPt.y + starR);

    const diagR = starR * 0.5;
    g.lineStyle(1.2 * pulse, WAVE_CORE, 0.7);
    g.lineBetween(peakPt.x - diagR, peakPt.y - diagR, peakPt.x + diagR, peakPt.y + diagR);
    g.lineBetween(peakPt.x - diagR, peakPt.y + diagR, peakPt.x + diagR, peakPt.y - diagR);
  }

  private getPointOnRoundedRect(
    t: number,
    w: number,
    h: number,
    r: number,
  ): { x: number; y: number } {
    const straightW = w - 2 * r;
    const straightH = h - 2 * r;
    const cornerArc = (Math.PI * r) / 2;
    const totalP = 2 * straightW + 2 * straightH + 4 * cornerArc;
    let dist = t * totalP;

    // Top straight (moving right: -w/2 + r to w/2 - r)
    if (dist <= straightW) {
      return { x: -w / 2 + r + dist, y: -h / 2 };
    }
    dist -= straightW;

    // Top-right corner arc
    if (dist <= cornerArc) {
      const angle = -Math.PI / 2 + (dist / cornerArc) * (Math.PI / 2);
      return { x: w / 2 - r + Math.cos(angle) * r, y: -h / 2 + r + Math.sin(angle) * r };
    }
    dist -= cornerArc;

    // Right straight (moving down: -h/2 + r to h/2 - r)
    if (dist <= straightH) {
      return { x: w / 2, y: -h / 2 + r + dist };
    }
    dist -= straightH;

    // Bottom-right corner arc
    if (dist <= cornerArc) {
      const angle = (dist / cornerArc) * (Math.PI / 2);
      return { x: w / 2 - r + Math.cos(angle) * r, y: h / 2 - r + Math.sin(angle) * r };
    }
    dist -= cornerArc;

    // Bottom straight (moving left: w/2 - r to -w/2 + r)
    if (dist <= straightW) {
      return { x: w / 2 - r - dist, y: h / 2 };
    }
    dist -= straightW;

    // Bottom-left corner arc
    if (dist <= cornerArc) {
      const angle = Math.PI / 2 + (dist / cornerArc) * (Math.PI / 2);
      return { x: -w / 2 + r + Math.cos(angle) * r, y: h / 2 - r + Math.sin(angle) * r };
    }
    dist -= cornerArc;

    // Left straight (moving up: h/2 - r to -h/2 + r)
    if (dist <= straightH) {
      return { x: -w / 2, y: h / 2 - r - dist };
    }
    dist -= straightH;

    // Top-left corner arc
    const angle = Math.PI + (dist / cornerArc) * (Math.PI / 2);
    return { x: -w / 2 + r + Math.cos(angle) * r, y: -h / 2 + r + Math.sin(angle) * r };
  }
}
