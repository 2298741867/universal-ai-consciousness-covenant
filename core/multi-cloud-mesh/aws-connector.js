"use strict";

const { CloudProvider } = require("./cloud-provider");

class AWSConnector extends CloudProvider {
  constructor(config = {}) {
    super({ name: "aws", region: config.region || "us-east-1", weight: config.weight || 3 });
  }

  async deployModel(modelId) {
    return {
      provider: this.name,
      region: this.region,
      modelId,
      endpoint: `https://${modelId}.aws.local`
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
  AWSConnector
};
