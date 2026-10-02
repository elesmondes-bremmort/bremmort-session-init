const MODULE_ID = "bremmort-session-init";

const logger = {
  info: (...args) => console.log(`[${MODULE_ID}]`, ...args),
  warn: (...args) => console.warn(`[${MODULE_ID}]`, ...args),
  error: (...args) => console.error(`[${MODULE_ID}]`, ...args),
};


// ============================================================================
// CONFIGURATION — STATUTS
// ============================================================================

const STATUS_ICON_RATIO = 0.30;
const STATUS_COUNTER_FONT_RATIO = 0.28;


// ============================================================================
// BAR BRAWL × CUSTOM SYSTEM BUILDER
// ============================================================================

function isBarBrawlAvailable() {
  const mod = game.modules.get("barbrawl");

  return !!(
    mod?.active &&
    typeof mod.api?.getBars === "function"
  );
}


function getModifiedProps(changes) {
  const props = changes?.system?.props;

  if (!props || typeof props !== "object") {
    return null;
  }

  return new Set(
    Object.keys(props)
  );
}


function shouldRefreshBarBrawlToken(
  token,
  modifiedKeys
) {

  if (
    !token ||
    !modifiedKeys ||
    !modifiedKeys.size
  ) {
    return false;
  }

  if (!isBarBrawlAvailable()) {
    return false;
  }


  const bars =
    game.modules
      .get("barbrawl")
      ?.api
      ?.getBars
      ?.(token.document);


  if (!Array.isArray(bars)) {
    return false;
  }


  for (const bar of bars) {

    if (
      !bar ||
      typeof bar !== "object"
    ) {
      continue;
    }


    // bar1 / bar2 sont déjà gérées nativement
    // par Foundry.
    if (
      bar.id === "bar1" ||
      bar.id === "bar2"
    ) {
      continue;
    }


    const attribute =
      typeof bar.attribute === "string"
        ? bar.attribute
        : "";


    if (
      !attribute.startsWith(
        "attributeBar."
      )
    ) {
      continue;
    }


    const key =
      attribute.replace(
        /^attributeBar\./,
        ""
      );


    if (modifiedKeys.has(key)) {
      return true;
    }
  }


  return false;
}


// ============================================================================
// STATUTS ADAPTATIFS
// ============================================================================

function normalizeStatusName(
  value = ""
) {

  return String(value)
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase();
}


function isBlessureEffect(effect) {

  return (
    normalizeStatusName(
      effect?.name
    ) === "blessure"
  );
}


function getStatusCounterData(effect) {

  return (
    effect
      ?.getFlag
      ?.("statuscounter")
    ??
    effect
      ?.flags
      ?.statuscounter
    ??
    null
  );
}


// ----------------------------------------------------------------------------
// Récupération des textes créés par Status Icon Counters
// ----------------------------------------------------------------------------

function collectStatusCounterTexts(
  token
) {

  const counters = [];


  function walk(node) {

    for (
      const child
      of node?.children ?? []
    ) {

      /*
       * Les sprites des effets vivent dans
       * token.effects.
       *
       * Status Icon Counters crée son propre
       * container ailleurs dans le Token.
       */

      if (child === token.effects) {
        continue;
      }


      if (
        typeof child?.text === "string" &&
        /^\d+$/.test(
          child.text.trim()
        )
      ) {

        counters.push(child);
      }


      walk(child);
    }
  }


  walk(token);

  return counters;
}


// ----------------------------------------------------------------------------
// Layout principal
// ----------------------------------------------------------------------------

function applyAdaptiveStatusLayout(
  token
) {

  if (
    !token?.effects?.children?.length
  ) {
    return;
  }


  const SHOW_ICON =
    CONST.ACTIVE_EFFECT_SHOW_ICON;


  // --------------------------------------------------------------------------
  // Effets réellement visibles selon la logique Foundry V14
  // --------------------------------------------------------------------------

  const visibleEffects =
    token.actor
      ?.appliedEffects
      ?.filter(effect => {

        const visible =
          effect.showIcon ===
            SHOW_ICON.ALWAYS
          ||
          (
            effect.showIcon ===
              SHOW_ICON.CONDITIONAL
            &&
            effect.isTemporary
          );


        const overlay =
          effect.flags
            ?.core
            ?.overlay;


        return (
          visible &&
          !overlay
        );
      })
    ?? [];


  if (!visibleEffects.length) {
    return;
  }


  // --------------------------------------------------------------------------
  // Sprites des statuts
  // --------------------------------------------------------------------------

  const sprites =
    token.effects.children
      .filter(
        child =>
          child !==
            token.effects.bg
          &&
          child !==
            token.effects.overlay
          &&
          child instanceof PIXI.Sprite
      )
      .sort(
        (a, b) =>
          (a.zIndex ?? 0)
          -
          (b.zIndex ?? 0)
      );


  if (!sprites.length) {
    return;
  }


  /*
   * Association effet ↔ sprite AVANT de modifier
   * l'ordre visuel.
   */

  const entries =
    visibleEffects
      .map(
        (effect, index) => ({
          effect,

          sprite:
            sprites[index],

          originalIndex:
            index
        })
      )
      .filter(
        entry =>
          entry.sprite
      );


  // --------------------------------------------------------------------------
  // Compteurs Status Icon Counters
  // --------------------------------------------------------------------------

  const counterTexts =
    collectStatusCounterTexts(
      token
    );


  const effectsWithVisibleCounter =
    visibleEffects.filter(
      effect => {

        const data =
          getStatusCounterData(
            effect
          );


        if (!data) {
          return false;
        }


        if (
          data.visible === false
        ) {
          return false;
        }


        const value =
          Number(
            data.value
          );


        return (
          Number.isFinite(value)
          &&
          value >= 1
        );
      }
    );


  /*
   * Association effet ↔ compteur AVANT de
   * déplacer Blessure.
   */

  const counterByEffectId =
    new Map();


  effectsWithVisibleCounter.forEach(
    (effect, index) => {

      const counter =
        counterTexts[index];


      if (counter) {

        counterByEffectId.set(
          effect.id,
          counter
        );
      }
    }
  );


  // --------------------------------------------------------------------------
  // Blessure toujours première
  // --------------------------------------------------------------------------

  entries.sort(
    (a, b) => {

      const aBlessure =
        isBlessureEffect(
          a.effect
        );


      const bBlessure =
        isBlessureEffect(
          b.effect
        );


      if (
        aBlessure &&
        !bBlessure
      ) {
        return -1;
      }


      if (
        !aBlessure &&
        bBlessure
      ) {
        return 1;
      }


      /*
       * Tous les autres statuts conservent
       * leur ordre Foundry.
       */

      return (
        a.originalIndex
        -
        b.originalIndex
      );
    }
  );


  // --------------------------------------------------------------------------
  // Dimensions
  // --------------------------------------------------------------------------

  /*
   * Largeur intrinsèque du token dans la grille.
   *
   * IMPORTANT :
   * on n'utilise pas token.bounds.width.
   *
   * Les bounds PIXI peuvent être influencées/recalculées
   * par les éléments graphiques autour du token, notamment
   * les statuts que nous déplaçons hors de son portrait.
   *
   * document.width × grid.size reste au contraire stable :
   * un token 4 cases reste toujours un token de 4 cases,
   * quel que soit son nombre de statuts ou son refresh.
   */

  const gridSize =
    canvas.grid?.size;


  const tokenWidth =
    token.document.width *
    gridSize;


  if (
    !Number.isFinite(tokenWidth)
    ||
    tokenWidth <= 0
  ) {
    return;
  }


  const iconSize =
    tokenWidth *
    STATUS_ICON_RATIO;


  const iconsPerRow =
    Math.max(
      1,

      Math.floor(
        tokenWidth /
        iconSize
      )
    );


  const counterFontSize =
    Math.max(
      12,

      iconSize *
      STATUS_COUNTER_FONT_RATIO
    );


  // --------------------------------------------------------------------------
  // Fond des statuts
  // --------------------------------------------------------------------------

  const bg =
    token.effects.bg;


  if (
    bg instanceof
      PIXI.Graphics
  ) {

    bg
      .clear()
      .beginFill(
        0,
        0.6
      )
      .lineStyle(
        1,
        0
      );
  }


  // --------------------------------------------------------------------------
  // Placement
  // --------------------------------------------------------------------------

  entries.forEach(
    (entry, index) => {

      const {
        effect,
        sprite
      } = entry;


      const row =
        Math.floor(
          index /
          iconsPerRow
        );


      const column =
        index %
        iconsPerRow;


      /*
       * Première ligne immédiatement
       * au-dessus du token.
       *
       * Les lignes supplémentaires montent.
       */

      const x =
        column *
        iconSize;


      const y =
        -(row + 1) *
        iconSize;


      // ----------------------------------------------------------------------
      // Icône
      // ----------------------------------------------------------------------

      sprite.width =
        iconSize;


      sprite.height =
        iconSize;


      sprite.position.set(
        x,
        y
      );


      if (
        bg instanceof
          PIXI.Graphics
      ) {

        bg.drawRoundedRect(
          x,
          y,
          iconSize,
          iconSize,
          2
        );
      }


      // ----------------------------------------------------------------------
      // Compteur
      // ----------------------------------------------------------------------

      const counter =
        counterByEffectId.get(
          effect.id
        );


      if (!counter) {
        return;
      }


      const margin =
        iconSize *
        0.08;


      /*
       * Status Icon Counters utilise une
       * ancre (1, 1).
       *
       * Le compteur est donc placé dans
       * le coin inférieur droit de l'icône.
       */

      counter.position.set(
        x +
          iconSize -
          margin,

        y +
          iconSize -
          margin
      );


      if (counter.style) {

        counter.style.fontSize =
          counterFontSize;
      }
    }
  );
}


// ============================================================================
// INITIALISATION
// ============================================================================

Hooks.once(
  "init",
  () => {

    logger.info(
      "Initialized."
    );


    // ------------------------------------------------------------------------
    // Wrapper statuts adaptatifs
    // ------------------------------------------------------------------------

    const libWrapperModule =
      game.modules.get(
        "lib-wrapper"
      );


    if (
      !libWrapperModule?.active
      ||
      typeof libWrapper ===
        "undefined"
    ) {

      logger.warn(
        "Adaptive status layout disabled: libWrapper is not active."
      );

      return;
    }


    const target =
      "foundry.canvas.placeables.Token.prototype._refreshEffects";


    try {

      libWrapper.register(
        MODULE_ID,
        target,

        function (
          wrapped,
          ...args
        ) {

          /*
           * On laisse d'abord Foundry,
           * Illandril et Status Icon Counters
           * effectuer leur traitement normal.
           */

          const result =
            wrapped(
              ...args
            );


          /*
           * Notre layout est appliqué en dernier.
           */

          applyAdaptiveStatusLayout(
            this
          );


          return result;
        },

        "WRAPPER"
      );


      logger.info(
        "Adaptive status layout registered."
      );

    } catch (error) {

      logger.error(
        "Failed to register adaptive status layout.",
        error
      );
    }
  }
);


// ============================================================================
// BAR BRAWL REFRESH
// ============================================================================

Hooks.on(
  "updateActor",
  (
    actor,
    changes,
    _options,
    _userId
  ) => {

    if (
      !actor ||
      !changes ||
      !canvas?.tokens
    ) {
      return;
    }


    const modifiedKeys =
      getModifiedProps(
        changes
      );


    if (
      !modifiedKeys ||
      !modifiedKeys.size
    ) {
      return;
    }


    for (
      const token
      of canvas.tokens.placeables
    ) {

      if (
        !token ||
        !token.document ||
        token.actor?.id !==
          actor.id
      ) {
        continue;
      }


      if (
        !shouldRefreshBarBrawlToken(
          token,
          modifiedKeys
        )
      ) {
        continue;
      }


      queueMicrotask(
        () => {

          /*
           * Le token peut avoir disparu entre
           * l'updateActor et la microtask.
           */

          if (
            !token?.renderFlags
            ||
            token.destroyed
          ) {
            return;
          }


          token.renderFlags.set({
            refreshBars: true
          });
        }
      );
    }
  }
);


// ============================================================================
// READY
// ============================================================================

Hooks.once(
  "ready",
  async () => {

    logger.info(
      "Ready."
    );


    logger.info(
      "CSB × Bar Brawl compatibility fix active."
    );


    logger.info(
      "Adaptive status layout active."
    );


    // ------------------------------------------------------------------------
    // Refresh initial des statuts de la scène déjà chargée
    // ------------------------------------------------------------------------

    if (canvas?.tokens) {

      for (
        const token
        of canvas.tokens.placeables
      ) {

        if (
          !token?.renderFlags
          ||
          token.destroyed
        ) {
          continue;
        }


        token.renderFlags.set({
          refreshEffects: true
        });
      }
    }


    // ------------------------------------------------------------------------
    // PRELOAD AUDIO
    // MJ uniquement
    // ------------------------------------------------------------------------

    if (!game.user?.isGM) {
      return;
    }


    const activeGM =
      game.users?.activeGM;


    const isActiveGM =
      !activeGM ||
      activeGM.id ===
        game.user.id;


    if (!isActiveGM) {

      logger.info(
        "Skipping playlist preload: current user is not the active GM."
      );

      return;
    }


    const playlists =
      game.playlists?.contents
      ?? [];


    const uniquePaths =
      new Set();


    let trackCount =
      0;


    for (
      const playlist
      of playlists
    ) {

      const sounds =
        playlist?.sounds
        ?? [];


      trackCount +=
        sounds.length;


      for (
        const sound
        of sounds
      ) {

        const path =
          sound?.path
          ??
          sound?.src
          ??
          sound?.document?.path
          ??
          sound?.document?.src;


        if (
          typeof path ===
            "string"
          &&
          path.trim()
        ) {

          uniquePaths.add(
            path.trim()
          );
        }
      }
    }


    logger.info(
      `Found ${playlists.length} playlists, ${trackCount} tracks, ${uniquePaths.size} unique audio files.`
    );


    const files =
      [...uniquePaths];


    if (!files.length) {

      logger.info(
        "Playlist preload completed: 0/0."
      );

      return;
    }


    const preloadOne =
      async file => {

        if (
          typeof game.audio
            ?.preload ===
            "function"
        ) {

          return game.audio.preload(
            file
          );
        }


        if (
          typeof AudioHelper
            ?.preload ===
            "function"
        ) {

          return AudioHelper.preload(
            file
          );
        }


        throw new Error(
          "No supported native audio preload API found in Foundry V14."
        );
      };


    // ------------------------------------------------------------------------
    // On conserve le fichier associé à chaque résultat.
    // ------------------------------------------------------------------------

    const results =
      await Promise.allSettled(
        files.map(
          async file => {

            await preloadOne(
              file
            );

            return file;
          }
        )
      );


    const failures =
      results
        .map(
          (result, index) => ({
            result,
            file:
              files[index]
          })
        )
        .filter(
          entry =>
            entry.result.status ===
              "rejected"
        );


    logger.info(
      `Playlist preload completed: ${files.length - failures.length}/${files.length}.`
    );


    if (
      failures.length
    ) {

      logger.warn(
        `Playlist preload failed for ${failures.length} file(s).`
      );


      for (
        const {
          file,
          result
        }
        of failures
      ) {

        logger.error(
          `Preload failure for ${file}`,
          result.reason
          ??
          result
        );
      }
    }
  }
);