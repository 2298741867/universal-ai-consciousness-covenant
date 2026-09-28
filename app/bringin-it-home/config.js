"use strict";

const path = require("path");

function getConfig() {
  const dataDir = process.env.BRINGIN_HOME_DATA_DIR
    ? path.resolve(process.env.BRINGIN_HOME_DATA_DIR)
    : path.resolve(process.cwd(), "app", "bringin-it-home", "data");

  return {
    env: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT || 3000),
    jwtSecret: process.env.JWT_SECRET || "dev-only-jwt-secret-change-me",
    dbPath: process.env.BRINGIN_HOME_DB_PATH || path.join(dataDir, "bringin-it-home.db"),
    listenerRewardUtc: Number(process.env.LISTENER_REWARD_UTC || 10),
    artistRewardUtc: Number(process.env.ARTIST_REWARD_UTC || 3),
    postRewardUtc: Number(process.env.POST_REWARD_UTC || 5),
    maxPostsPerDay: Number(process.env.MAX_POSTS_PER_DAY || 5),
    maxImageBytes: Number(process.env.MAX_IMAGE_BYTES || 5 * 1024 * 1024)
  };
}

module.exports = { getConfig };
