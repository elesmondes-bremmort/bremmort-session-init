const MODULE_ID = "bremmort-session-init";

const logger = {
  info: (...args) => console.log(`[${MODULE_ID}]`, ...args),
  warn: (...args) => console.warn(`[${MODULE_ID}]`, ...args),
  error: (...args) => console.error(`[${MODULE_ID}]`, ...args),
};

function isBarBrawlAvailable() {
  const mod = game.modules.get("barbrawl");
  return !!(mod?.active && typeof mod.api?.getBars === "function");
}

function getModifiedProps(changes) {
  const props = changes?.system?.props;
  if (!props || typeof props !== "object") return null;
  return new Set(Object.keys(props));
}

function shouldRefreshBarBrawlToken(token, modifiedKeys) {
  if (!token || !modifiedKeys || !modifiedKeys.size) return false;
  if (!isBarBrawlAvailable()) return false;

  const bars = game.modules.get("barbrawl")?.api?.getBars?.(token.document);
  if (!Array.isArray(bars)) return false;

  for (const bar of bars) {
    if (!bar || typeof bar !== "object") continue;
    if (bar.id === "bar1" || bar.id === "bar2") continue;

    const attribute = typeof bar.attribute === "string" ? bar.attribute : "";
    if (!attribute.startsWith("attributeBar.")) continue;

    const key = attribute.replace(/^attributeBar\./, "");
    if (modifiedKeys.has(key)) return true;
  }

  return false;
}

Hooks.once("init", () => {
  logger.info("Initialized.");
});

Hooks.on("updateActor", (actor, changes, _options, _userId) => {
  if (!actor || !changes || !canvas?.tokens) return;

  const modifiedKeys = getModifiedProps(changes);
  if (!modifiedKeys || !modifiedKeys.size) return;

  for (const token of canvas.tokens.placeables) {
    if (!token || !token.document || token.actor?.id !== actor.id) continue;
    if (!shouldRefreshBarBrawlToken(token, modifiedKeys)) continue;

    queueMicrotask(() => {
      token.renderFlags.set({ refreshBars: true });
    });
  }
});

Hooks.once("ready", async () => {
  logger.info("Ready.");

  if (!game.user?.isGM) return;

  const activeGM = game.users?.activeGM;
  const isActiveGM = !activeGM || activeGM.id === game.user.id;
  if (!isActiveGM) {
    logger.info("Skipping playlist preload: current user is not the active GM.");
    return;
  }

  const playlists = game.playlists?.contents ?? [];
  const uniquePaths = new Set();
  let trackCount = 0;

  for (const playlist of playlists) {
    const sounds = playlist?.sounds ?? [];
    trackCount += sounds.length;

    for (const sound of sounds) {
      const path = sound?.path ?? sound?.src ?? sound?.document?.path ?? sound?.document?.src;
      if (typeof path === "string" && path.trim()) {
        uniquePaths.add(path.trim());
      }
    }
  }

  logger.info(`Found ${playlists.length} playlists, ${trackCount} tracks, ${uniquePaths.size} unique audio files.`);

  const files = [...uniquePaths];
  if (!files.length) {
    logger.info("Playlist preload completed: 0/0.");
    return;
  }

  const preloadOne = async (file) => {
    if (typeof game.audio?.preload === "function") {
      return game.audio.preload(file);
    }
    if (typeof AudioHelper?.preload === "function") {
      return AudioHelper.preload(file);
    }
    throw new Error("No supported native audio preload API found in Foundry V14.");
  };

  const results = await Promise.allSettled(files.map(preloadOne));
  const failures = results.filter((result) => result.status === "rejected");

  logger.info(`Playlist preload completed: ${files.length - failures.length}/${files.length}.`);

  if (failures.length) {
    logger.warn(`Playlist preload failed for ${failures.length} file(s).`);
    failures.forEach((failure, index) => {
      const file = files[index];
      logger.error(`Preload failure for ${file}`, failure.reason ?? failure);
    });
  }
});

Hooks.once("ready", () => {
  logger.info("CSB × Bar Brawl compatibility fix active.");
});
