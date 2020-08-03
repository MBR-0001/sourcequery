const SourceQuery = require("./index");

async function Test() {
    const query = new SourceQuery("139.99.124.97", 28075, 5000, true);
    query.getPlayers().then(players => console.log("players: " + players.length));
    query.getRules().then(rules => console.log("rules: " + Object.keys(rules).length));
    query.getInfo().then(info => console.log("info: " + Object.keys(info).length));
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