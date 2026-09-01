import Phaser from "phaser";

const fragShader = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define highmedp highp
#else
#define highmedp mediump
#endif
precision highmedp float;

uniform sampler2D uMainSampler;
uniform float uTime;
varying vec2 outTexCoord;

void main (void)
{
    vec2 uv = outTexCoord;

    // =========================================================================
    // 🎛️ EINSTELLUNGEN / TUNING PARAMETERS (hier anpassen):
    // =========================================================================
    float WAVE_INTENSITY = 0.0012;        // Stärke der Wellenbewegung (z.B. 0.0010 = extrem fein, 0.0030 = stärker)
    float WAVE_SPEED = 0.70;              // Geschwindigkeit der Wellen (z.B. 0.5 = sehr langsam, 1.5 = schnell)
    float CHROMATIC_SPLIT = 0.0004;       // Lichtbrechung / Farbsaum (z.B. 0.0 = aus, 0.001 = leicht)
    float DESATURATION = 0.28;            // Entsättigung (0.0 = Originalfarben, 1.0 = komplett Grau)
    vec3 TINT_COLOR = vec3(0.68, 0.72, 0.80); // Helligkeit & Farbfilter (1.0 = Original, < 1.0 = abgedunkelt)
    // =========================================================================

    // Kantenmaske: Dämpft die Verzerrung am Rand auf exakt 0, damit der Rahmen stabil bleibt
    float edgeX = smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x);
    float edgeY = smoothstep(0.0, 0.08, uv.y) * smoothstep(1.0, 0.92, uv.y);
    float edgeFactor = edgeX * edgeY;

    // Sanfte Flüssigkeits-Wellen
    float t = uTime * WAVE_SPEED;
    float waveX = (sin(uv.y * 16.0 + t * 1.3) * 0.7 + cos((uv.x + uv.y) * 12.0 - t * 1.0) * 0.4) * WAVE_INTENSITY * edgeFactor;
    float waveY = (cos(uv.x * 14.0 - t * 1.1) * 0.6 + sin(uv.y * 18.0 + t * 1.4) * 0.4) * WAVE_INTENSITY * edgeFactor;

    vec2 distortedUV = clamp(uv + vec2(waveX, waveY), 0.0, 1.0);

    // Farb-Sampling & subtiler Glanz
    vec4 col = texture2D(uMainSampler, distortedUV);
    if (CHROMATIC_SPLIT > 0.0) {
        float r = texture2D(uMainSampler, clamp(distortedUV + vec2(CHROMATIC_SPLIT * sin(t) * edgeFactor, 0.0), 0.0, 1.0)).r;
        float b = texture2D(uMainSampler, clamp(distortedUV - vec2(CHROMATIC_SPLIT * cos(t) * edgeFactor, 0.0), 0.0, 1.0)).b;
        col.r = mix(col.r, r, 0.35);
        col.b = mix(col.b, b, 0.35);
    }

    // Entsättigung und Abdunklung
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    col.rgb = mix(col.rgb, vec3(gray), DESATURATION);
    col.rgb *= TINT_COLOR;

    gl_FragColor = col;
}
`;

/**
 * WebGL Post-Processing Pipeline that applies real-time GLSL liquid wave displacement
 * and chromatic refraction directly to the card texture.
 */
export class LiquidDistortionPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({
      game,
      name: "LiquidDistortionPipeline",
      fragShader,
    });
  }

  onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    this.set1f("uTime", this.game.loop.time * 0.001);
    this.bindAndDraw(renderTarget);
  }
}
