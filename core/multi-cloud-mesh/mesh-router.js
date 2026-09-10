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
    const checks = await Promise.all(
      this.providers.map(async (provider) => ({
        provider,
        healthy: await provider.healthCheck()
      }))
    );

    return checks.filter((check) => check.healthy).map((check) => check.provider);
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

    const selected = weighted[this.cursor % weighted.length];
    this.cursor += 1;

    const routed = await selected.routeMessage(message);
    return {
      selectedProvider: selected.name,
      selectedRegion: selected.region,
      routed
    };
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
