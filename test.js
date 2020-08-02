const SourceQuery = require("./index");

const query = new SourceQuery("192.223.30.9", 28070, 1000);

async function Test() {
    console.log(await query.getInfo());
    console.log(await query.getPlayers());
    console.log(await query.getRules());
}

try { Test(); }
catch (ex) {
    console.log(ex);
    process.exit(1);
}