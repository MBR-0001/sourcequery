const SourceQuery = require("./index");

async function Test() {
    const query = new SourceQuery("164.132.207.129", 28065, 10000, true);
    console.log((await query.getPlayers()).length);
    console.log(await query.getRules());
    console.log(await query.getInfo());
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