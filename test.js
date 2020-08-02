const SourceQuery = require("./index");
const query = new SourceQuery("rust.kngsgaming.network", 28015, 1000);
query.getInfo().then(info => {
    console.log(info);
    query.getPlayers().then(players => {
        console.log(players);
        query.getRules().then(info => {
            console.log(info);
        }, f3 => console.log("Third fail: ", f3));
    }, f2 => console.log("Second fail: ", f2));
}, f1 => console.log("First fail: ", f1));