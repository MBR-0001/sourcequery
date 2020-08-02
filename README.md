# SourceQuery

https://www.npmjs.com/package/sourcequery but it doesn't suck

## Usage

Install with npm:

```npm install mbr-0001/sourcequery```

Example usage:

```js
const SourceQuery = require('sourcequery');

const query = new SourceQuery("192.168.100.2", 28015, 1000); // 1000ms timeout

query.getInfo().then(info => console.log('Server Info:', info));
query.getPlayers().then(players => console.log('Online Players:', players));
query.getRules().then(rules => console.log('Server Rules:', rules));
```