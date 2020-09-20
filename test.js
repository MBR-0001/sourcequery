const SourceQuery = require("./index");

let servers = [
    "139.99.124.97:28075",
];

function TestServer(ip) {
    return new Promise((resolve, reject) => {
        let split = ip.split(":");
        const query = new SourceQuery(split[0], split[1], 1e3);

        let failed = [];

        query.getInfo().catch(() => failed.push("info")).finally(() => {
            query.getPlayers().catch(() => failed.push("players")).finally(() => {
                query.getRules().catch(() => failed.push("rules")).finally(() => {
                    if (failed.length == 0) resolve();
                    else reject(failed);
                });
            });
        });
    });
}

async function TestServers() {
    let failed = [];

    for (let server of servers) {
        await TestServer(server).catch(x => failed.push(server + " - " + x));
    }

    console.log("Test finished");
    if (failed.length > 0) {
        console.log("Failed:\n" + failed.join("\n"));
        process.exit(1);
    }
}

TestServers();

process.on("uncaughtException", e => {
    console.log(e);
    process.exit(1);
});

process.on("unhandledRejection", e => {
    console.log(e);
    process.exit(1);
});