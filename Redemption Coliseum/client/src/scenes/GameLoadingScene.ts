import { BaseLoadingScene } from "./BaseLoadingScene";
import { type TypedRoom } from "../ui/gameUI";
import { type SoundManager } from "../managers/SoundManager";
import { log } from "../utils/logger";
import { filterConfigData } from "../ui/config/filter_config";


export class GameLoadingScene extends BaseLoadingScene {
  private targetScene!: string;
  private targetData: any;
  private backgroundKey!: string;

  constructor() {
    super("GameLoadingScene");
  }

  init(data: any) {
    // Backward compatibility check for old { room: room } format
    if (data && data.room) {
      this.targetScene = "CardGame";
      this.targetData = { room: data.room };
      this.backgroundKey = "bg_temple";
    } else if (data) {
      this.targetScene = data.targetScene || "CardGame";
      this.targetData = data.targetData;
      this.backgroundKey = data.backgroundKey || "bg_temple";
    } else {
      this.targetScene = "CardGame";
      this.backgroundKey = "bg_temple";
    }
  }

  protected createBackground(width: number, height: number) {
    if (this.backgroundKey && this.textures.exists(this.backgroundKey)) {
      this.add
        .image(width / 2, height / 2, this.backgroundKey)
        .setOrigin(0.5)
        .setAlpha(0.5)
        .setDisplaySize(
          Math.max(
            width,
            this.textures.get(this.backgroundKey).getSourceImage().width,
          ),
          Math.max(
            height,
            this.textures.get(this.backgroundKey).getSourceImage().height,
          ),
        );
    } else {
      super.createBackground(width, height);
    }
  }

  protected loadAssets(): void {
    if (this.targetScene === "DeckEditorScene") {
      this.loadDeckEditorAssets();
    } else {
      this.loadCardGameAssets();
    }
  }

  private loadDeckEditorAssets() {
    log("GameLoadingScene", "Preloading DeckEditor Scene assets.");

    // Preload specific graphics and spritesheets for Deck Editor
    this.load.image("background", "assets/backgrounds/deck_editor_bg.jpg");
    this.load.image(
      "delete",
      "assets/deck-editor/symbols/cross_circle_small_compressed.png",
    );
    this.load.image(
      "symbolBGsmall",
      "assets/deck-editor/symbols/card_icon_small.png",
    );

    // Loaded from shared buttons
    this.load.image("arrowUp", "assets/ui/buttons/arrow-up_small.png");
    this.load.image("arrowDown", "assets/ui/buttons/arrow-down_small.png");
    this.load.image("load", "assets/deck-editor/symbols/Load_small.png");
    this.load.image("save", "assets/deck-editor/symbols/Save_small.png");
    this.load.image(
      "clear",
      "assets/ui/icons/delete_small_compressed.png",
    );
    this.load.image(
      "logout",
      "assets/deck-editor/symbols/Logout.png",
    );
    this.load.image(
      "battle",
      "assets/deck-editor/symbols/Battle.png",
    );
    this.load.image(
      "share",
      "assets/deck-editor/symbols/ShareURL_compressed.png",
    );
    this.load.image(
      "saveLackey",
      "assets/deck-editor/symbols/SaveLackey_compressed.png",
    );
    this.load.image(
      "loadLackey",
      "assets/deck-editor/symbols/LoadLackey_compressed.png",
    );
    this.load.image(
      "deckMetrics",
      "assets/deck-editor/symbols/chart_small.png",
    );

    this.load.image(
      "checkBoxUnChecked",
      "assets/ui/checkboxes/checkBox_Unchecked_compressed.png",
    );
    this.load.image(
      "checkBoxChecked",
      "assets/ui/checkboxes/checkBox_Checked_compressed.png",
    );

    // Spritesheets
    this.load.spritesheet(
      "symbols",
      "assets/deck-editor/symbols/Symbols_compressed.png",
      { frameWidth: 196, frameHeight: 155 },
    );
    this.load.spritesheet(
      "symbolsSelected",
      "assets/deck-editor/symbols/Symbols_Selected_compressed.png",
      { frameWidth: 196, frameHeight: 155 },
    );
    this.load.spritesheet(
      "symbolsSmall",
      "assets/deck-editor/symbols/Symbols_small_compressed.png",
      { frameWidth: 24, frameHeight: 19 },
    );
    this.load.spritesheet(
      "brigades",
      "assets/deck-editor/symbols/Brigades_compressed.png",
      { frameWidth: 196, frameHeight: 155 },
    );
    this.load.spritesheet(
      "brigadesSelected",
      "assets/deck-editor/symbols/Brigades_Selected_compressed.png",
      { frameWidth: 196, frameHeight: 155 },
    );

    // Load JSON config files
    this.load.json("symbols", "assets/deck-editor/symbols.json");
    this.load.json("brigades", "assets/deck-editor/brigades.json");
    this.load.json("texts", "assets/deck-editor/texts.json");

    // Fonts and audio
    this.load.bitmapFont(
      "fairyDust",
      "assets/fonts/bitmap/FairyDustB.png",
      "assets/fonts/bitmap/FairyDustB.xml",
    );
    this.load.bitmapFont(
      "wazoo",
      "assets/fonts/bitmap/Wazoo.png",
      "assets/fonts/bitmap/Wazoo.xml",
    );

    // Preload exact 12 standalone editor sounds
    this.load.audio(
      "checkButtonHover",
      "assets/deck-editor/sounds/swing-whoosh-110410_short.mp3",
    );
    this.load.audio(
      "checkButtonSelect",
      "assets/deck-editor/sounds/notification-sound-7062.mp3",
    );
    this.load.audio(
      "checkButtonDeselect",
      "assets/deck-editor/sounds/ToggleSwitchMetal PE1090917.mp3",
    );
    this.load.audio(
      "cardHover",
      "assets/deck-editor/sounds/TorchWhooshPanned PE1037805_short.mp3",
    );
    this.load.audio(
      "cardScroll",
      "assets/deck-editor/sounds/484967__spacejoe__quiet-page-turn-7.wav",
    );
    this.load.audio(
      "error",
      "assets/deck-editor/sounds/188013__isaac200000__error.wav",
    );
    this.load.audio("addCard", "assets/deck-editor/sounds/uisound1-79819.mp3");
    this.load.audio(
      "removeCard",
      "assets/deck-editor/sounds/Menu Selection Click.wav",
    );
    this.load.audio(
      "cardEntryOver",
      "assets/deck-editor/sounds/470377__erokia__menu-ui-click-140.wav",
    );
    this.load.audio(
      "ctrlBtn",
      "assets/deck-editor/sounds/clickswitch-03-104090.mp3",
    );
    this.load.audio(
      "clearDeck",
      "assets/deck-editor/sounds/cleardeck_short.mp3",
    );
    this.load.audio(
      "deckEditorBGM",
      "assets/deck-editor/sounds/rise-of-the-enemy-full-2-09-14302.mp3",
    );

    // Card back
    this.load.image("cardback", "assets/cards/cardback.jpg");

    // Preload deck metrics HTML overlay template
    this.load.html("deckMetrics", `templates/deckMetrics.html?v=${Date.now()}`);
    this.load.html("cardMetrics", `templates/cardMetrics.html?v=${Date.now()}`);

    // Preload first 60 card fronts for immediate display
    const cardDatabase = this.registry.get("cardDatabase") as any;
    const first60Cards = cardDatabase.cards.slice(0, 60);
    first60Cards.forEach((c: any) => {
      const key = `card-${c.ImageFile}`;
      const url = `assets/cards/${c.ImageFile}.jpg`;
      this.load.image(key, url);
    });
  }

  private loadCardGameAssets() {
    log("GameLoadingScene", "Preloading CardGame Scene assets.");

    // === Selection Dialog Filters & Checkboxes ===
    this.cache.json.add("filterConfig", filterConfigData);
    this.load.image("filterSelected_small", "assets/ui/filter-icons/selected_small.png");
    this.load.image("filterSelected_med", "assets/ui/filter-icons/selected_med.png");
    this.load.image("silver_cross_circle_med", "assets/ui/filter-icons/silver_cross_circle_med.png");
    this.load.image("silver_cross_circle_small", "assets/ui/filter-icons/silver_cross_circle_small.png");
    this.load.image("checkBoxUnChecked", "assets/ui/checkboxes/checkBox_Unchecked_compressed.png");
    this.load.image("checkBoxChecked", "assets/ui/checkboxes/checkBox_Checked_compressed.png");

    this.load.audio(
      "checkButtonHover",
      "assets/sounds/effects/swing-whoosh-110410_short.mp3",
    );
    this.load.audio(
      "checkButtonSelect",
      "assets/sounds/effects/notification-sound-7062.mp3",
    );
    this.load.audio(
      "checkButtonDeselect",
      "assets/sounds/effects/ToggleSwitchMetal PE1090917.mp3",
    );

    if (filterConfigData && filterConfigData.filters) {
      filterConfigData.filters.forEach((filter: any) => {
        if (filter.iconSmallPath) {
          this.load.image(`${filter.id}_small`, filter.iconSmallPath);
          const medPath = filter.iconSmallPath.replace("_small.png", "_med.png");
          this.load.image(`${filter.id}_med`, medPath);
          const largePath = filter.iconSmallPath.replace("_small.png", ".png");
          this.load.image(`${filter.id}`, largePath);
        }
      });
    }

    // === UI & Buttons ===
    this.load.image(
      "button_next_phase",
      "assets/ui/buttons/arrow-7722394_smaller.png",
    );
    this.load.image(
      "button_settings",
      "assets/ui/buttons/button-gold-7850928_1920.png",
    );
    this.load.image("button_save", "assets/ui/buttons/Save_small.png");
    this.load.image(
      "button_chat",
      "assets/ui/buttons/Button_Chat_Copilot_20260216_130131_small.png",
    );
    this.load.image(
      "button_help",
      "assets/ui/buttons/Button_Help_Copilot_20260216_130131_small.png",
    );
    this.load.image(
      "button_concede",
      "assets/ui/buttons/white_flag_small_compressed.png",
    );
    this.load.image("arrow_left", "assets/ui/buttons/arrow-left_small.png");
    this.load.image("arrow_right", "assets/ui/buttons/arrow-right_small.png");
    this.load.image(
      "button_parchment",
      "assets/ui/buttons/ChatGPT_Parchment_Button_dark_cracked_transp1_small.png",
    );
    this.load.image("scroll_bg", "assets/ui/paper-8527340_optimised.png");
    this.load.image("chat_bg", "assets/ui/paper-548643_small_optimised.jpg");
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
    this.load.image("icon_handcards", "assets/ui/icons/cardfan_small.png");

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
    this.load.image("pile_discard", "assets/gfx/Empty_Discard_Pile.png");
    this.load.image("pile_banish", "assets/gfx/Empty_Banish_Pile.png");
    this.load.image("pile_lor", "assets/gfx/Empty_LoR_Pile.png");
    this.load.image("pile_empty", "assets/gfx/Empty_Pile.jpg");
    this.load.image(
      "pile_empty_opponent",
      "assets/gfx/Empty_Pile_Opponent.jpg",
    );

    // === Icons für Symbol-Zoom-Effekte ===
    this.load.image("icon_cross", "assets/gfx/icon_cross.png");
    this.load.image("icon_bible", "assets/gfx/icon_bible.png");
    this.load.image("icon_skull", "assets/gfx/icon_skull.png");
    this.load.image("icon_dragon", "assets/gfx/icon_dragon.png");
    this.load.image("icon_artifact", "assets/gfx/icon_artifact.png");

    // === Effekte & Partikel ===
    this.load.image("drop_shadow", "assets/gfx/drop_shadow.png");
    this.load.image("star_symbol", "assets/ui/filter-icons/symbols/star.png");
    this.load.image("spark", "assets/gfx/Sparkle.png");
    this.load.image("blue_corona", "assets/gfx/blue_corona.png");
    this.load.image("blue_sparkle", "assets/gfx/blue_sparkle.png");
    this.load.image("blue_spark_small", "assets/gfx/blue_spark_small.png");
    this.load.image("blue_aura_small", "assets/gfx/blue_aura_small.png");
    this.load.image("blue_lightning", "assets/gfx/blue_ligthtning_small.png");

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

    // === Hintergründe ===
    this.load.image(
      "bg_temple",
      "assets/backgrounds/Copilot_Hintergrrund_Temple_ganz_neu.png",
    );
    this.load.image("bg_flame", "assets/particles/flame_particle.png");
    this.load.image("bg_spark", "assets/particles/spark.png");
    this.load.image("bg_light_glow", "assets/particles/lightGlow.png");

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

    this.load.bitmapFont(
      "wazoo",
      "assets/fonts/bitmap/Wazoo.png",
      "assets/fonts/bitmap/Wazoo.xml",
    );
  }

  protected onLoadComplete(): void {
    log(
      "GameLoadingScene",
      `All assets loaded. Transitioning to ${this.targetScene}.`,
    );
    const soundManager = this.registry.get("soundManager") as SoundManager;

    if (this.targetScene === "DeckEditorScene") {
      // Transition to DeckEditor (No music stopping needed to keep seamless Hub BGM!)
      this.scene.start("DeckEditorScene", this.targetData);
    } else {
      // Transition to CardGame (Stop Lobby music with fade out)
      if (soundManager) {
        soundManager.stopMusic(1000, this).then(() => {
          this.scene.start("CardGame", this.targetData);
        });
      } else {
        this.scene.start("CardGame", this.targetData);
      }
    }
  }
}
