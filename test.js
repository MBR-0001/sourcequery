const fetch = require("node-fetch");
const SourceQuery = require("./index");

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
    let servers = await fetch("https://api.mbr.pw/api/steamquery/tests").then(r => r.json());
    
    for (let server of servers) {
        if (server.address == "Unknown") {
            server.invalid = true;
            failed.push(server.name + " failed (no IP)");
        }
    }

    if (preflight) {
        for (let server of servers.filter(x => !x.invalid)) {
            let s = server.address.split(":");
            await SourceQuery.preflightCheck(s[0], s[1]).then(() => server.pass = true).catch(x => {
                if (server.broken.some(i => x.includes(i))) return;
                failed.push("Preflight failed for " + server.address + " (" + server.name + ") - " + x);
            });
        }
    }
    
    for (let server of servers.filter(x => !x.invalid && (x.pass || !preflight))) {
        console.log(server);
        await TestServer(server.address).then(x => { if (log) console.log(x); }).catch(x => failed.push(server.address + " (" + server.name + ") - " + x));
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