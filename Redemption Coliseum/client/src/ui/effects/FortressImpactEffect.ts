import Phaser from "phaser";
import { CardUI } from "../CardUI";

/**
 * Verwaltet die visuellen Effekte (Sound, Shake, Partikel) beim Ausspielen
 * von Fortress- oder Site-Karten.
 */
export class FortressImpactEffect {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public playAudio(card: CardUI) {
    this.scene.game.events.emit("playSound", "FORTRESS_IMPACT"); // ✨ FIX: Globaler Bus
  }

  /**
   * Spielt den kompletten Effekt ab.
   * @param card Die Karte, auf der der Effekt zentriert werden soll.
   */
  public play(card: CardUI) {
    this.playAudio(card);
    this.scene.cameras.main.shake(420, 0.04);
    this._createRocksTweens(card, 12);
    this._createDustBurst(card, 22);
  }

  private _randomEdgePoint(bounds: Phaser.Geom.Rectangle): {
    x: number;
    y: number;
  } {
    const side = Phaser.Math.Between(0, 3);
    switch (side) {
      case 0:
        return {
          x: Phaser.Math.Between(bounds.left, bounds.right),
          y: bounds.top,
        };
      case 1:
        return {
          x: Phaser.Math.Between(bounds.left, bounds.right),
          y: bounds.bottom,
        };
      case 2:
        return {
          x: bounds.left,
          y: Phaser.Math.Between(bounds.top, bounds.bottom),
        };
      default:
        return {
          x: bounds.right,
          y: Phaser.Math.Between(bounds.top, bounds.bottom),
        };
    }
  }

  private _weightedChoice<T>(items: T[], weights: number[]): T {
    let r = Math.random(),
      acc = 0;
    for (let i = 0; i < items.length; i++) {
      acc += weights[i];
      if (r <= acc) return items[i];
    }
    return items[items.length - 1];
  }

  private _tweenRock(
    rock: Phaser.GameObjects.Image,
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    hopHeight: number,
    duration: number,
  ) {
    const baseScaleX = rock.scaleX;
    const baseScaleY = rock.scaleY;

    const shadow = this.scene.add
      .ellipse(sx, sy + 8, 40 * baseScaleX, 18 * baseScaleY, 0x000000, 0.35)
      .setOrigin(0.5);
    shadow.setDepth(rock.depth - 1 || 0);
    rock.setDepth(2);

    const rollFreq = Phaser.Math.FloatBetween(1.5, 3.0);
    const rollPhase = Math.random() * Math.PI * 2;

    const progress = { p: 0 };
    this.scene.tweens.add({
      targets: progress,
      p: 1,
      duration,
      ease: "Cubic.easeOut",
      onUpdate: () => {
        const p = progress.p;
        rock.x = Phaser.Math.Linear(sx, tx, p);
        rock.y =
          Phaser.Math.Linear(sy, ty, p) - Math.sin(p * Math.PI) * hopHeight;

        const rollProg = p * rollFreq * Math.PI * 2 + rollPhase;
        const tilt = Math.sin(rollProg);
        rock.setScale(
          baseScaleX * (1 + tilt * 0.05),
          baseScaleY * (1 - tilt * 0.1),
        );

        shadow.setPosition(rock.x, rock.y + hopHeight * 0.12 + p * 6);
        shadow.setScale(1 - p * 0.8, (1 - p * 0.8) * 0.6);
        shadow.setAlpha(0.35 * (1 - p * 0.6));
      },
      onComplete: () => {
        this.scene.tweens.add({
          targets: [rock, shadow],
          alpha: { from: 1, to: 0 },
          duration: 420,
          delay: Phaser.Math.Between(150, 600),
          onComplete: () => {
            rock.destroy();
            shadow.destroy();
          },
        });
      },
    });

    this.scene.tweens.add({
      targets: rock,
      angle: { from: 0, to: Phaser.Math.Between(180, 540) },
      duration: duration,
      ease: "Sine.easeInOut",
    });
  }

  private _createRocksTweens(card: CardUI, count: number) {
    // ✨ FIX: Nutze manuelle Berechnung statt getBounds(), da der Glow-Emitter die Bounds verfälscht.
    // CardUI ist zentriert (x,y ist die Mitte).
    const width = card.displayWidth;
    const height = card.displayHeight;
    const bounds = new Phaser.Geom.Rectangle(
      card.x - width / 2,
      card.y - height / 2,
      width,
      height,
    );
    const cx = card.x;
    const cy = card.y;

    for (let i = 0; i < count; i++) {
      const rockKey = "rock" + Phaser.Math.Between(1, 5);
      const scale = Phaser.Math.FloatBetween(0.12, 0.28);
      const { x: sx, y: sy } = this._randomEdgePoint(bounds);

      const rock = this.scene.add
        .image(sx, sy, rockKey)
        .setScale(scale)
        .setOrigin(0.5);

      let angle =
        Phaser.Math.Angle.Between(cx, cy, sx, sy) +
        Phaser.Math.DegToRad(Phaser.Math.Between(-18, 18));
      const hopDist = Phaser.Math.Between(60, 130);
      const tx = sx + Math.cos(angle) * hopDist + Phaser.Math.Between(-10, 10);
      const ty = sy + Math.sin(angle) * hopDist + Phaser.Math.Between(-10, 10);
      const duration = Phaser.Math.Between(500, 700);
      const hopHeight = Phaser.Math.Between(36, 90);

      this._tweenRock(rock, sx, sy, tx, ty, hopHeight, duration);
    }
  }

  private _createDustBurst(card: CardUI, total: number) {
    const dustKeys = ["dust1", "dust2", "dust3", "dust4", "dust5"];
    const weights = [0.4, 0.28, 0.16, 0.1, 0.06];

    // ✨ FIX: Auch hier manuelle Bounds-Berechnung.
    const width = card.displayWidth;
    const height = card.displayHeight;
    const bounds = new Phaser.Geom.Rectangle(
      card.x - width / 2,
      card.y - height / 2,
      width,
      height,
    );

    const particles = this.scene.add.particles(0, 0, dustKeys[0], {
      lifespan: { min: 600, max: 1200 },
      alpha: { start: 1, end: 0 },
      scale: { start: 0.6, end: 1.2 },
      gravityY: -30,
      speed: { min: 20, max: 60 },
      quantity: 0,
    });
    particles.setDepth(card.depth + 1);

    for (let i = 0; i < total; i++) {
      const texKey = this._weightedChoice(dustKeys, weights);
      particles.setTexture(texKey);

      const { x: px, y: py } = this._randomEdgePoint(bounds);
      particles.emitParticleAt(px, py, 1);
    }

    this.scene.time.delayedCall(1500, () => particles.destroy());
  }
}
