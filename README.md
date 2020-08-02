# SourceQuery
===========

https://www.npmjs.com/package/sourcequery but it doesn't suck

Usage
-----

Install with npm:

    npm install mbr-0001/sourcequery

Example usage:

```js
const SourceQuery = require('sourcequery');

const sq = new SourceQuery("192.168.100.2", 28015, 1000); // 1000ms timeout
sq.getInfo().then(info => console.log('Server Info:', info));
sq.getPlayers().then(players => console.log('Online Players:', players));
sq.getRules().then(rules => console.log('Server Rules:', rules));
```