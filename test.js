const SourceQuery = require("./index");

function Test(ip = "139.99.124.97", port = 28075) {
    const query = new SourceQuery(ip, port, 5000, true);
    query.getPlayers().then(players => console.log(players, players.length));
    query.getRules().then(rules => console.log(rules));
    query.getInfo().then(info => console.log(info));
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