const fs = require("fs/promises");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "users.json");

let cache = null;
let writeChain = Promise.resolve();

async function load() {
  if (cache) {
    return cache;
  }
  let data;
  try {
    const raw = await fs.readFile(dataPath, "utf8");
    data = JSON.parse(raw);
  } catch (err) {
    data = null;
  }
  if (!data || typeof data !== "object") data = {};
  if (!Array.isArray(data.users)) data.users = [];
  cache = data;
  return cache;
}

async function save(store) {
  cache = store;
  const payload = JSON.stringify({ users: store.users }, null, 2);
  writeChain = writeChain.then(() => fs.writeFile(dataPath, payload, "utf8"));
  return writeChain;
}

function invalidate() {
  cache = null;
}

module.exports = {
  load,
  save,
  invalidate,
  dataPath,
};
