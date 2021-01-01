const SourceQuery = require("./index");

let servers = [
    "139.99.124.97:28075",
    "2.59.135.79:2303",
    //"216.52.148.47:27015",
    //"145.239.205.157:28016"
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

async function TestServers(log = false, preflight = false) {
    console.log("Starting test, CI: " + !!process.env.CI);

    let failed = [];

    if (preflight) {
        for (let server of servers) {
            let s = server.split(":");
            await SourceQuery.preflightCheck(s[0], s[1]).catch(x => failed.push(server + " - " + x));
        }
    }
    
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
else if (last == "preflight") TestServers(false, true);
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