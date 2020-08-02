const SourceQuery = require("./index");

const query = new SourceQuery("rust.kngsgaming.network", 28016, 10000);

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

process.on("uncaughtException", e => {
    console.log(e);
    process.exit(1);
});

process.on("unhandledRejection", e => {
    console.log(e);
    process.exit(1);
});