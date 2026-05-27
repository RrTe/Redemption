import { BaseLoadingScene } from "./BaseLoadingScene";
import { type TypedRoom } from "../ui/gameUI";
import { type SoundManager } from "../managers/SoundManager"; // ✨ NEU
import { log } from "../utils/logger";

export class GameLoadingScene extends BaseLoadingScene {
  private room!: TypedRoom;

  constructor() {
    super("GameLoadingScene");
  }

  init(data: { room: TypedRoom }) {
    this.room = data.room;
  }

  protected createBackground(width: number, height: number) {
    // Wir nutzen das Bild aus der Lobby, falls es schon im Cache ist
    if (this.textures.exists("bg_temple")) {
      this.add
        .image(width / 2, height / 2, "bg_temple")
        .setOrigin(0.5)
        .setAlpha(0.3)
        .setDisplaySize(
          Math.max(
            width,
            this.textures.get("bg_temple").getSourceImage().width,
          ),
          Math.max(
            height,
            this.textures.get("bg_temple").getSourceImage().height,
          ),
        );
    } else {
      super.createBackground(width, height);
    }
  }

  protected loadAssets(): void {
    // === UI & Buttons ===
    // ✨ FIX: Use correct asset paths from CardGameScene
    this.load.image(
      "button_next_phase",
      "assets/ui/buttons/arrow-7722394_smaller.png",
    );
    this.load.image(
      "button_settings",
      "assets/ui/buttons/button-gold-7850928_1920.png",
    );
    // ✨ NEU: Save Button Icon
    this.load.image("button_save", "assets/ui/buttons/Save_small.png");
    // ✨ NEU: Eigenes Icon für den Chat (hier kannst du deine Datei ablegen)
    this.load.image(
      "button_chat",
      "assets/ui/buttons/Button_Chat_Copilot_20260216_130131_small.png",
    );
    // ✨ NEU: Help Button
    this.load.image(
      "button_help",
      "assets/ui/buttons/Button_Help_Copilot_20260216_130131_small.png",
    );
    // ✨ NEU: Concede Button
    this.load.image(
      "button_concede",
      "assets/ui/buttons/white_flag_small_compressed.png",
    );
    this.load.image("arrow_left", "assets/ui/buttons/arrow-left_small.png");
    this.load.image("arrow_right", "assets/ui/buttons/arrow-right_small.png");
    // Parchment button is already loaded in LobbyScene, but we load it here again for safety
    this.load.image(
      "button_parchment",
      "assets/ui/buttons/ChatGPT_Parchment_Button_dark_cracked_transp1_small.png",
    );
    // ✨ NEU: Scroll-Hintergrund für Settings
    this.load.image("scroll_bg", "assets/ui/paper-8527340_optimised.png");
    this.load.image("chat_bg", "assets/ui/paper-548643_small_optimised.jpg"); // ✨ NEU: Chat-Hintergrund
    this.load.image(
      "icon_from_top_of_pile",
      "assets/ui/icons/icon_from_top_of_pile.png",
    );
    this.load.image(
      "icon_from_bottom_of_pile",
      "assets/ui/icons/icon_from_bottom_of_pile.png",
    );
    this.load.image("icon_topdeck", "assets/ui/icons/icon_topdeck.png");
    this.load.image("icon_underdeck", "assets/ui/icons/icon_underdeck.png");

    // === Phasen Icons ===
    this.load.image("icon_preparation", "assets/ui/icons/icon_preparation.png");
    this.load.image("icon_draw", "assets/ui/icons/icon_draw.png");
    this.load.image("icon_upkeep", "assets/ui/icons/icon_upkeep.png");
    this.load.image("icon_battle", "assets/ui/icons/icon_battle.png");
    this.load.image("icon_discard", "assets/ui/icons/icon_discard.png");

    // === Radial Menu Icons ===
    this.load.image("icon_search", "assets/ui/icons/icon_search.png");
    this.load.image("icon_look", "assets/ui/icons/icon_look.png");
    this.load.image("icon_reveal", "assets/ui/icons/icon_reveal.png");
    this.load.image("icon_shuffle", "assets/ui/icons/icon_shuffle.png");
    this.load.image("icon_turn", "assets/ui/icons/icon_turn.png");
    this.load.image("icon_flip", "assets/ui/icons/icon_flip.png");
    this.load.image("icon_paralyze", "assets/ui/icons/icon_paralyze.png");
    this.load.image("icon_setaside", "assets/ui/icons/icon_setaside.png");

    // === Stapel & Zonen ===
    // ✨ FIX: Use correct asset paths from CardGameScene
    this.load.image("pile_discard", "assets/gfx/Empty_Discard_Pile.png");
    this.load.image("pile_banish", "assets/gfx/Empty_Banish_Pile.png");
    this.load.image("pile_lor", "assets/gfx/Empty_LoR_Pile.png");
    this.load.image("pile_empty", "assets/gfx/Empty_Pile.jpg");
    this.load.image(
      "pile_empty_opponent",
      "assets/gfx/Empty_Pile_Opponent.jpg",
    );

    // ✨ NEU: Spezifische Platzhalter für Discard, Banish, LoR (aus CardGameScene übernommen)
    // Hinweis: Einige Pfade waren doppelt/unterschiedlich, wir nutzen hier die korrekten aus CardGameScene
    // pile_discard etc. wurden oben schon geladen, aber wir stellen sicher, dass alles da ist.

    // ✨ NEU: Icons für Symbol-Zoom-Effekte
    this.load.image("icon_cross", "assets/gfx/icon_cross.png");
    this.load.image("icon_bible", "assets/gfx/icon_bible.png");
    this.load.image("icon_skull", "assets/gfx/icon_skull.png");
    this.load.image("icon_dragon", "assets/gfx/icon_dragon.png");
    this.load.image("icon_artifact", "assets/gfx/icon_artifact.png");

    // === Effekte & Partikel ===
    // ✨ FIX: Use correct asset paths from CardGameScene
    this.load.image("drop_shadow", "assets/gfx/drop_shadow.png");
    this.load.image("spark", "assets/gfx/Sparkle.png");
    this.load.image("blue_corona", "assets/gfx/blue_corona.png");
    this.load.image("blue_sparkle", "assets/gfx/blue_sparkle.png");
    this.load.image("blue_spark_small", "assets/gfx/blue_spark_small.png");
    this.load.image("blue_aura_small", "assets/gfx/blue_aura_small.png");
    this.load.image("blue_lightning", "assets/gfx/blue_ligthtning_small.png");

    // ✨ NEU: Partikel (Rocks, Dust, Smoke)
    for (let i = 1; i <= 5; i++)
      this.load.image("rock" + i, "assets/gfx/rock" + i + "_small.png");
    for (let i = 1; i <= 5; i++)
      this.load.image("dust" + i, "assets/gfx/dust" + i + "_small.png");
    this.load.image("smoke1", "assets/gfx/smoke1.png");
    this.load.image("smoke2", "assets/gfx/smoke2.png");
    this.load.image("smoke3", "assets/gfx/smoke3.png");

    // === Attach Icons ===
    this.load.image(
      "icon_attach_target",
      "assets/ui/icons/icon_attach_target.png",
    );
    this.load.image("icon_attach", "assets/ui/icons/icon_attach.png");
    this.load.image(
      "icon_attach_success",
      "assets/ui/icons/icon_attach_success.png",
    );

    // === Karten ===
    this.load.image({
      key: "card-back",
      url: "assets/cards/cardback.jpg",
      config: { mipmaps: true },
    } as any);

    // === Hintergründe (Heavy Assets!) ===
    // Temple
    this.load.image(
      "bg_temple",
      "assets/backgrounds/Copilot_Hintergrrund_Temple_ganz_neu.png",
    );
    this.load.image("bg_flame", "assets/particles/flame_particle.png");
    this.load.image("bg_spark", "assets/particles/spark.png");
    this.load.image("bg_light_glow", "assets/particles/lightGlow.png");

    // Garden
    this.load.image(
      "bg_garden",
      "assets/backgrounds/Copilot_20251019_000934_Garten2.png",
    );
    this.load.image(
      "bg_garden_mask1",
      "assets/backgrounds/Copilot_20251019_180730_Garten2_Maske_neu1.png",
    );
    this.load.image(
      "bg_garden_mask2",
      "assets/backgrounds/Copilot_20251019_180730_Garten2_Maske_neu2.png",
    );
    this.load.image(
      "bg_garden_mask3",
      "assets/backgrounds/Copilot_20251019_180730_Garten2_Maske_neu3.png",
    );

    // Place
    this.load.image(
      "bg_place",
      "assets/backgrounds/Copilot_Hintergrrund_Platz.png",
    );
    this.load.image("bg_dust", "assets/particles/Staubpartikel.png");
    this.load.image("bg_leaf1", "assets/particles/autumn-leaf-7453312_100.png");
    this.load.image("bg_leaf2", "assets/particles/maple-150742_120.png");
    this.load.image("bg_leaf3", "assets/particles/leaf-1010778_80.png");

    // === Audio ===
    this.load.audio("cardDraw", "assets/sounds/effects/crumple-03-40747.mp3");
    this.load.audio(
      "cardPlay",
      "assets/sounds/effects/rustling-grass-4-101281.mp3",
    );
    this.load.audio(
      "fortressImpact",
      "assets/sounds/effects/earth-magic-3-378600.mp3",
    );
    this.load.audio(
      "goodDominantSound",
      "assets/sounds/effects/chime-366446.mp3",
    );
    this.load.audio(
      "evilDominantSound",
      "assets/sounds/effects/whoosh-drama-383028.mp3",
    );
    this.load.audio("menu_open", "assets/sounds/effects/menu/open.mp3");
    this.load.audio("menu_hover", "assets/sounds/effects/menu/hover.mp3");
    this.load.audio("menu_select", "assets/sounds/effects/menu/select.mp3");
    this.load.audio(
      "ui_switch",
      "assets/sounds/effects/49053354-switch-2-307459.mp3",
    );
    this.load.audio("cardShuffle", "assets/sounds/effects/shuffle-92719.mp3");
    this.load.audio("page_flip", "assets/sounds/effects/pageflip_01-81244.mp3");
    this.load.audio(
      "cardHover",
      "assets/sounds/effects/rustling-of-chips-bag-100788.mp3",
    );
    this.load.audio(
      "cardHoverField",
      "assets/sounds/effects/whoosh-motion-405445.mp3",
    );
    this.load.audio(
      "clack",
      "assets/sounds/effects/drumsticks-pro-mark-la-special-2bn-hickory-no4-103712.mp3",
    );
    this.load.audio("whoosh", "assets/sounds/effects/air-whoosh-380651.mp3");
    this.load.audio(
      "shimmer",
      "assets/sounds/effects/massive-thump-116359.mp3",
    );
    this.load.audio(
      "ambience_temple",
      "assets/sounds/ambience/meditative-middle-eastern-flute-113656.mp3",
    );
    this.load.audio(
      "ambience_garden",
      "assets/sounds/ambience/night-atmosphere-with-crickets-374652.mp3",
    );
    this.load.audio(
      "sfx_owl",
      "assets/sounds/ambience/tawny-owl-in-molkom-sweden-99897.mp3",
    );
    this.load.audio(
      "ambience_place",
      "assets/sounds/ambience/wind-western-64661.mp3",
    );

    // === Fonts (wird in LobbyScene geladen) ===
    // Die "fairydust" Schriftart wird bereits in der Lobby geladen und ist daher verfügbar.
    // Wir müssen sie hier nicht erneut laden.

    // ✨ NEU: Wazoo Schriftart für bessere Lesbarkeit im Spiel
    this.load.bitmapFont(
      "wazoo",
      "assets/fonts/bitmap/Wazoo.png",
      "assets/fonts/bitmap/Wazoo.xml",
    );
  }

  protected onLoadComplete(): void {
    log(
      "GameLoadingScene",
      "All assets loaded. Transitioning to CardGameScene.",
    );
    // ✨ NEU: Jetzt, wo alles geladen ist, blenden wir die Lobby-Musik aus.
    const soundManager = this.registry.get("soundManager") as SoundManager;

    if (soundManager) {
      // ✨ FIX: Übergebe 'this' (die aktuelle Szene), damit der Tween sicher ausgeführt werden kann.
      soundManager.stopMusic(1000, this).then(() => {
        this.scene.start("CardGame", { room: this.room });
      });
    } else {
      this.scene.start("CardGame", { room: this.room });
    }
  }
}
