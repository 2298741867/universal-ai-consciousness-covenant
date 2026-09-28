"use strict";

const { CloudProvider } = require("./cloud-provider");

class AzureConnector extends CloudProvider {
  constructor(config = {}) {
    super({ name: "azure", region: config.region || "eastus", weight: config.weight || 2 });
  }

  async deployModel(modelId) {
    return {
      provider: this.name,
      region: this.region,
      modelId,
      endpoint: `https://${modelId}.azure.local`
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
  AzureConnector
};
