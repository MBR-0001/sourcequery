const SourceQuery = require("./index");

async function Test() {
    const query = new SourceQuery("139.99.124.97", 28075, 5000, true);
    console.log((await query.getPlayers()).length);
    console.log(Object.keys(await query.getRules()).length);
    console.log(Object.keys(await query.getInfo()).length);
}

try { Test(); }
catch (ex) {
    console.log(ex);
    process.exit(1);
}

process.on("uncaughtException", e => {
    console.log(e);
    process.exit(1);
});

process.on("unhandledRejection", e => {
    console.log(e);
    process.exit(1);
});