"use strict";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scoreGradientUpdate({
  modelAccuracyImprovement = 0,
  dataVolumeWeight = 1,
  privacyPreserved = true,
}) {
  const qualityScore = Math.round(
    clamp(modelAccuracyImprovement * 2000, 0, 100) * clamp(dataVolumeWeight, 0.5, 2)
  );

  return clamp(privacyPreserved ? qualityScore : Math.floor(qualityScore / 2), 1, 100);
}

module.exports = {
  scoreGradientUpdate,
};
