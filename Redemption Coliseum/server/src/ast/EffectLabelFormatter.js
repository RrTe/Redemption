// server/src/ast/EffectLabelFormatter.js
const { AST_ACTIONS, AST_SELECTION_MODES } = require("../../../shared/astConstants");
const { ActionType } = require("../../../shared/actions");
const { parseTargetCount } = require("./TargetCountResolver");

const PILE_SCOPES = new Set([
  "deck",
  "discard_pile",
  "discard",
  "reserve_pile",
  "reserve",
  "banish_pile",
  "banish",
  "artifact_pile",
  "artifact",
]);

/**
 * Formats AST abilities, individual effect steps, choice groups, and optional prompts
 * into human-readable labels and strips markup tokens for Effect Chronicle display.
 */
class EffectLabelFormatter {
  /**
   * Formats a target scope array into a clean human-readable string (e.g. "discard or reserve").
   *
   * @param {string[]} [scopeList] Array of AST scope strings.
   * @param {object} [options] Formatting options.
   * @param {boolean} [options.excludeInPlay=false] Whether to omit "in_play" from output.
   * @returns {string} Formatted scope string.
   */
  static formatScopeText(scopeList, { excludeInPlay = false } = {}) {
    if (!Array.isArray(scopeList) || scopeList.length === 0) return "";
    const cleaned = scopeList
      .map((s) => String(s || "").replace(/_pile/g, "").replace(/_/g, " ").trim())
      .filter((s) => s && (!excludeInPlay || s !== "in play"));
    const unique = [...new Set(cleaned)];
    return unique.join(" or ");
  }

  /**
   * Pluralizes a simple English noun or phrase for count > 1 target labels.
   *
   * @param {string} noun Singular noun or phrase.
   * @returns {string} Pluralized noun or phrase.
   */
  static pluralizeNoun(noun) {
    if (!noun) return "";
    const trimmed = noun.trim();
    if (trimmed.endsWith("s")) return trimmed;
    if (/hero$/i.test(trimmed)) return `${trimmed}es`;
    if (/[^aeiou]y$/i.test(trimmed)) return `${trimmed.slice(0, -1)}ies`;
    if (/(?:ch|sh|x|z)$/i.test(trimmed)) return `${trimmed}es`;
    return `${trimmed}s`;
  }

  /**
   * Builds normalized qualifier strings shared by band and target phrase formatters.
   *
   * @param {object} [target={}] AST target definition.
   * @returns {object} Preformatted qualifier fragments.
   */
  static formatTargetQualifiers(target = {}) {
    const brigadeStr =
      Array.isArray(target.brigades) && target.brigades.length > 0 && target.brigades.length <= 2
        ? `${target.brigades.join("/")} `
        : "";
    const testStr =
      target.testament === "OT"
        ? "O.T. "
        : target.testament === "NT"
          ? "N.T. "
          : target.testament
            ? `${target.testament} `
            : "";
    const refStr =
      Array.isArray(target.references) && target.references.length > 0 && target.references.length <= 2
        ? `${target.references.join("/")} `
        : "";
    const genericStr =
      target.is_generic === true ? "generic " : (target.is_generic === false ? "unique " : "");
    const humanStr =
      target.is_human === true ? "human " : (target.is_human === false ? "non-human " : "");
    const genderStr = target.gender ? `${String(target.gender).toLowerCase()} ` : "";
    const classes = Array.isArray(target.classes) ? target.classes.filter(Boolean) : [];
    const idents = (Array.isArray(target.identifiers) ? target.identifiers : [])
      .filter((id) => Boolean(id) && !(String(id).trim().toLowerCase() === "or" && classes.length > 0));
    return { brigadeStr, testStr, refStr, genericStr, humanStr, genderStr, classes, idents };
  }

  /**
   * Formats target qualifiers into a concise descriptor phrase.
   *
   * @param {object} [target] AST target definition.
   * @param {object} [options] Formatting options.
   * @param {boolean} [options.isBand=false] Whether formatting for a band action.
   * @returns {string} Concise target phrase.
   */
  static formatTargetPhrase(target = {}, { isBand = false } = {}) {
    if (!isBand && target?.selection_mode === AST_SELECTION_MODES.AUTOMATIC_SELF) {
      return "this card";
    }
    if (isBand && Array.isArray(target.card_titles) && target.card_titles.length > 0) {
      return target.card_titles.join(" or ");
    }

    const rawType = (target.target_type || (isBand ? "character" : "card")).replace(/_/g, " ");
    const quals = this.formatTargetQualifiers(target);
    if (!isBand && !target.target_type && Array.isArray(target.card_titles) && target.card_titles.length === 1 && quals.idents.length === 1) {
      const iden = quals.idents[0].replace(/_/g, " ").toLowerCase();
      return `${target.card_titles[0]} or ${iden}`;
    }
    const classStr = quals.classes.length > 0 ? quals.classes.map((c) => String(c).toLowerCase()).join(" or ") : "";

    if (isBand) {
      const idenStr = quals.idents.length > 0 ? `${quals.idents.join("/")} ` : "";
      const finalType = classStr || rawType;
      return `${quals.genericStr}${quals.brigadeStr}${quals.testStr}${quals.refStr}${quals.genderStr}${quals.humanStr}${idenStr}${finalType}`.trim();
    }

    const iden = quals.idents.length > 0 ? quals.idents[0].replace(/_/g, " ").toLowerCase() : "";
    const ADJECTIVE_IDENT_REGEX = /^(?:lone|blocked|unblocked|activated|captured|face[- ]?down|opposing|alone)$/;
    const baseNoun = classStr || rawType;
    const targetType = iden
      ? (ADJECTIVE_IDENT_REGEX.test(iden) ? `${iden} ${baseNoun}` : iden)
      : baseNoun;
    const alignLower = String(target.alignment || "").toLowerCase();
    const alignStr =
      alignLower && !targetType.toLowerCase().startsWith(alignLower)
        ? `${target.alignment} `
        : "";
    return `${alignStr}${quals.genericStr}${quals.brigadeStr}${quals.testStr}${quals.refStr}${quals.genderStr}${quals.humanStr}${targetType}`.trim();
  }

  /**
   * Formats a band target into a complete action phrase.
   *
   * @param {object} [target] AST target definition.
   * @param {object} [options] Formatting options.
   * @param {boolean} [options.isQuestion=false] Whether formatting as an interrogative prompt.
   * @returns {string} Formatted band action phrase.
   */
  static formatBandActionText(target = {}, { isQuestion = false } = {}) {
    if (Array.isArray(target.card_titles) && target.card_titles.length > 0) {
      const prep = isQuestion ? "with" : "to";
      return `Band ${prep} ${target.card_titles.join(" or ")}`;
    }

    const { maxCount: maxVal, minCount: minVal, fixedValue, isAll, isPlural } = parseTargetCount(target);

    let countPrefix = "a";
    if (isPlural) {
      if (isAll) countPrefix = "all";
      else if (minVal === 0) countPrefix = `up to ${maxVal}`;
      else if (fixedValue > 1 || minVal === maxVal) countPrefix = `${maxVal}`;
      else countPrefix = `${minVal}-${maxVal}`;
    }

    const rawType = (target.target_type || "character").replace(/_/g, " ");
    const quals = this.formatTargetQualifiers(target);

    if (isPlural) {
      if (
        (rawType === "character" || rawType === "evil character") &&
        quals.idents.length === 1 &&
        /^[A-Z]/.test(quals.idents[0])
      ) {
        const pluralIdent = this.pluralizeNoun(quals.idents[0]);
        const phrase = `${quals.genericStr}${quals.brigadeStr}${quals.testStr}${quals.refStr}${quals.genderStr}${quals.humanStr}${pluralIdent}`.trim();
        return `Band to ${countPrefix} ${phrase}`;
      }
      const idenStr = quals.idents.length > 0 ? `${quals.idents.join("/")} ` : "";
      const pluralClass = quals.classes.length > 0 ? this.pluralizeNoun(quals.classes.join(" or ").toLowerCase()) : "";
      const typeLabel = pluralClass || this.pluralizeNoun(rawType);
      const phrase = `${quals.genericStr}${quals.brigadeStr}${quals.testStr}${quals.refStr}${quals.genderStr}${quals.humanStr}${idenStr}${typeLabel}`.trim();
      return `Band to ${countPrefix} ${phrase}`;
    }

    const phrase = this.formatTargetPhrase(target, { isBand: true });
    if (phrase && phrase !== "character") {
      return `Band to a ${phrase}`;
    }
    return isQuestion ? "Band a character into battle" : "Band to a character";
  }

  /**
   * Formats a protection_filter object into a readable "from ..." clause.
   *
   * @param {object} [protectionFilter={}] AST protection filter node.
   * @returns {string} Protection clause or empty string.
   */
  static formatProtectionClause(protectionFilter = {}) {
    if (!protectionFilter || typeof protectionFilter !== "object") return "";
    const parts = [];
    if (protectionFilter.from_harm) parts.push("harm");
    if (Array.isArray(protectionFilter.actions) && protectionFilter.actions.length > 0) {
      parts.push(protectionFilter.actions.map((a) => String(a).replace(/_/g, " ")).join("/"));
    }
    if (Array.isArray(protectionFilter.card_sources) && protectionFilter.card_sources.length > 0) {
      const sourceLabels = protectionFilter.card_sources
        .map((src) => this.formatTargetPhrase(src))
        .filter(Boolean);
      if (sourceLabels.length > 0) parts.push(sourceLabels.join(" or "));
    }
    return parts.length > 0 ? `from ${parts.join(", ")}` : "";
  }

  static _formatPileScopeSuffix(target = {}) {
    if (!Array.isArray(target?.scope) || target.scope.length === 0) return "";
    if (!target.scope.every((s) => PILE_SCOPES.has(String(s).toLowerCase()))) return "";
    const scope = this.formatScopeText(target.scope, { excludeInPlay: true });
    return scope ? ` from ${scope}` : "";
  }

  /**
   * Formats a single AST effect step into a concise, human-readable label.
   *
   * @param {object} effect AST effect node.
   * @param {object} [_card] Optional card instance.
   * @returns {string} Formatted single-effect label.
   */
  static formatSingleEffectLabel(effect, _card = null) {
    if (!effect || !effect.action) return "Activate Ability";
    const action = effect.action;
    const target = effect.target || {};
    const phrase = this.formatTargetPhrase(target);
    const scope = this.formatScopeText(target.scope, { excludeInPlay: true });
    const pileSuffix = this._formatPileScopeSuffix(target);

    switch (action) {
      case AST_ACTIONS.TOPDECK:
        return `Topdeck ${phrase}${scope ? ` from ${scope}` : ""}`;
      case AST_ACTIONS.UNDERDECK:
        return `Underdeck ${phrase}${scope ? ` from ${scope}` : ""}`;
      case AST_ACTIONS.BOUNCE:
      case AST_ACTIONS.RETURN_TO_HAND:
        return `Return ${phrase} to hand`;
      case AST_ACTIONS.BANISH:
      case AST_ACTIONS.REMOVE_FROM_THE_GAME:
        return `Banish ${phrase}${pileSuffix}`;
      case AST_ACTIONS.DISCARD:
        return `Discard ${phrase}${pileSuffix}`;
      case AST_ACTIONS.DRAW: {
        const count = target.count?.fixed_value || effect.count?.fixed_value || 1;
        return `Draw ${count} card(s)`;
      }
      case AST_ACTIONS.TAKE: {
        const count = target.count?.fixed_value || effect.count?.fixed_value;
        const countStr = count && count > 1 ? `${count} ` : "";
        const takeScope = this.formatScopeText(target.scope);
        return `Take ${countStr}${phrase}${takeScope ? ` from ${takeScope}` : ""}`;
      }
      case AST_ACTIONS.PLAY:
        return `Play ${phrase}${pileSuffix}`;
      case "reserve":
        if (target.selection_mode === AST_SELECTION_MODES.AUTOMATIC_SELF) {
          return "Reserve this card";
        }
        return `Reserve ${phrase}${pileSuffix}`;
      case AST_ACTIONS.SEARCH:
        return `Search ${phrase}${pileSuffix}`;
      case "look": {
        const lookScope = this.formatScopeText(target.scope) || "cards";
        const ownerPrefix = target.zone_owner === "opponent" ? "opponent's " : "";
        return `Look at ${ownerPrefix}${lookScope}`;
      }
      case AST_ACTIONS.PLACE: {
        const dest = effect.destination ? String(effect.destination).replace(/_pile/g, "").replace(/_/g, " ") : "play";
        return `Place ${phrase} in ${dest}`;
      }
      case AST_ACTIONS.BAND:
      case AST_ACTIONS.ADD_TO_BATTLE:
        return this.formatBandActionText(target, { isQuestion: false });
      case AST_ACTIONS.PROTECT:
      case AST_ACTIONS.IMMUNE:
      case AST_ACTIONS.SET_IMMUNITY: {
        const clause = this.formatProtectionClause(effect.protection_filter);
        const verb = action === AST_ACTIONS.IMMUNE || action === AST_ACTIONS.SET_IMMUNITY
          ? "Grant immunity to"
          : "Protect";
        return `${verb} ${phrase}${clause ? ` ${clause}` : ""}`;
      }
      case AST_ACTIONS.MODIFY_NUMBERS:
      case AST_ACTIONS.MODIFY_STATS:
      case AST_ACTIONS.INCREASE:
      case AST_ACTIONS.DECREASE: {
        let sDelta = typeof effect.strength_mod === "number" ? effect.strength_mod : 0;
        let tDelta = typeof effect.toughness_mod === "number" ? effect.toughness_mod : 0;
        if (action === AST_ACTIONS.DECREASE) {
          if (sDelta > 0) sDelta = -sDelta;
          if (tDelta > 0) tDelta = -tDelta;
        } else if (action === AST_ACTIONS.INCREASE) {
          if (sDelta < 0) sDelta = Math.abs(sDelta);
          if (tDelta < 0) tDelta = Math.abs(tDelta);
        }
        const sSign = sDelta >= 0 ? `+${sDelta}` : `${sDelta}`;
        const tSign = tDelta >= 0 ? `+${tDelta}` : `${tDelta}`;
        const verb = action === AST_ACTIONS.INCREASE ? "Increase" : (action === AST_ACTIONS.DECREASE ? "Decrease" : "Modify");
        return `${verb} ${phrase} (${sSign}/${tSign})`;
      }
      default: {
        const cleanVerb = String(action).replace(/_/g, " ").trim();
        const actLabel = cleanVerb.charAt(0).toUpperCase() + cleanVerb.slice(1);
        return target && Object.keys(target).length > 0 ? `${actLabel} ${phrase}`.trim() : actLabel;
      }
    }
  }

  /**
   * Formats an entire AST ability (single or multi-step) into a human-readable label.
   *
   * @param {object} ability AST ability node.
   * @param {object} [card] Card instance.
   * @returns {string} Ability label.
   */
  static formatAbilityChoiceLabel(ability, card = null) {
    if (!ability) return "Activate Ability";
    if (ability.description) return ability.description;
    if (!Array.isArray(ability.effects) || ability.effects.length === 0) {
      return ability.ability_id ? String(ability.ability_id).replace(/_/g, " ") : "Activate Ability";
    }
    const sorted = [...ability.effects].sort((a, b) => (a.step || 1) - (b.step || 1));
    const effectText = sorted.length === 1
      ? this.formatSingleEffectLabel(sorted[0], card)
      : sorted.map((e) => this.formatSingleEffectLabel(e, card)).join(" -> ");
    if (Array.isArray(ability.costs) && ability.costs.length > 0) {
      const costText = ability.costs
        .map((c) => {
          const base = this.formatSingleEffectLabel(c, card);
          const sc = this.formatScopeText(c?.target?.scope, { excludeInPlay: true });
          return sc && !base.toLowerCase().includes(`from ${sc.toLowerCase()}`)
            ? `${base} from ${sc}`
            : base;
        })
        .join(" & ");
      return `${costText} -> ${effectText}`;
    }
    return effectText;
  }

  /**
   * Formats a choice_group of abilities into a concise Chronicle label prior to player selection.
   *
   * @param {Array<object>} groupAbilities Abilities belonging to the choice group.
   * @param {object} [card] Card instance.
   * @returns {string} Concise choice summary label.
   */
  static formatChoiceGroupLabel(groupAbilities, card = null) {
    if (!Array.isArray(groupAbilities) || groupAbilities.length === 0) {
      return "Choose an effect";
    }
    const labels = [...new Set(groupAbilities.map((a) => this.formatAbilityChoiceLabel(a, card)).filter(Boolean))];
    if (labels.length === 0) return `Choose an effect (${groupAbilities.length} options)`;
    if (labels.length === 1) return labels[0];
    if (labels.length <= 2) {
      const combined = `Choose: ${labels.join(" / ")}`;
      if (combined.length <= 75) return combined;
    }
    return `Choose an effect (${groupAbilities.length} options)`;
  }

  /**
   * Generates a readable prompt question for optional abilities.
   *
   * @param {object} [effect] First effect in the ability definition.
   * @param {object} card Card object.
   * @param {object} [item] Chronicle item.
   * @returns {string} Prompt question.
   */
  static formatOptionalPromptText(effect, card, item = null) {
    const cardName = card?.Name || item?.title || "this card";
    if (!effect) {
      return `Activate the optional ability of ${cardName}?`;
    }
    const { displayCount: count } = parseTargetCount(effect.target, effect.count);
    switch (effect.action) {
      case AST_ACTIONS.DRAW:
        return `Draw ${count} card${count > 1 ? "s" : ""}?`;
      case AST_ACTIONS.DISCARD: {
        const phrase = this.formatTargetPhrase(effect.target);
        const pileSuffix = this._formatPileScopeSuffix(effect.target);
        const { isAll } = parseTargetCount(effect.target, effect.count);
        if (isAll) {
          return `Discard all ${this.pluralizeNoun(phrase)}${pileSuffix}?`;
        }
        if (count > 1) {
          return `Discard ${count} ${this.pluralizeNoun(phrase)}${pileSuffix}?`;
        }
        if (phrase && phrase !== "card") {
          return `Discard ${phrase}${pileSuffix}?`;
        }
        return `Discard ${count} card${pileSuffix}?`;
      }
      case AST_ACTIONS.BANISH:
      case AST_ACTIONS.REMOVE_FROM_THE_GAME: {
        const phrase = this.formatTargetPhrase(effect.target);
        const pileSuffix = this._formatPileScopeSuffix(effect.target);
        const { isAll } = parseTargetCount(effect.target, effect.count);
        if (isAll) {
          return `Banish all ${this.pluralizeNoun(phrase)}${pileSuffix}?`;
        }
        if (count > 1) {
          return `Banish ${count} ${this.pluralizeNoun(phrase)}${pileSuffix}?`;
        }
        if (phrase && phrase !== "card") {
          return `Banish ${phrase}${pileSuffix}?`;
        }
        return `Banish ${count} card${pileSuffix}?`;
      }
      case "look":
        return `${this.formatSingleEffectLabel(effect, card)}?`;
      case "look_and_choose":
        return "Search and choose from cards?";
      case AST_ACTIONS.BAND:
      case AST_ACTIONS.ADD_TO_BATTLE:
        return `${this.formatBandActionText(effect.target, { isQuestion: true })}?`;
      case AST_ACTIONS.TAKE: {
        const scope = this.formatScopeText(effect.target?.scope) || "Reserve";
        const phrase = this.formatTargetPhrase(effect.target);
        const countStr = count > 1 ? `${count} ` : "";
        return `Take ${countStr}${phrase} from ${scope}?`;
      }
      case AST_ACTIONS.TOPDECK: {
        const scope = this.formatScopeText(effect.target?.scope, { excludeInPlay: true });
        const scopeStr = scope ? ` from ${scope}` : "";
        const phrase = this.formatTargetPhrase(effect.target);
        return `Topdeck ${phrase}${scopeStr}?`;
      }
      case AST_ACTIONS.UNDERDECK: {
        const scope = this.formatScopeText(effect.target?.scope, { excludeInPlay: true });
        const scopeStr = scope ? ` from ${scope}` : "";
        const phrase = this.formatTargetPhrase(effect.target);
        return `Underdeck ${phrase}${scopeStr}?`;
      }
      case AST_ACTIONS.BOUNCE:
      case AST_ACTIONS.RETURN_TO_HAND: {
        const phrase = this.formatTargetPhrase(effect.target);
        return `Return ${phrase} to hand?`;
      }
      case AST_ACTIONS.PROTECT:
      case AST_ACTIONS.IMMUNE: {
        const phrase = this.formatTargetPhrase(effect.target);
        const clause = this.formatProtectionClause(effect.protection_filter);
        const verb = effect.action === AST_ACTIONS.IMMUNE ? "Grant immunity to" : "Protect";
        return `${verb} ${phrase}${clause ? ` ${clause}` : ""}?`;
      }
      default: {
        if (effect.target && Object.keys(effect.target).length > 0) {
          const cleanVerb = String(effect.action || "activate").replace(/_/g, " ").trim();
          const actLabel = cleanVerb.charAt(0).toUpperCase() + cleanVerb.slice(1);
          const phrase = this.formatTargetPhrase(effect.target);
          if (phrase) {
            return `${actLabel} ${phrase}?`;
          }
        }
        return `Activate ${cardName}'s optional ability?`;
      }
    }
  }

  /**
   * Strips canonical game-log card link markup ({{templateId|Card Name}}) to plain text.
   *
   * @param {string} text Raw log text.
   * @returns {string} Plain human-readable text.
   */
  static stripCardLinks(text) {
    if (!text || typeof text !== "string") return "";
    return text.replace(/\{\{[^|{}]+\|([^{}]+)\}\}/g, "$1").replace(/\s+/g, " ").trim();
  }

  /**
   * Produces a concise fallback label for cards without automated AST effect labels.
   *
   * @param {object} card Card instance.
   * @param {string} [actionType] Action type constant.
   * @returns {string} Concise label.
   */
  static formatTabletopFallbackLabel(card, actionType = "") {
    if (actionType === ActionType.ACTIVATE_STAR_ABILITY) {
      return "Star Ability";
    }
    const raw = (card?.SpecialAbility || card?.specialAbility || "").trim();
    if (!raw) return "Special Ability";
    const firstSentence = raw.split(/[.!?](?:\s|$)/)[0].trim();
    const candidate = firstSentence || raw;
    return candidate.length > 60 ? `${candidate.slice(0, 57)}...` : candidate;
  }
}

module.exports = { EffectLabelFormatter };
