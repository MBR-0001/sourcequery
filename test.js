const SourceQuery = require("./index");
const legacy = require("./legacy");

async function Test() {
    const query = new SourceQuery("rust.kngsgaming.network", 28016, 10000, true);
    console.log((await query.getPlayers()).length);
    console.log(await query.getRules());
    console.log(await query.getInfo());
}

function Test2() {
    const query = new legacy(10000);
    query.open("rust.kngsgaming.network", 28016);
    query.getPlayers((err, p) => console.log(err, p));
    query.close();
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