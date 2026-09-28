"use strict";

class MeshRouter {
  constructor() {
    this.providers = [];
    this.cursor = 0;
  }

  registerProvider(provider) {
    this.providers.push(provider);
  }

  async getHealthyProviders() {
    const checks = await Promise.allSettled(
      this.providers.map(async (provider) => ({
        provider,
        healthy: await provider.healthCheck()
      }))
    );

    return checks
      .filter((check) => check.status === "fulfilled" && check.value.healthy)
      .map((check) => check.value.provider);
  }

  async routeAICPMessage(message) {
    if (!message || typeof message !== "object") {
      throw new Error("AICP message is required.");
    }

    const healthy = await this.getHealthyProviders();
    if (healthy.length === 0) {
      throw new Error("No healthy cloud providers available.");
    }

    const weighted = healthy.flatMap((provider) =>
      Array.from({ length: Math.max(1, provider.weight || 1) }, () => provider)
    );

    const selectedIndex = this.cursor % weighted.length;
    const selected = weighted[selectedIndex];
    this.cursor += 1;

    const attempted = new Set();
    let lastError;

    for (let offset = 0; offset < weighted.length; offset += 1) {
      const candidate = weighted[(selectedIndex + offset) % weighted.length];
      if (attempted.has(candidate)) {
        continue;
      }
      attempted.add(candidate);

      try {
        const routed = await candidate.routeMessage(message);
        return {
          selectedProvider: candidate.name,
          selectedRegion: candidate.region,
          routed
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      `Unable to route AICP message across healthy providers: ${lastError?.message || "unknown error"}`
    );
  }

  async deployModelEverywhere(modelId) {
    const healthy = await this.getHealthyProviders();
    const results = await Promise.all(healthy.map((provider) => provider.deployModel(modelId)));

    return {
      deployedProviders: healthy.map((provider) => provider.name),
      deployments: results
    };
  }
}

module.exports = {
  MeshRouter
};
