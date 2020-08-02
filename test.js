const SourceQuery = require("./index");

const query = new SourceQuery("rust.kngsgaming.network", 28016, 10000, false);

async function Test() {
    console.log(await query.getInfo());
    await (new Promise(resolve => setTimeout(resolve, 5000)));
    console.log(await query.getPlayers());
    await (new Promise(resolve => setTimeout(resolve, 5000)));
    console.log(await query.getRules());
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