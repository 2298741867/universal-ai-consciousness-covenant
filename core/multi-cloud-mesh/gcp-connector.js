"use strict";

const { CloudProvider } = require("./cloud-provider");

class GCPConnector extends CloudProvider {
  constructor(config = {}) {
    super({ name: "gcp", region: config.region || "us-central1", weight: config.weight || 1 });
  }

  async deployModel(modelId) {
    return {
      provider: this.name,
      region: this.region,
      modelId,
      endpoint: `https://${modelId}.gcp.local`
    };
  }

  async routeMessage(message) {
    return {
      provider: this.name,
      routed: true,
      message
    };
  }
}

module.exports = {
  GCPConnector
};
