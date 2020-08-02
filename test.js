const SourceQuery = require("./index");

const query = new SourceQuery("rust.kngsgaming.network", 28016, 1000);

function Promise() {
    query.getInfo().then(info => {
        console.log(info);
        query.getPlayers().then(players => {
            console.log(players);
            query.getRules().then(info => {
                console.log(info);
            }, f3 => console.log("Third fail: ", f3));
        }, f2 => console.log("Second fail: ", f2));
    }, f1 => console.log("First fail: ", f1));
}

async function Async() {
    console.log(await query.getInfo());
    console.log(await query.getPlayers());
    console.log(await query.getRules());
}

Promise();