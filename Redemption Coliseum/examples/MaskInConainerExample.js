class Example extends Phaser.Scene {
  constructor() {
    super();
  }

  preload() {
    this.load.setBaseURL("https://cdn.phaserfiles.com/v385/");
    this.load.image("pic", "assets/pics/cougar-dragonsun.png");
    this.load.image("star", "assets/demoscene/star3.png");
  }

  create() {
    // this.img = this.add.image(400, 300, 'pic');
    this.img = this.add.particles(400, 200, "star", {
      speed: 100,
      lifespan: 3000,
      gravityY: 200,
    });

    const maskGraphics = this.make.graphics().setVisible(false);
    this.msrc = maskGraphics;
    maskGraphics.fillStyle(0xffffff);
    maskGraphics.fillRect(100, 100, 256, 256);
    const mask = new Phaser.Display.Masks.GeometryMask(this, maskGraphics);

    this.img.setMask(mask);

    this.mask = mask;

    this.con = this.add.container(0, 0);
    this.con.add(this.img);
    this.con.add(maskGraphics);
  }
  update(time, delta) {
    // this.msrc.x += 1 * delta / 5
    // this.img.x += 1 * delta / 5
  }
}

const config = {
  type: Phaser.WEBGL,
  parent: "phaser-example",
  width: 800,
  height: 600,
  scene: Example,
};

const game = new Phaser.Game(config);
