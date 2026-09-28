"use strict";

const { createApp } = require("./app");

const app = createApp();
const { port } = app.locals.config;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Bringin' It Home API listening on http://localhost:${port}`);
});
