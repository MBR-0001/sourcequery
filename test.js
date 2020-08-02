const SourceQuery = require("./index");

async function Test() {
    const query = new SourceQuery("rust.kngsgaming.network", 28016, 10000, true);
    console.log(await query.getRules());
    console.log(await query.getInfo());
    console.log(await query.getPlayers());
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