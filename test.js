const SourceQuery = require("./index");

let servers = [
    "87.98.228.196:27040",
    "139.99.124.97:28075",
    "2.59.135.79:2303",
    "51.81.124.130:28015"
];

async function TestServer(ip) {
    let split = ip.split(":");
    const query = new SourceQuery(split[0], split[1], process.env.CI_TIMEOUT || 5e3);

    let failed = [];
    let rv = {};

    rv.info = await query.getInfo().catch(() => failed.push("info"));
    rv.players = await query.getPlayers().catch(() => failed.push("players"));
    rv.rules = await query.getRules().catch(() => failed.push("rules"));

    if (failed.length == 0) return rv;
    else throw failed;
}

async function TestServers(log = false) {
    console.log("Starting test, CI: " + !!process.env.CI);
    let failed = [];

    for (let server of servers) {
        await TestServer(server).then(x => { if (log) console.log(x); }).catch(x => failed.push(server + " - " + x));
    }

    console.log("Test finished");
    if (failed.length > 0) {
        console.log("Failed:\n" + failed.join("\n"));
        process.exit(1);
    }
}

let last = process.argv[process.argv.length - 1];
if (last == __filename) TestServers();
else if (last == "log") TestServers(true);
else TestServer(last).then(o => {
    console.log(o);
    //for (let p of o.players) console.log(p);
}, failed => console.log(failed));


process.on("uncaughtException", e => {
    console.log(e);
    process.exit(1);
});

process.on("unhandledRejection", e => {
    console.log(e);
    process.exit(1);
});